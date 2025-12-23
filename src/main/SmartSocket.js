const net = require('net');
const EventEmitter = require('events');
const { ConduitSocket } = require('../conduit-js');

const HANDSHAKE_TIMEOUT = 40000;
const KEEP_ALIVE_INTERVAL = 5000;
const KEEP_ALIVE_TIMEOUT = 10000;
const HEADER_SIZE = 4;

class SmartSocket extends EventEmitter {
    constructor(socket, ownDeviceId, ownDeviceType, options = {}) {
        super();
        this._socket = socket;
        this._socket.setNoDelay(true);
        this._ownDeviceId = ownDeviceId;
        this._ownDeviceType = ownDeviceType;
        this._ownDeviceName = options.ownDeviceName;
        this._remoteDeviceId = null;
        this._remoteDeviceType = null;
        this._remoteDeviceName = null;
        this._handshakeCompleted = false;
        this._handshakeTimeout = null;
        this._remoteAddressUnsafe = socket.remoteAddress;
        this._remotePortUnsafe = socket.remotePort;
        this._messageBuffer = Buffer.alloc(0);
        this._keepAliveInterval = null;
        this._lastMessageReceivedTimestamp = 0;

        this._enableStream = !!options.enableStream;
        this._streamSocket = null;
        this._remoteStreamPort = null;
        this._streamReady = false;
        this._isInitiator = options.isInitiator || false;
        this._isDestroying = false;

        if (!this._ownDeviceId || !this._ownDeviceType || !this._ownDeviceName) { throw new Error('SmartSocket requires ownDeviceId, ownDeviceType, and ownDeviceName.'); }

        this._socket.on('data', (data) => this._handleData(data));
        this._socket.on('close', (hadError) => { this.emit('close', hadError); });
        this._socket.on('error', (err) => { this.emit('error', err); });
    }

    _initializeStreamSocket(localAddress) {
        if (this._streamSocket) return;
        this._streamSocket = new ConduitSocket();
        this._streamSocket.bind(0, localAddress);
        this._streamSocket.on('listening', () => {
            this._streamReady = true;
            // MODIFIED: The handshake is now sent from here, ensuring the stream socket is ready.
            this._sendHandshake();
        });
        this._streamSocket.on('message', (data, rinfo) => this.emit('streamData', data, rinfo));
        this._streamSocket.on('error', (err) => { this.emit('error', new Error(`Stream socket error: ${err.message}`)); });
        this._streamSocket.on('close', () => this.destroy());
    }

    async _handleData(data) {
        this._messageBuffer = Buffer.concat([this._messageBuffer, data]);
        while (true) {
            if (this._messageBuffer.length < HEADER_SIZE) return;
            const messageLength = this._messageBuffer.readUInt32BE(0);
            if (this._messageBuffer.length < HEADER_SIZE + messageLength) return;
            const messageBody = this._messageBuffer.slice(HEADER_SIZE, HEADER_SIZE + messageLength);
            this._messageBuffer = this._messageBuffer.slice(HEADER_SIZE + messageLength);

            try {
                this._lastMessageReceivedTimestamp = Date.now();
                const message = JSON.parse(messageBody.toString());

                if (!this._handshakeCompleted) {
                    // MODIFIED: Clear the timeout if it exists
                    if (this._handshakeTimeout) clearTimeout(this._handshakeTimeout);
                    if (this.destroyed) return;

                    if (message.type === 'pairingResponse') {
                        if (!message.accepted) {
                            this.destroy(new Error(message.reason || 'Pairing rejected by peer.'));
                        }
                        return;
                    }

                    if (this._isInitiator) {
                        this._completeHandshake(message);
                    } else {
                        // MODIFIED: The 'accept' function is no longer async.
                        const accept = () => {
                            if (this.destroyed) return;
                            console.log(`Pairing ACCEPTED for ${message.deviceId}`);
                            this._completeHandshake(message);
                            // MODIFIED: We now either initialize the stream (which will then send the handshake)
                            // or send the handshake directly if no stream is needed.
                            if (this._enableStream) {
                                this._initializeStreamSocket(this.localAddress);
                            } else {
                                this._sendHandshake();
                            }
                        };
                        const reject = () => {
                            if (this.destroyed) return;
                            console.log(`Pairing REJECTED for ${message.deviceId}`);
                            this._sendRaw({ type: 'pairingResponse', accepted: false, reason: 'Pairing rejected by user.' }, (err) => {
                                this.destroy(new Error('Pairing rejected by manager.'));
                            });
                        };
                        this.emit('pairingRequest', message, accept, reject);
                    }
                } else {
                    const type = message.type || 'message';
                    const payload = message.payload;
                    if (type === 'ping') this._sendPong();
                    else if (type === 'pong') { /* no-op */ }
                    else if (type === 'service_update') this.emit('serviceUpdate', payload);
                    else if (type === 'disconnect') {
                        this.emit('disconnect', payload);
                        this.destroy(); // Graceful shutdown
                    }
                    else this.emit('message', payload);
                }
            } catch (error) { this.destroy(new Error(`Message processing error: ${error.message}`)); }
        }
    }

