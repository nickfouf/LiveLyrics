const EventEmitter = require('events');
const net = require("./SmartSocket.js");
const dgram = require('dgram'); // Added
const os =require('os');
const { Bonjour } = require('bonjour-service');
const crypto = require('crypto');
const { SocketDevice } = require("./SocketDevice.js");
const { performance } = require('perf_hooks');

const PAIRING_REQUEST_TIMEOUT = 35000;
const DISCOVERY_PORT = 54321; // Added: Fixed port for UDP discovery

class RTTStats {
    static MAX_SAMPLES = 20;
    samples = [];
    average = 0;

    addSample(rtt) {
        if (this.samples.length >= RTTStats.MAX_SAMPLES) {
            this.samples.shift();
        }
        this.samples.push(rtt);
        const sum = this.samples.reduce((a, b) => a + b, 0);
        this.average = sum / this.samples.length;
    }
}

class ConnectionManager extends EventEmitter {
    #bonjour = null;
    #server = null;
    #browser = null;
    #publishedService = null;
    #lastPublishedIPs = [];
    #devices = new Map();
    #networkMonitor; 
    #deviceId = 'unknown';
    #deviceName = 'Unknown Device';
    #clientType = 'unknown';
    #serviceVersion = 0;
    #connectionMaintainerInterval = null;
    #syncInterval = null;
    #pairedDevice = null; 
    #rttStats = new Map();
    #pendingUiPairingRequests = new Set();
    
    // Added: Discovery socket reference
    #discoverySocket = null;

