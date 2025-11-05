const EventEmitter = require('events');
const net = require("./SmartSocket.js");
const os =require('os');
const { Bonjour } = require('bonjour-service');
const crypto = require('crypto');
const { SocketDevice } = require("./SocketDevice.js");

const PAIRING_REQUEST_TIMEOUT = 35000;

class ConnectionManager extends EventEmitter {
    #bonjour = null;
    #server = null;
    #browser = null;
    #publishedService = null;
    #lastPublishedIPs = [];
    #devices = new Map();
    #networkMonitor; // For native network change detection
    #deviceId = 'unknown';
    #deviceName = 'Unknown Device';
    #clientType = 'unknown';
    #serviceVersion = 0;
    #connectionMaintainerInterval = null;
    #pairedDevice = null; // The single device we are paired with

    get deviceId() { return this.#deviceId; }
    get deviceName() { return this.#deviceName; }

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

        if (this.#connectionMaintainerInterval) {
            clearInterval(this.#connectionMaintainerInterval);
            this.#connectionMaintainerInterval = null;
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
            
            // Fallback polling for network changes, as native addon is not included
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
                console.log("Forwarding pairing request to application.");
                let potentialDevice = this.#devices.get(remoteId);
                if (!potentialDevice) {
                    potentialDevice = new SocketDevice(remoteId, deviceType, deviceName);
                    this.#devices.set(remoteId, potentialDevice);
                } else {
                    // Update name in case it changed
                    potentialDevice.updateRemoteInfo([], -1, -1, deviceName);
                }

                let decided = false;
                const timeoutHandle = setTimeout(() => {
                    if (!decided) {
                        decided = true;
                        console.log("Pairing request timed out. Rejecting.");
                        reject();
                    }
                }, PAIRING_REQUEST_TIMEOUT);

                const acceptWrapper = () => {
                    if (!decided) {
                        decided = true;
                        clearTimeout(timeoutHandle);
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
                        console.log(`Application REJECTED pairing with ${remoteId}`);
                        reject();
                    }
                };

                this.emit('pairingRequest', potentialDevice, acceptWrapper, rejectWrapper);
            }
        });
    }

    #attachDeviceListeners(device) {
        // FIX: Before attaching new listeners, remove all old ones.
        device.removeAllListeners();

        device.on('error', (dev, error) => this.emit('error', dev));
        device.on('deviceFound', (dev) => this.emit('deviceFound', dev));
        device.on('deviceConnected', (dev) => this.emit('deviceConnected', dev));
        device.on('deviceDisconnected', (dev, payload) => {
            if (this.#pairedDevice && this.#pairedDevice.deviceId === dev.deviceId) {
                console.log(`Paired device ${dev.deviceId} disconnected. Unpairing from ConnectionManager.`);
                this.#pairedDevice = null;
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
    
            // Politely tell the other device we are cancelling before destroying sockets.
            deviceToCancel.sendPairingRejection('Pairing canceled by user.');
    
            // Give the message a moment to send before tearing everything down.
            setTimeout(() => {
                deviceToCancel.destroyAllSockets('local');
            }, 100);
    
            // Manually emit a pairingFailed event to ensure the UI updates,
            // because destroyAllSockets might not emit if the connection wasn't fully established.
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