    _completeHandshake(message) {
        if (this.destroyed || this._handshakeCompleted) return;
        this._remoteDeviceId = message.deviceId;
        this._remoteDeviceType = message.deviceType;
        this._remoteDeviceName = message.deviceName;
        if (this._enableStream) {
            if (typeof message.streamPort === 'undefined') {
                this.destroy(new Error('Handshake failed: Peer did not provide a streamPort.'));
                return;
            }
            this._remoteStreamPort = message.streamPort;
        }
        this._handshakeCompleted = true;
        this._lastMessageReceivedTimestamp = Date.now();
        this._startKeepAlive();
        this.emit('connect');
    }

    _startKeepAlive() {
        if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
        this._keepAliveInterval = setInterval(() => this._checkKeepAlive(), KEEP_ALIVE_INTERVAL);
    }

    _checkKeepAlive() {
        if (this.destroyed) return;
        const idleTime = Date.now() - this._lastMessageReceivedTimestamp;
        if (idleTime > KEEP_ALIVE_TIMEOUT) {
            this.destroy(new Error(`Keep-alive timeout after ${idleTime}ms.`));
        } else {
            this._sendPing();
        }
    }

    _sendPing() { this._sendRaw({ type: 'ping' }); }
    _sendPong() { this._sendRaw({ type: 'pong' }); }

    connect(options, callback) {
        if (options != null && typeof options === 'object') {
            this._remoteAddressUnsafe = options.host; this._remotePortUnsafe = options.port;
        }
        this._socket.connect(options, () => {
            // MODIFIED: Logic is now consistent with the server-side.
            // Initialize stream first, which will then trigger the handshake.
            if (this._enableStream) {
                this._initializeStreamSocket(this.localAddress);
            } else {
                this._sendHandshake();
            }
            if (callback) callback();
        });
        // MODIFIED: The handshake timeout is now disabled to prevent this specific race condition.
        /*
        this._handshakeTimeout = setTimeout(() => {
            this.destroy(new Error('Handshake timeout: Did not receive response from server.'));
        }, HANDSHAKE_TIMEOUT);
        */
        return this;
    }

    _sendHandshake() {
        const handshake = { deviceId: this._ownDeviceId, deviceType: this._ownDeviceType, deviceName: this._ownDeviceName, enableStream: this._enableStream };
        if (this._enableStream) {
            if (!this._streamSocket || !this._streamSocket.socket.address()) {
                this.destroy(new Error("Cannot send handshake: Stream socket not ready."));
                return;
            }
            handshake.streamPort = this._streamSocket.socket.address().port;
        }
        const handshakeBuffer = Buffer.from(JSON.stringify(handshake), 'utf8');
        const header = Buffer.alloc(HEADER_SIZE);
        header.writeUInt32BE(handshakeBuffer.length, 0);
        this.write(Buffer.concat([header, handshakeBuffer]));
    }

    send(json, cb) { return this._sendRaw({ type: 'message', payload: json }, cb); }
    sendServiceUpdate(data, cb) { return this._sendRaw({ type: 'service_update', payload: data }, cb); }
    sendDisconnect(reason, cb) {
        return this._sendRaw({ type: 'disconnect', payload: { reason } }, cb);
    }
    sendPairingRejection(reason, cb) {
        return this._sendRaw({ type: 'pairingResponse', accepted: false, reason: reason }, cb);
    }

