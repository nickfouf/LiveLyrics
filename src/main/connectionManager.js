// LiveLyrics/live-lyrics-app/src/main/connectionManager.js
const EventEmitter = require('events');
const net = require("./SmartSocket.js");
const dgram = require('dgram'); 
const os = require('os');
const { Bonjour } = require('bonjour-service');
const crypto = require('crypto');
const { SocketDevice } = require("./SocketDevice.js");
const { performance } = require('perf_hooks');
const { DeviceStore } = require('./DeviceStore.js');

const PAIRING_REQUEST_TIMEOUT = 35000;
const DISCOVERY_PORT = 54321; 

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
    #bonjourPublishInterval = null; 
    #lastPublishedIPs = [];
    #devices = new Map(); 
    #deviceId = 'unknown';
    #deviceName = 'Unknown Device';
    #clientType = 'unknown';
    #serviceVersion = 0;
    #connectionMaintainerInterval = null;
    #syncInterval = null;
    
    #pairedConnector = null; 
    #midiDevices = new Map(); 
    
    #rttStats = new Map();
    #pendingUiPairingRequests = new Set();
    
    #discoverySocket = null;
    #deviceStore = null;        get deviceId() { return this.#deviceId; }
    get deviceName() { return this.#deviceName; }

    forgetDevice(deviceId) {
        this.#deviceStore.removeDevice(deviceId);
        
        const dev = this.#devices.get(deviceId);
        if (dev) {
            dev.destroyAllSockets('forgotten');
        }
        
        this.#devices.delete(deviceId);
        this.#midiDevices.delete(deviceId);
        
        if (this.#pairedConnector && this.#pairedConnector.deviceId === deviceId) {
            this.#pairedConnector = null;
        }
        
        this.emit('discoverableDeviceLost', { deviceId });
    }

    getRttStats() {
        return this.#rttStats;
    }

    canPairWith(type) {
        if (this.#clientType === 'main') {
            return type === 'connector' || type === 'midi-controller';
        }
        return (this.#clientType === 'connector' && type === 'main');
    }

    constructor(options = {}) {
        super();
        if (!options.deviceId || !options.clientType || !options.deviceName) {
            throw new Error("ConnectionManager requires deviceId, deviceName, and clientType.");
        }
        this.#deviceId = options.deviceId;
        this.#deviceName = options.deviceName;
        this.#clientType = options.clientType;
        this.#deviceStore = new DeviceStore('known_devices.json');
    }

    start() {
        if (this.#bonjour) {
            console.log('[ConnectionManager] Start called, but manager is already running.');
            return;
        }
        console.log('[ConnectionManager] Starting network services...');

        // Load Persistent Devices
        this.#deviceStore.getDevices().forEach(kd => {
            let device = new SocketDevice(kd.deviceId, kd.deviceType, kd.deviceName);
            this.#devices.set(kd.deviceId, device);
            this.#setupSocketDevice(device);
            device.updateRemoteInfo(kd.addresses, kd.tcpPort, -1, kd.deviceName);                // Push to UI Immediately
            this.emit('discoverableDeviceFound', {
                deviceId: kd.deviceId,
                deviceType: kd.deviceType,
                deviceName: kd.deviceName,
                lastSeen: kd.lastSeen
            });
        });
        
        this.#startDiscoverySocket();
        this.#bonjour = new Bonjour();
        this.#startServerAndPublish();

        this.#browser = this.#bonjour.find({ type: 'livelyrics' });
        this.#browser.on('up', this.#handleServiceUp.bind(this));
        this.#browser.on('down', this.#handleServiceDown.bind(this));
    }

    #setupSocketDevice(device) {
        device.on('infoUpdated', (updatedDevice) => {
            this.#deviceStore.updateDevice({
                deviceId: updatedDevice.deviceId,
                deviceName: updatedDevice.deviceName,
                deviceType: updatedDevice.deviceType,
                tcpPort: updatedDevice.getRemotePort(),
                addresses: updatedDevice.getRemoteAdvertisedIps()
            });

            this.emit('deviceInfoUpdated', {
                deviceId: updatedDevice.deviceId,
                deviceType: updatedDevice.deviceType,
                deviceName: updatedDevice.deviceName,
                ips: updatedDevice.getRemoteAdvertisedIps()
            });
        });
    }

    stop() {
        if (!this.#bonjour) {
            console.log('[ConnectionManager] Stop called, but manager is already stopped.');
            return;
        }
        console.log('[ConnectionManager] Stopping network services...');

        if (this.#discoverySocket) {
            try { this.#discoverySocket.close(); } catch (e) {}
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
        if (this.#bonjourPublishInterval) {
            clearInterval(this.#bonjourPublishInterval);
            this.#bonjourPublishInterval = null;
        }

        if (this.#browser) {
            this.#browser.stop();
            this.#browser = null;
        }

        if (this.#pairedConnector) {
            this.disconnectDevice(this.#pairedConnector.deviceId);
        }
        
        for (const midiDev of this.#midiDevices.values()) {
            midiDev.destroyAllSockets();
        }
        this.#midiDevices.clear();
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

    #handleDiscoveryMessage(msg, rinfo) {
        try {
            const data = JSON.parse(msg.toString());
            
            if (!data.deviceId || data.deviceId === this.#deviceId || data.type !== 'identity') return;
            if (!this.canPairWith(data.deviceType)) return;

            let device = this.#devices.get(data.deviceId);
            let isNewOrChanged = false;

            if (!device) {
                device = new SocketDevice(data.deviceId, data.deviceType, data.deviceName);
                this.#devices.set(data.deviceId, device);
                this.#setupSocketDevice(device);
                isNewOrChanged = true;
            } else {
                if (device.getRemotePort() !== parseInt(data.tcpPort, 10)) isNewOrChanged = true;
                if (!device.getRemoteAdvertisedIps().includes(rinfo.address)) isNewOrChanged = true;
                if (parseInt(data.version, 10) > device.lastSeenVersion) isNewOrChanged = true;
            }

            const addressesToTry = [rinfo.address];
            if (data.addresses && Array.isArray(data.addresses)) {
                data.addresses.forEach(ip => {
                    if (ip !== rinfo.address) addressesToTry.push(ip);
                });
            }

            if (isNewOrChanged) {
                console.log(`[DiscoverySocket] Replying to UDP discovery from ${data.deviceName} (${data.deviceId})`);
                addressesToTry.forEach(ip => this.#sendIdentitySignal(ip));
            }

            // updateRemoteInfo emits infoUpdated if necessary
            device.updateRemoteInfo(
                addressesToTry, 
                parseInt(data.tcpPort, 10), 
                parseInt(data.version, 10), 
                data.deviceName
            );                this.emit('discoverableDeviceFound', {
                deviceId: data.deviceId,
                deviceType: data.deviceType,
                deviceName: data.deviceName,
                lastSeen: Date.now()
            });

            if ((this.#pairedConnector && this.#pairedConnector.deviceId === data.deviceId) || 
                this.#midiDevices.has(data.deviceId)) {
                this.#triggerConnectionMaintenance();
            }

        } catch (e) {
            console.warn('[DiscoverySocket] Failed to parse message:', e);
        }
    }

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
            enableStream: true,
            servicePort: this.#server && this.#server.address() ? this.#server.address().port : 0
        });
    }

    #handleServiceUp(service) {
        const txt = service.txt;
        if (!txt || !txt.deviceId || txt.deviceId === this.deviceId || !txt.deviceType || !this.canPairWith(txt.deviceType) || !txt.port || !txt.version || !txt.deviceName) return;            this.emit('discoverableDeviceFound', {
            deviceId: txt.deviceId,
            deviceType: txt.deviceType,
            deviceName: txt.deviceName,
            lastSeen: Date.now()
        });

        const addressesToTry = (txt.addresses || '').split(',').filter(Boolean);
        if (addressesToTry.length === 0) return;

        addressesToTry.forEach(ip => {
            this.#sendIdentitySignal(ip);
        });

        const { deviceId: remoteId, deviceType, deviceName } = txt;
        let device = this.#devices.get(remoteId);
        if (!device) {
            device = new SocketDevice(remoteId, deviceType, deviceName);
            this.#devices.set(remoteId, device);
            this.#setupSocketDevice(device);
        }

        // Emit 'infoUpdated' handling logic covers saving & communicating changes
        device.updateRemoteInfo(addressesToTry, parseInt(txt.port, 10), parseInt(txt.version, 10), deviceName);

        if ((this.#pairedConnector && this.#pairedConnector.deviceId === remoteId) || 
            this.#midiDevices.has(remoteId)) {
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
            this.#handleNetworkChange(); 

            if (this.#connectionMaintainerInterval) clearInterval(this.#connectionMaintainerInterval);
            this.#connectionMaintainerInterval = setInterval(this.#maintainConnections.bind(this), 5000);

            if (this.#bonjourPublishInterval) clearInterval(this.#bonjourPublishInterval);
            this.#bonjourPublishInterval = setInterval(() => {
                console.log('[ConnectionManager] Smart publisher re-announcing service to network...');
                this.#publishService();
            }, 120000);
        });
    }

    #handleNewConnection(socket) {
        console.log("New incoming connection established.");
        socket.on('error', (err) => this.emit('error', err));
        
        socket.on('pairingRequest', (handshakeData, accept, reject) => {
            const { deviceId: remoteId, deviceType, deviceName, servicePort } = handshakeData;
            console.log(`Received pairing request from ${deviceName} (${remoteId}) Type: ${deviceType}`);

            if (deviceType === 'connector') {
                if (this.#pairedConnector) {
                    if (this.#pairedConnector.deviceId === remoteId) {
                        console.log("Request is from our already-paired connector. Accepting automatically.");
                        if (servicePort) {
                            this.#pairedConnector.updateRemoteInfo([socket.remoteAddress], servicePort, -1, deviceName);
                        }
                        accept();
                        if (!this.#pairedConnector.hasIncomingSocket(socket)) {
                            this.#pairedConnector.addIncomingSocket(socket);
                        }
                        return;
                    } else {
                        console.log(`Already paired with connector ${this.#pairedConnector.deviceId}. Rejecting request from ${remoteId}.`);
                        reject();
                        return;
                    }
                }
            } 
            else if (deviceType === 'midi-controller') {
                if (this.#midiDevices.has(remoteId)) {
                    console.log("Request is from a known active MIDI device. Accepting automatically.");
                    const activeMidi = this.#midiDevices.get(remoteId);
                    
                    if (servicePort) {
                        activeMidi.updateRemoteInfo([socket.remoteAddress], servicePort, -1, deviceName);
                    }
                    
                    accept();
                    if (!activeMidi.hasIncomingSocket(socket)) {
                        activeMidi.addIncomingSocket(socket);
                    }
                    return;
                }
            }

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
                this.#setupSocketDevice(potentialDevice);
            } 
            
            if (servicePort) {
                potentialDevice.updateRemoteInfo([socket.remoteAddress], servicePort, -1, deviceName);
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
                    
                    if (deviceType === 'connector') {
                        if (this.#pairedConnector) this.#pairedConnector.destroyAllSockets();
                        this.#pairedConnector = potentialDevice;
                        this.#attachDeviceListeners(this.#pairedConnector);
                        this.#pairedConnector.addIncomingSocket(socket);
                    } else if (deviceType === 'midi-controller') {
                        this.#midiDevices.set(remoteId, potentialDevice);
                        this.#attachDeviceListeners(potentialDevice);
                        potentialDevice.addIncomingSocket(socket);
                    }

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
        });
    }

    #attachDeviceListeners(device) {
        device.removeAllListeners();

        device.on('error', (dev, error) => this.emit('error', dev));
        device.on('deviceFound', (dev) => this.emit('deviceFound', dev));
        device.on('deviceConnected', (dev) => {
            this.emit('deviceConnected', dev);

            if (dev.deviceType === 'connector') {
                if (this.#syncInterval) clearInterval(this.#syncInterval);
                this.#syncInterval = setInterval(() => {
                    if (this.#pairedConnector && this.#pairedConnector.deviceId === dev.deviceId) {
                        this.#pairedConnector.sendStreamData({
                            type: 'clock_sync_ping_electron',
                            t1: performance.now()
                        });
                    }
                }, 500);
            }
        });
        device.on('deviceDisconnected', (dev, payload) => {
            const richPayload = { ...payload, deviceId: dev.deviceId, deviceType: dev.deviceType };

            if (dev.deviceType === 'connector') {
                if (this.#pairedConnector && this.#pairedConnector.deviceId === dev.deviceId) {
                    console.log(`Paired Connector ${dev.deviceId} disconnected.`);
                    this.#pairedConnector = null;
                    this.#rttStats.clear();
                    if (this.#syncInterval) {
                        clearInterval(this.#syncInterval);
                        this.#syncInterval = null;
                    }
                    this.getPlayerWindow()?.webContents.send('device-controller:rtt-update',[]);
                }
            } else if (dev.deviceType === 'midi-controller') {
                if (this.#midiDevices.has(dev.deviceId)) {
                    console.log(`MIDI Device ${dev.deviceId} disconnected.`);
                    this.#midiDevices.delete(dev.deviceId);
                }
            }

            this.emit('deviceDisconnected', dev, richPayload);
        });
        device.on('outgoingConnect', (socket) => this.#sendCurrentServiceData(device, socket));
        device.on('pairingRejected', (dev, reason) => {
            console.log(`Pairing rejected for ${dev.deviceId}: ${reason}`);
            
            if (dev.deviceType === 'connector' && this.#pairedConnector && this.#pairedConnector.deviceId === dev.deviceId) {
                this.#pairedConnector = null;
            } else if (dev.deviceType === 'midi-controller') {
                this.#midiDevices.delete(dev.deviceId);
            }

            this.emit('pairingFailed', { deviceId: dev.deviceId, reason });
        });
        device.on('manualDisconnect', (dev, reason) => {
            console.log(`[ConnectionManager] Manual disconnect from ${dev.deviceId}: ${reason}`);
            
            if (dev.deviceType === 'connector' && this.#pairedConnector && this.#pairedConnector.deviceId === dev.deviceId) {
                this.#pairedConnector = null;
                dev.destroyAllSockets('remote');
            } else if (dev.deviceType === 'midi-controller' && this.#midiDevices.has(dev.deviceId)) {
                this.#midiDevices.delete(dev.deviceId);
                dev.destroyAllSockets('remote');
            }
        });        device.on('message', (message, dev, remoteIp) => {
            if (!message || !message.type) return;
            const playbackCommands =['play', 'play-synced', 'pause', 'beat', 'jump-backward', 'jump-forward', 'slow-down', 'jump-to-start', 'jump'];
        
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
            if (!payload) return;

            if (dev.deviceType === 'connector' && this.#pairedConnector) {
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
                        this.#pairedConnector.sendStreamData({
                            type: 'clock_sync_pong_electron',
                            t1: payload.t1,
                            t2: performance.now(),
                            t3: performance.now(),
                            sourceIp: remoteIp
                        });
                        break;
                    }
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

        console.log(`IPs changed. Old: [${this.#lastPublishedIPs.join(', ')}], New:[${currentIPs.join(', ')}]`);
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
        this.#serviceVersion = Date.now(); // Regenerate timestamp so everyone checks in
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
        
        if (this.#pairedConnector) {
            this.#pairedConnector.sendServiceData(serviceData);
        }
        for (const midiDev of this.#midiDevices.values()) {
            midiDev.sendServiceData(serviceData);
        }

        console.log(`Publishing service v${this.#serviceVersion} with IPs: ${txtData.addresses}`);
        this.#publishedService = this.#bonjour.publish({
            name: `livelyrics-${crypto.randomUUID()}`,
            type: 'livelyrics',
            port: serverPort,
            txt: txtData
        });

        console.log('[DiscoverySocket] Broadcasting new identity to known devices...');
        for (const device of this.#devices.values()) {
            const remoteIps = device.getRemoteAdvertisedIps();
            remoteIps.forEach(ip => this.#sendIdentitySignal(ip));
        }
    }

    #maintainConnections() {
        if (this.#pairedConnector) {
            this.#ensureConnection(this.#pairedConnector);
        }

        for (const midiDev of this.#midiDevices.values()) {
            this.#ensureConnection(midiDev);
        }
    }

    #ensureConnection(device) {
        const remotePort = device.getRemotePort();
        if (remotePort === -1) return;

        for (const targetIp of device.getRemoteAdvertisedIps()) {
            if (!device.hasConnectionTo(targetIp, remotePort)) {
                console.log(`[Maintainer] No connection to ${device.deviceId} at ${targetIp}:${remotePort}. Initiating.`);
                const newSocket = this.#createConnection(targetIp, remotePort);
                device.addOutgoingSocket(newSocket);
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

        console.log(`Application is initiating pairing with ${deviceId} (${deviceToPair.deviceType})`);

        if (deviceToPair.deviceType === 'midi-controller') {
            if (!this.#midiDevices.has(deviceId)) {
                this.#midiDevices.set(deviceId, deviceToPair);
                this.#attachDeviceListeners(deviceToPair);
                this.#triggerConnectionMaintenance();
                return true;
            }
        } else {
            if (this.#pairedConnector && this.#pairedConnector.deviceId !== deviceId) {
                console.log(`Unpairing from previous connector: ${this.#pairedConnector.deviceId}`);
                this.#pairedConnector.destroyAllSockets();
            }
            this.#pairedConnector = deviceToPair;
            this.#attachDeviceListeners(this.#pairedConnector);
            this.#triggerConnectionMaintenance();
            return true;
        }
        return false;
    }

    cancelPairing(deviceId) {
        if (this.#pairedConnector && this.#pairedConnector.deviceId === deviceId) {
            this.#cancelPairingForDevice(this.#pairedConnector);
            this.#pairedConnector = null;
            return true;
        }
        if (this.#midiDevices.has(deviceId)) {
            const dev = this.#midiDevices.get(deviceId);
            this.#cancelPairingForDevice(dev);
            this.#midiDevices.delete(deviceId);
            return true;
        }
        
        const device = this.#devices.get(deviceId);
        if (device) {
            console.log(`[ConnectionManager] Force cancelling pairing for non-active device: ${deviceId}`);
            this.#cancelPairingForDevice(device);
            return true;
        }
        
        console.warn(`Tried to cancel pairing with ${deviceId}, but it was not found.`);
        return false;
    }

    #cancelPairingForDevice(device) {
        console.log(`Application is cancelling pairing with ${device.deviceId}`);
        device.sendPairingRejection('Pairing canceled by user.');
        setTimeout(() => {
            device.destroyAllSockets('local');
        }, 100);
        this.emit('pairingFailed', { deviceId: device.deviceId, reason: 'Pairing canceled by user.' });
    }

    disconnectDevice(deviceId) {
        let disconnectedAny = false;

        if (this.#pairedConnector && (!deviceId || this.#pairedConnector.deviceId === deviceId)) {
            const devId = this.#pairedConnector.deviceId;
            console.log(`Application is manually disconnecting from connector ${devId}`);
            const deviceToDestroy = this.#pairedConnector;
            deviceToDestroy.sendDisconnectMessage('User disconnected.');
            this.#pairedConnector = null;
            setTimeout(() => deviceToDestroy.destroyAllSockets('local'), 250);
            disconnectedAny = true;
        }

        if (deviceId && this.#midiDevices.has(deviceId)) {
            console.log(`Application is manually disconnecting from MIDI device ${deviceId}`);
            const deviceToDestroy = this.#midiDevices.get(deviceId);
            deviceToDestroy.sendDisconnectMessage('User disconnected.');
            this.#midiDevices.delete(deviceId);
            setTimeout(() => deviceToDestroy.destroyAllSockets('local'), 250);
            disconnectedAny = true;
        }

        return disconnectedAny;
    }

    disconnectFromPairedDevice() {
        return this.disconnectDevice(null);
    }

    sendMessageToPairedDevice(data) {
        if (this.#pairedConnector && this.#pairedConnector.getReadySocketsCount() > 0) {
            this.#pairedConnector.sendMessage(data);
        }
        for (const midiDev of this.#midiDevices.values()) {
            if (midiDev.getReadySocketsCount() > 0) {
                midiDev.sendMessage(data);
            }
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

    if (addresses.length === 0) {
        addresses.push('127.0.0.1');
    }

    return addresses;
}

module.exports = { ConnectionManager };