    get deviceId() { return this.#deviceId; }
    get deviceName() { return this.#deviceName; }

    getRttStats() {
        return this.#rttStats;
    }

    canPairWith(type) {
        return (this.#clientType === 'main' && type === 'connector') || (this.#clientType === 'connector' && type === 'main');
    }

    constructor(options = {}) {
        super();
        if (!options.deviceId || !options.clientType || !options.deviceName) {
            throw new Error("ConnectionManager requires deviceId, deviceName, and clientType.");
        }
        this.#deviceId = options.deviceId;
        this.#deviceName = options.deviceName;
        this.#clientType = options.clientType;
    }

    start() {
        if (this.#bonjour) {
            console.log('[ConnectionManager] Start called, but manager is already running.');
            return;
        }
        console.log('[ConnectionManager] Starting network services...');
        
        // Added: Start UDP discovery listener
        this.#startDiscoverySocket();

        this.#bonjour = new Bonjour();

        this.#startServerAndPublish();

        this.#browser = this.#bonjour.find({ type: 'livelyrics' });
        this.#browser.on('up', this.#handleServiceUp.bind(this));
        this.#browser.on('down', this.#handleServiceDown.bind(this));
    }

    stop() {
        if (!this.#bonjour) {
            console.log('[ConnectionManager] Stop called, but manager is already stopped.');
            return;
        }
        console.log('[ConnectionManager] Stopping network services...');

        // Added: Close UDP discovery socket
        if (this.#discoverySocket) {
            try {
                this.#discoverySocket.close();
            } catch (e) {
                console.error('[ConnectionManager] Error closing discovery socket:', e);
            }
            this.#discoverySocket = null;
        }

        if (this.#connectionMaintainerInterval) {
            clearInterval(this.#connectionMaintainerInterval);
            this.#connectionMaintainerInterval = null;
        }
        if (this.#syncInterval) {
            clearInterval(this.#syncInterval);
            this.#syncInterval = null;
        }

        if (this.#browser) {
            this.#browser.stop();
            this.#browser = null;
        }

        if (this.#pairedDevice) {
            this.disconnectFromPairedDevice();
        }
        this.#devices.clear();

        if (this.#publishedService) {
            this.#publishedService.stop(() => {
                this.#publishedService = null;
                console.log('[ConnectionManager] Bonjour service unpublished.');
            });
        }

        if (this.#server && this.#server.listening) {
            this.#server.close(() => {
                this.#server = null;
                console.log('[ConnectionManager] Server closed.');
            });
        }

        this.#bonjour.destroy();
        this.#bonjour = null;
    }

    // Added: Initialize and bind UDP discovery socket
    #startDiscoverySocket() {
        try {
            this.#discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            
            this.#discoverySocket.on('error', (err) => {
                console.error(`[DiscoverySocket] Server error:\n${err.stack}`);
                try { this.#discoverySocket.close(); } catch(e) {}
            });

            this.#discoverySocket.on('message', (msg, rinfo) => {
                this.#handleDiscoveryMessage(msg, rinfo);
            });

            this.#discoverySocket.bind(DISCOVERY_PORT, () => {
                console.log(`[DiscoverySocket] Listening on 0.0.0.0:${DISCOVERY_PORT}`);
            });
        } catch (e) {
            console.error('[DiscoverySocket] Failed to bind:', e);
        }
    }

    // Added: Process incoming UDP identity packets
    #handleDiscoveryMessage(msg, rinfo) {
        try {
            const data = JSON.parse(msg.toString());
            
            // Ignore own packets or invalid types
            if (!data.deviceId || data.deviceId === this.#deviceId || data.type !== 'identity') return;
            
            // Ensure we only process compatible device types
            if (!this.canPairWith(data.deviceType)) return;

            // console.log(`[DiscoverySocket] Received identity from ${data.deviceName} (${rinfo.address})`);

            this.emit('discoverableDeviceFound', {
                deviceId: data.deviceId,
                deviceType: data.deviceType,
                deviceName: data.deviceName,
            });

            let device = this.#devices.get(data.deviceId);
            if (!device) {
                device = new SocketDevice(data.deviceId, data.deviceType, data.deviceName);
                this.#devices.set(data.deviceId, device);
            }
            
            // Construct address list, prioritizing the sender's IP
            const addressesToTry = [rinfo.address];
            if (data.addresses && Array.isArray(data.addresses)) {
                data.addresses.forEach(ip => {
                    if (ip !== rinfo.address) addressesToTry.push(ip);
                });
            }
            
            // Update device info similar to Bonjour resolution
            device.updateRemoteInfo(
                addressesToTry, 
                parseInt(data.tcpPort, 10), 
                parseInt(data.version, 10), 
                data.deviceName
            );

            // If we are currently paired with this device, trigger maintenance to use new IPs if needed
            if (this.#pairedDevice && this.#pairedDevice.deviceId === data.deviceId) {
                this.#triggerConnectionMaintenance();
            }

        } catch (e) {
            console.warn('[DiscoverySocket] Failed to parse message:', e);
        }
    }

    // Added: Send UDP identity packet to a target IP
    #sendIdentitySignal(targetIp) {
        if (!this.#discoverySocket || !this.#server || !this.#server.address()) return;
        
        const payload = JSON.stringify({
            type: 'identity',
            deviceId: this.#deviceId,
            deviceName: this.#deviceName,
            deviceType: this.#clientType,
            tcpPort: this.#server.address().port,
            version: this.#serviceVersion,
            addresses: this.#lastPublishedIPs
        });

        this.#discoverySocket.send(payload, DISCOVERY_PORT, targetIp, (err) => {
            if (err) console.warn(`[DiscoverySocket] Failed to send identity to ${targetIp}`, err);
        });
    }

    #createConnection(address, port) {
        return net.createConnection({
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            deviceType: this.#clientType,
            host: address,
            port: port,
            enableStream: true
        });
    }

    #handleServiceUp(service) {
        const txt = service.txt;
        console.log(`Discovered service`, txt);

        if (!txt || !txt.deviceId || txt.deviceId === this.deviceId || !txt.deviceType || !this.canPairWith(txt.deviceType) || !txt.port || !txt.version || !txt.deviceName) return;

        this.emit('discoverableDeviceFound', {
            deviceId: txt.deviceId,
            deviceType: txt.deviceType,
            deviceName: txt.deviceName,
        });

        const addressesToTry = (txt.addresses || '').split(',').filter(Boolean);
        if (addressesToTry.length === 0) return;

        // Added: REACTIVE Signal - Send UDP identity signal to discovered IPs
        addressesToTry.forEach(ip => {
            this.#sendIdentitySignal(ip);
        });

        const { deviceId: remoteId, deviceType, deviceName } = txt;
        let device = this.#devices.get(remoteId);
        if (!device) {
            device = new SocketDevice(remoteId, deviceType, deviceName);
            this.#devices.set(remoteId, device);
        }

        device.updateRemoteInfo(addressesToTry, parseInt(txt.port, 10), parseInt(txt.version, 10), deviceName);

        if (this.#pairedDevice && this.#pairedDevice.deviceId === remoteId) {
            this.#triggerConnectionMaintenance();
        }
    }

    #handleServiceDown(service) {
        const txt = service.txt;
        if (!txt || !txt.deviceId) return;

        this.emit('discoverableDeviceLost', {
            deviceId: txt.deviceId,
        });
    }

    #startServerAndPublish() {
        this.#server = net.createServer({ deviceId: this.deviceId, deviceName: this.deviceName, deviceType: this.#clientType, enableStream: true },
            (socket) => this.#handleNewConnection(socket)
        );
        this.#server.on('error', (err) => this.emit('error', err));
        this.#server.listen(0, '0.0.0.0', () => {
            console.log(`Server listening on port ${this.#server.address().port}`);
            
            setInterval(() => this.#handleNetworkChange(), 5000);
            this.#handleNetworkChange(); // Initial publication

            if (this.#connectionMaintainerInterval) clearInterval(this.#connectionMaintainerInterval);
            this.#connectionMaintainerInterval = setInterval(this.#maintainConnections.bind(this), 5000);
        });
    }

    #handleNewConnection(socket) {
        console.log("New incoming connection established.");
        socket.on('error', (err) => this.emit('error', err));
        socket.on('pairingRequest', (handshakeData, accept, reject) => {
            const { deviceId: remoteId, deviceType, deviceName } = handshakeData;
            console.log(`Received pairing request from ${deviceName} (${remoteId})`);

            if (this.#pairedDevice) {
                if (this.#pairedDevice.deviceId === remoteId) {
                    console.log("Request is from our already-paired device. Accepting automatically.");
                    accept();
                    if (!this.#pairedDevice.hasIncomingSocket(socket)) {
                        this.#pairedDevice.addIncomingSocket(socket);
                    }
                } else {
                    console.log(`Already paired with ${this.#pairedDevice.deviceId}. Rejecting request from ${remoteId}.`);
                    reject();
                }
            } else {
                if (this.#pendingUiPairingRequests.has(remoteId)) {
                    console.log(`[ConnectionManager] Ignoring duplicate pairing UI request for ${remoteId}`);
                    return;
                }

                console.log("Forwarding pairing request to application.");
                this.#pendingUiPairingRequests.add(remoteId);

                let potentialDevice = this.#devices.get(remoteId);
                if (!potentialDevice) {
                    potentialDevice = new SocketDevice(remoteId, deviceType, deviceName);
                    this.#devices.set(remoteId, potentialDevice);
                } else {
                    potentialDevice.updateRemoteInfo([], -1, -1, deviceName);
                }

                let decided = false;
                const timeoutHandle = setTimeout(() => {
                    if (!decided) {
                        decided = true;
                        console.log("Pairing request timed out. Rejecting.");
                        this.#pendingUiPairingRequests.delete(remoteId);
                        reject();
                    }
                }, PAIRING_REQUEST_TIMEOUT);

                const acceptWrapper = () => {
                    if (!decided) {
                        decided = true;
                        clearTimeout(timeoutHandle);
                        this.#pendingUiPairingRequests.delete(remoteId);
                        console.log(`Application ACCEPTED pairing with ${remoteId}`);
                        if (this.#pairedDevice) this.#pairedDevice.destroyAllSockets();
                        this.#pairedDevice = potentialDevice;
                        this.#attachDeviceListeners(this.#pairedDevice);
                        this.#pairedDevice.addIncomingSocket(socket);
                        accept();
                    }
                };

                const rejectWrapper = () => {
                    if (!decided) {
                        decided = true;
                        clearTimeout(timeoutHandle);
                        this.#pendingUiPairingRequests.delete(remoteId);
                        console.log(`Application REJECTED pairing with ${remoteId}`);
                        reject();
                    }
                };

                this.emit('pairingRequest', potentialDevice, acceptWrapper, rejectWrapper);
            }
        });
    }

    #attachDeviceListeners(device) {
        device.removeAllListeners();

        device.on('error', (dev, error) => this.emit('error', dev));
        device.on('deviceFound', (dev) => this.emit('deviceFound', dev));
        device.on('deviceConnected', (dev) => {
            this.emit('deviceConnected', dev);

            if (this.#syncInterval) clearInterval(this.#syncInterval);

            this.#syncInterval = setInterval(() => {
                if (this.#pairedDevice && this.#pairedDevice.deviceId === dev.deviceId) {
                    this.#pairedDevice.sendStreamData({
                        type: 'clock_sync_ping_electron',
                        t1: performance.now()
                    });
                }
            }, 500);
        });
        device.on('deviceDisconnected', (dev, payload) => {
            if (this.#pairedDevice && this.#pairedDevice.deviceId === dev.deviceId) {
                console.log(`Paired device ${dev.deviceId} disconnected. Unpairing from ConnectionManager.`);
                this.#pairedDevice = null;
                this.#rttStats.clear();
                if (this.#syncInterval) {
                    clearInterval(this.#syncInterval);
                    this.#syncInterval = null;
                }
                this.getPlayerWindow()?.webContents.send('device-controller:rtt-update', []);
            }
            this.emit('deviceDisconnected', dev, payload);
        });
        device.on('outgoingConnect', (socket) => this.#sendCurrentServiceData(device, socket));
        device.on('pairingRejected', (dev, reason) => {
            console.log(`Pairing rejected for ${dev.deviceId}: ${reason}`);
            if (this.#pairedDevice && this.#pairedDevice.deviceId === dev.deviceId) {
                this.#pairedDevice = null;
                this.emit('pairingFailed', { deviceId: dev.deviceId, reason });
            }
        });
        device.on('manualDisconnect', (dev, reason) => {
            console.log(`[ConnectionManager] Manual disconnect from ${dev.deviceId}: ${reason}`);
            if (this.#pairedDevice && this.#pairedDevice.deviceId === dev.deviceId) {
                this.#pairedDevice = null;
                dev.destroyAllSockets('remote');
            }
        });

        device.on('message', (message, dev, remoteIp) => {
            if (!message || !message.type) return;
            const playbackCommands = ['play', 'play-synced', 'pause', 'beat', 'jump-backward', 'jump-forward', 'undo', 'jump-to-start', 'jump'];
        
            if (message.type === 'selectSong') {
                const songId = message.payload?.songId;
                if (songId) {
                    this.emit('songSelectionRequest', songId);
                }
            } else if (message.type === 'updateBpm') {
                const { bpm, bpmUnit } = message;
                if (bpm !== undefined && bpmUnit) {
                    this.emit('remoteBpmUpdate', { bpm, bpmUnit });
                }
            } else if (message.type === 'requestPlaylist') {
                console.log('[ConnectionManager] Playlist requested by remote device.');
                this.emit('playlistRequest');
            } else if (message.type === 'requestCurrentSong') {
                console.log('[ConnectionManager] Current song data requested by remote device.');
                this.emit('currentSongRequest');
            } else if (playbackCommands.includes(message.type)) {
                this.emit('remoteCommand', message, remoteIp);
            }
        });

        device.on('streamData', (data, dev, remoteIp) => {
            const payload = data.data;
            if (!payload || !this.#pairedDevice) return;

            switch (payload.type) {
                case 'clock_sync_pong_android': {
                    const rttKey = remoteIp; 
                    
                    const t4 = performance.now();
                    const { t1, t2, t3 } = payload;
                    const rtt = (t4 - t1) - (t3 - t2);

                    if (!this.#rttStats.has(rttKey)) {
                        this.#rttStats.set(rttKey, new RTTStats());
                    }
                    const stats = this.#rttStats.get(rttKey);
                    stats.addSample(rtt);

                    const rttDataForUI = Array.from(this.#rttStats.entries()).map(([ip, stat]) => ({
                        ip: ip,
                        avg: stat.average,
                        samples: stat.samples.length
                    }));
                    this.getPlayerWindow()?.webContents.send('device-controller:rtt-update', rttDataForUI);
                    break;
                }
                case 'clock_sync_ping_android': {
                    this.#pairedDevice.sendStreamData({
                        type: 'clock_sync_pong_electron',
                        t1: payload.t1,
                        t2: performance.now(),
                        t3: performance.now(),
                        sourceIp: remoteIp
                    });
                    break;
                }
            }
        });
    }

    getPlayerWindow() {
        const allWindows = require('electron').BrowserWindow.getAllWindows();
        return allWindows.find(win => win.getTitle().includes('Player'));
    }

    #handleNetworkChange() {
        const currentIPs = getAllRoutableIPv4Addresses();
        const sortedCurrent = [...currentIPs].sort();
        const sortedLast = [...this.#lastPublishedIPs].sort();

        if (sortedCurrent.join(',') === sortedLast.join(',')) {
            return;
        }

        console.log(`IPs changed. Old: [${this.#lastPublishedIPs.join(', ')}], New: [${currentIPs.join(', ')}]`);
        this.#publishService();
    }

    #publishService() {
        if (this.#publishedService) {
            this.#publishedService.stop(() => this.#_publish());
        } else {
            this.#_publish();
        }
    }

    #_publish() {
        if (!this.#server || !this.#server.listening) return;
        const allIPs = getAllRoutableIPv4Addresses();
        if (allIPs.length === 0) {
            console.warn("No suitable network interface found to advertise.");
            this.#lastPublishedIPs = [];
            return;
        }

        this.#lastPublishedIPs = allIPs;
        this.#serviceVersion = Date.now();
        const serverPort = this.#server.address().port;
        const txtData = {
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            deviceType: this.#clientType,
            port: serverPort,
            addresses: allIPs.join(','),
            version: this.#serviceVersion.toString()
        };

        const serviceData = { addresses: allIPs, port: serverPort, version: this.#serviceVersion };
        if (this.#pairedDevice) {
            this.#pairedDevice.sendServiceData(serviceData);
        }

        console.log(`Publishing service v${this.#serviceVersion} with IPs: ${txtData.addresses}`);
        this.#publishedService = this.#bonjour.publish({
            name: `livelyrics-${crypto.randomUUID()}`,
            type: 'livelyrics',
            port: serverPort,
            txt: txtData
        });

        // Added: PROACTIVE Signal - Broadcast identity to all known devices because our info changed
        console.log('[DiscoverySocket] Broadcasting new identity to known devices...');
        for (const device of this.#devices.values()) {
            const remoteIps = device.getRemoteAdvertisedIps();
            remoteIps.forEach(ip => this.#sendIdentitySignal(ip));
        }
    }

    #maintainConnections() {
        if (!this.#pairedDevice) return;

        const remotePort = this.#pairedDevice.getRemotePort();
        if (remotePort === -1) return;

        for (const targetIp of this.#pairedDevice.getRemoteAdvertisedIps()) {
            if (!this.#pairedDevice.hasConnectionTo(targetIp, remotePort)) {
                console.log(`[Maintainer] No connection to ${this.#pairedDevice.deviceId} at ${targetIp}:${remotePort}. Initiating.`);
                const newSocket = this.#createConnection(targetIp, remotePort);
                this.#pairedDevice.addOutgoingSocket(newSocket);
            }
        }
    }

    #triggerConnectionMaintenance() {
        console.log("Manually triggering connection maintenance.");
        if (this.#connectionMaintainerInterval) clearInterval(this.#connectionMaintainerInterval);
        this.#maintainConnections();
        this.#connectionMaintainerInterval = setInterval(this.#maintainConnections.bind(this), 5000);
    }

    #sendCurrentServiceData(device, socket) {
        if (this.#lastPublishedIPs.length === 0 || !this.#server?.listening) return;
        const serviceData = {
            addresses: this.#lastPublishedIPs,
            port: this.#server.address().port,
            version: this.#serviceVersion
        };
        if (socket) {
            device.sendServiceData(serviceData, socket);
        } else {
            device.sendServiceData(serviceData);
        }
    }

    pairWithDevice(deviceId) {
        const deviceToPair = this.#devices.get(deviceId);
        if (!deviceToPair) {
            console.error(`Attempted to pair with unknown device: ${deviceId}`);
            this.emit('error', new Error(`Device ${deviceId} not found.`));
            return false;
        }

        console.log(`Application is initiating pairing with ${deviceId}`);

        if (this.#pairedDevice && this.#pairedDevice.deviceId !== deviceId) {
            console.log(`Unpairing from previous device: ${this.#pairedDevice.deviceId}`);
            this.#pairedDevice.destroyAllSockets();
        }

        this.#pairedDevice = deviceToPair;
        this.#attachDeviceListeners(this.#pairedDevice);

        this.#triggerConnectionMaintenance();
        return true;
    }

    cancelPairing(deviceId) {
        if (this.#pairedDevice && this.#pairedDevice.deviceId === deviceId) {
            console.log(`Application is cancelling pairing with ${deviceId}`);
            const deviceToCancel = this.#pairedDevice;
            this.#pairedDevice = null;
    
            deviceToCancel.sendPairingRejection('Pairing canceled by user.');
    
            setTimeout(() => {
                deviceToCancel.destroyAllSockets('local');
            }, 100);
    
            this.emit('pairingFailed', { deviceId: deviceId, reason: 'Pairing canceled by user.' });
    
            return true;
        }
        console.warn(`Tried to cancel pairing with ${deviceId}, but it was not the actively pairing device.`);
        return false;
    }

    disconnectFromPairedDevice() {
        if (this.#pairedDevice) {
            const deviceId = this.#pairedDevice.deviceId;
            console.log(`Application is manually disconnecting from ${deviceId}`);
            const deviceToDestroy = this.#pairedDevice;

            deviceToDestroy.sendDisconnectMessage('User disconnected from presenter.');
            this.#pairedDevice = null;

            setTimeout(() => {
                console.log(`Destroying sockets for ${deviceId} after sending disconnect message.`);
                deviceToDestroy.destroyAllSockets('local');
            }, 250);

            return true;
        }
        return false;
    }

    sendMessageToPairedDevice(data) {
        if (this.#pairedDevice && this.#pairedDevice.getReadySocketsCount() > 0) {
            console.log(`[ConnectionManager] Sending message to paired device ${this.#pairedDevice.deviceId}`);
            this.#pairedDevice.sendMessage(data);
        } else {
            console.log(`[ConnectionManager] Could not send message, no paired device connected.`);
        }
    }
}

function getAllRoutableIPv4Addresses() {
    const addresses = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const isAPIPA = iface.address.startsWith('169.254.');
            if (iface.family === 'IPv4' && !iface.internal && !isAPIPA) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

module.exports = { ConnectionManager };