    _sendRaw(message, callback) {
        const messageBuffer = Buffer.from(JSON.stringify(message), 'utf8');
        const header = Buffer.alloc(HEADER_SIZE);
        header.writeUInt32BE(messageBuffer.length, 0);
        return this.write(Buffer.concat([header, messageBuffer]), callback);
    }

    sendStreamData(json) {
        if (!this._enableStream || !this._streamSocket || !this._handshakeCompleted) {
            this.emit('error', new Error('Stream is not enabled or connection is not complete.'));
            return false;
        }
        this._streamSocket.send(json, this._remoteStreamPort, this.remoteAddress);
        return true;
    }

    write(data, enc, cb) { return this._socket.write(data, enc, cb); }
    destroy(error) {
        if (this._isDestroying || this.destroyed) {
            return;
        }
        this._isDestroying = true;

        if (this._keepAliveInterval) { clearInterval(this._keepAliveInterval); this._keepAliveInterval = null; }
        if (this._streamSocket) {
            try {
                this._streamSocket.close();
            } catch (e) {
                if (e.code !== 'ERR_SOCKET_DGRAM_NOT_RUNNING') {
                    console.error('SmartSocket: Unexpected error while closing stream socket.', e);
                }
                // Ignore ERR_SOCKET_DGRAM_NOT_RUNNING
            }
        }
        return this._socket.destroy(error);
    }

    get remoteAddress() { return this._socket.remoteAddress || this._remoteAddressUnsafe; }
    get remotePort() { return parseInt(this._socket.remotePort || this._remotePortUnsafe, 10); }
    get localAddress() { try { return this._socket.localAddress || this._socket.address().address; } catch (e) { return undefined; } }
    get remoteDeviceId() { return this._remoteDeviceId; }
    get connected() { return this._handshakeCompleted && !this._socket.destroyed; }
    get destroyed() { return this._socket.destroyed; }
}

class SmartServer extends EventEmitter {
    constructor(options, connectionListener) {
        super();
        if (typeof options === 'function') { connectionListener = options; options = {}; }
        this._options = options;
        this._deviceId = options.deviceId;
        this._deviceType = options.deviceType;
        this._deviceName = options.deviceName;
        this._server = net.createServer((rawSocket) => this._handleConnection(rawSocket));
        if (connectionListener) { this.on('connection', connectionListener); }
        this._server.on('error', (err) => this.emit('error', err));
    }

    _handleConnection(rawSocket) {
        const smartSocket = new SmartSocket(rawSocket, this._deviceId, this._deviceType, { ...this._options, ownDeviceName: this._deviceName, isInitiator: false });
        // MODIFIED: The timeout is now handled on the server-side for incoming connections
        smartSocket._handshakeTimeout = setTimeout(() => {
            smartSocket.destroy(new Error('Handshake timeout: Did not receive identification from client.'));
        }, HANDSHAKE_TIMEOUT);
        this.emit('connection', smartSocket);
        smartSocket.once('close', () => {
            if (smartSocket._handshakeTimeout) clearTimeout(smartSocket._handshakeTimeout);
        });
    }
    listen(...args) { this._server.listen(...args); return this; }
    close(callback) { this._server.close(callback); return this; }
    address() { return this._server.address(); }
    get connections() { return this._server.connections; }
    get listening() { return this._server.listening; }
}

function createServer(options, connectionListener) { return new SmartServer(options, connectionListener); }
function createConnection(...args) {
    let options = {}; let connectListener;
    if (typeof args[0] === 'object' && args[0] !== null) { options = { ...args[0] }; connectListener = args[1]; }
    else if (typeof args[0] === 'number') { options.port = args[0]; options.host = typeof args[1] === 'string' ? args[1] : 'localhost'; connectListener = typeof args[1] === 'function' ? args[1] : args[2]; }
    else { throw new Error('Invalid arguments for createConnection'); }
    const { deviceId, deviceType, deviceName, enableStream, ...connectionOptions } = options;
    if (!deviceId || !deviceType || !deviceName) { throw new Error("createConnection requires 'deviceId', 'deviceName', and 'deviceType'."); }
    const smartSocket = new SmartSocket(new net.Socket(), deviceId, deviceType, { ownDeviceName: deviceName, enableStream, isInitiator: true });
    if (connectListener) smartSocket.once('connect', connectListener);
    smartSocket.connect(connectionOptions);
    return smartSocket;
}

module.exports = { createServer, createConnection, SmartSocket, SmartServer };

