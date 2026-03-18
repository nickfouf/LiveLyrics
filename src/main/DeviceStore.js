const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class DeviceStore {
    constructor(fileName = 'known-devices.json') {
        this.filePath = path.join(app.getPath('userData'), fileName);
        this.devices = new Map();
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                const now = Date.now();
                const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
                for (const [id, dev] of Object.entries(data)) {
                    // Check if it was seen within the last week
                    if (now - dev.lastSeen < ONE_WEEK) {
                        this.devices.set(id, dev);
                    }
                }
                this.save(); // Clean up expired devices immediately
            }
        } catch(e) {
            console.error("[DeviceStore] Error loading:", e.message);
        }
    }

    save() {
        try {
            const obj = {};
            this.devices.forEach((dev, id) => { obj[id] = dev; });
            fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
        } catch(e) {
            console.error("[DeviceStore] Error saving:", e.message);
        }
    }            updateDevice(deviceObj) {
        this.devices.set(deviceObj.deviceId, {
            ...deviceObj,
            lastSeen: Date.now()
        });
        this.save();
    }

    removeDevice(deviceId) {
        if (this.devices.has(deviceId)) {
            this.devices.delete(deviceId);
            this.save();
        }
    }

    getDevices() {
    return Array.from(this.devices.values());
    }
}

module.exports = { DeviceStore };





