const { EventEmitter } = require('events');
const crypto = require("crypto");

class SocketDevice extends EventEmitter {
    #deviceId;
    #deviceName;
    #deviceType;
    #connected = false;
    #found = false;
    #outgoingSockets = new Set();
    #incomingSockets = new Set();
    queuedMessageIds = [];
    queuedStreamDataIds = [];
    #remoteAdvertisedIps = new Set();
    #remotePort = -1;
    #lastSeenVersion = -1;

    constructor(deviceId, deviceType, deviceName) {
        super();
        this.#deviceId = deviceId;
        this.#deviceType = deviceType;
        this.#deviceName = deviceName;
    }

    get deviceId() {
        return this.#deviceId;
    }

    get deviceName() {
        return this.#deviceName;
    }

    get deviceType() {
        return this.#deviceType;
    }

    getRemoteAdvertisedIps() {
        return Array.from(this.#remoteAdvertisedIps);
    }

    getRemotePort() {
        return this.#remotePort;
    }

    destroyAllSockets(reason = 'network') {
        console.log(`Destroying all sockets for device ${this.#deviceId} (reason: ${reason})`);
        const outgoing = [...this.#outgoingSockets];
        const incoming = [...this.#incomingSockets];
        this.#outgoingSockets.clear();
        this.#incomingSockets.clear();

        outgoing.forEach(socket => socket.destroy(new Error("Device is being unpaired.")));
        incoming.forEach(socket => socket.destroy(new Error("Device is being unpaired.")));

        const wasConnectedOrConnecting = this.#connected || this.#found;
        this.#connected = false;
        this.#found = false;

        if (wasConnectedOrConnecting) {
            this.emit('deviceDisconnected', this, { reason });
        }
    }

    hasIncomingSocket(socket) {
        return this.#incomingSockets.has(socket);
    }

    updateRemoteInfo(ips, port, version, name) {
        if (version > -1 && version <= this.#lastSeenVersion) return;

        if (version > -1) {
            console.log(`Updating remote info for ${this.#deviceId} to v${version}.`);
            this.#lastSeenVersion = version;
        }
        if (port > -1) this.#remotePort = port;
        if (name) this.#deviceName = name;
        if (ips && ips.length > 0) {
            this.#remoteAdvertisedIps.clear();
            ips.forEach(ip => this.#remoteAdvertisedIps.add(ip));
        }

        this.emit('infoUpdated', this); // Emit event for dynamic IP updates

        // REMOVED: This loop was too aggressive. The socket's own keep-alive
        // mechanism is responsible for detecting if a specific path is truly dead.
        // Pruning connections based on a Bonjour update can cause false disconnects
        // if the update arrives before the keep-alive has a chance to fail on another,
        // still-active connection.
        /*
        for (const socket of this.#outgoingSockets) {
            if (socket.remoteAddress && !this.#remoteAdvertisedIps.has(socket.remoteAddress)) {
                socket.destroy(new Error("Stale connection path pruned."));
            }
        }
        */
    }

    #checkIfShouldFireEvent(reason = 'network') {
        const readyOutgoing = this.getReadyOutgoingSocketsCount();
        const readyIncoming = this.getReadyIncomingSocketsCount();
        const totalReady = readyOutgoing + readyIncoming;

        if (!this.#found && totalReady > 0) {
            this.#found = true;
            this.emit('deviceFound', this);
        }

        if ((this.#connected || this.#found) && totalReady === 0) {
            const wasActive = this.#connected || this.#found;
            this.#connected = false;
            this.#found = false;
            if (wasActive) {
                this.emit('deviceDisconnected', this, { reason });
            }
        } else if (!this.#connected && readyOutgoing > 0 && readyIncoming > 0) {
            this.#connected = true;
            this.emit('deviceConnected', this);
        }
    }

    #handleIncomingSocketMessage(socket, payload) {
        if (typeof payload === 'object' && payload !== null && 'messageId' in payload) {
            if (this.queuedMessageIds.includes(payload.messageId)) {
                return;
            }
            this.queuedMessageIds.push(payload.messageId);
            // MODIFICATION: Pass the remote address of the socket with the event.
            this.emit('message', payload.data, this, socket.remoteAddress);
        }
    }

    #handleSocketServiceUpdate(socket, serviceData) {
        const { addresses, port, version } = serviceData;
        if (addresses && port !== undefined && version !== undefined) {
            this.updateRemoteInfo(addresses, port, version);
        }
    }

    #handleSocketClose(socket, isIncoming) {
        const set = isIncoming ? this.#incomingSockets : this.#outgoingSockets;
        const wasPresent = set.delete(socket);
        if (wasPresent) {
            this.#checkIfShouldFireEvent('network');
        }
    }

    #handleManualDisconnect(socket, payload) {
        console.log(`[SocketDevice] Received manual disconnect from ${this.#deviceId}: ${payload.reason}`);
        this.emit('manualDisconnect', this, payload.reason);
    }

    #handleOutgoingSocketConnect(socket) {
        this.emit('outgoingConnect', socket);
        this.#checkIfShouldFireEvent();
    }

    addIncomingSocket(socket) {
        this.#incomingSockets.add(socket);
        console.log('Incoming Sockets: ', this.#incomingSockets.size, 'Outgoing Sockets: ', this.#outgoingSockets.size);
        socket.on('close', () => this.#handleSocketClose(socket, true));
        socket.on('error', (err) => {
            if (err && err.message === 'Device is being unpaired.') {
                return;
            }
            this.emit('error', err);
        });
        socket.on('message', (payload) => this.#handleIncomingSocketMessage(socket, payload));
        socket.on('serviceUpdate', (data) => this.#handleSocketServiceUpdate(socket, data));
        socket.on('connect', () => this.#checkIfShouldFireEvent());
        socket.on('disconnect', (payload) => this.#handleManualDisconnect(socket, payload));
        socket.on('streamData', (data) => this.emit('streamData', data, this, socket.remoteAddress));
        if (socket.connected) this.#checkIfShouldFireEvent();
    }

    addOutgoingSocket(socket) {
        this.#outgoingSockets.add(socket);
        console.log('Incoming Sockets: ', this.#incomingSockets.size, 'Outgoing Sockets: ', this.#outgoingSockets.size);
        socket.on('close', () => this.#handleSocketClose(socket, false));
        socket.on('error', (err) => {
            if (!err || !err.message) return;

            // If the error is a rejection/cancellation, treat it as a disconnect.
            if (err.message.includes('Pairing rejected') || err.message.includes('Pairing canceled')) {
                this.#found = false;
                this.#connected = false;
                this.emit('deviceDisconnected', this, { reason: 'remote' });
                return; // Stop further processing of this error.
            }

            if (err.message === 'Device is being unpaired.') {
                return;
            }

            this.emit('error', err);
        });
        socket.on('connect', () => this.#handleOutgoingSocketConnect(socket));
        socket.on('disconnect', (payload) => this.#handleManualDisconnect(socket, payload));
        socket.on('streamData', (data) => this.emit('streamData', data, this, socket.remoteAddress));
        if (socket.connected) this.#handleOutgoingSocketConnect(socket);
    }

    getReadyOutgoingSocketsCount() {
        return [...this.#outgoingSockets].filter(s => s.connected).length;
    }

    getReadyIncomingSocketsCount() {
        return [...this.#incomingSockets].filter(s => s.connected).length;
    }

    getReadySocketsCount() {
        return this.getReadyOutgoingSocketsCount() + this.getReadyIncomingSocketsCount();
    }

    hasConnectionTo(address, port) {
        return [...this.#outgoingSockets].some(s => s.remoteAddress === address && s.remotePort === port && !s.destroyed);
    }

    sendMessage(data) {
        const id = crypto.randomUUID();
        this.#outgoingSockets.forEach(s => s.connected && s.send({ data, messageId: id }));
    }

    sendDisconnectMessage(reason) {
        this.#outgoingSockets.forEach(s => s.connected && s.sendDisconnect(reason));
    }

    sendPairingRejection(reason) {
        this.#outgoingSockets.forEach(s => s.sendPairingRejection(reason));
    }

    sendStreamData(data) {
        const id = crypto.randomUUID();
        this.#outgoingSockets.forEach(s => s.connected && s.sendStreamData({ data, streamDataId: id }));
    }

    sendServiceData(data, specificSocket) {
        if (specificSocket) {
            if (specificSocket.connected && this.#outgoingSockets.has(specificSocket)) specificSocket.sendServiceUpdate(data);
        } else {
            this.#outgoingSockets.forEach(s => s.connected && s.sendServiceUpdate(data));
        }
    }
}

module.exports = { SocketDevice };

