const dgram = require('dgram');
const { EventEmitter } = require('events');
const Framer = require('./framer.js');

const RTO = 500; // Retransmission timeout in ms
const MAX_IN_FLIGHT = 256; // Fixed window size

class ConduitSocket extends EventEmitter {
    #lastCompletedMessageTimestamp = 0;

    constructor() {
        super();
        this.socket = dgram.createSocket('udp4');
        this.inFlight = new Map();
        this.sendQueue = [];
        this.incompleteMessages = new Map();

        this.socket.on('message', (msg, rinfo) => {
            try {
                const message = JSON.parse(msg.toString());
                if (message.type === 'ack') {
                    this._handleAck(message);
                } else if (message.payload && message.timestamp) {
                    this._handleFrame(message, rinfo);
                }
            } catch (error) {
                // Ignore malformed packets
            }
        });

        this.socket.on('error', (err) => this.emit('error', err));
    }

    bind(port, address, callback) {
        try {
            this.socket.bind(port, address, callback);
        } catch (error) {
            this.emit('error', error);
        }
        this.socket.on('listening', () => {
            this.emit('listening', this.socket.address());
        });
    }

    send(jsonData, port, host) {
        const messageId = Math.random().toString(36).substr(2, 9);
        const timestamp = Date.now(); // Create a timestamp for the entire message
        const frames = Framer.frame(messageId, jsonData, timestamp);
        frames.forEach(frame => {
            frame.port = port;
            frame.host = host;
        });
        this.sendQueue.push(...frames);
        this._sendFrames();
    }

    _sendFrames() {
        while (this.inFlight.size < MAX_IN_FLIGHT && this.sendQueue.length > 0) {
            const frame = this.sendQueue.shift();
            const frameBuffer = Buffer.from(JSON.stringify(frame));

            try {
                this.socket.send(frameBuffer, frame.port, frame.host, (err) => {
                    if (err) {
                        this.emit('error', err);
                        this.sendQueue.unshift(frame);
                    } else {
                        const timeout = setTimeout(() => this._onTimeout(frame), RTO);
                        this.inFlight.set(`${frame.messageId}-${frame.sequenceNumber}`, {frame, timeout});
                    }
                });
            } catch (error) {
                this.emit('error', error);
                this.sendQueue.unshift(frame);
            }
        }
    }

    _handleAck(ack) {
        const key = `${ack.messageId}-${ack.sequenceNumber}`;
        if (this.inFlight.has(key)) {
            const { timeout } = this.inFlight.get(key);
            clearTimeout(timeout);
            this.inFlight.delete(key);

            if (this.inFlight.size === 0 && this.sendQueue.length === 0) {
                this.emit('drain');
            }

            this._sendFrames();
        }
    }

    _handleFrame(frame, rinfo) {
        const { messageId, sequenceNumber, totalSequences, payload, timestamp } = frame;

        // 1. If this frame is part of a message older than the last one we completed, drop it.
        if (timestamp < this.#lastCompletedMessageTimestamp) {
            return; // Drop stale frame
        }

        if (!this.incompleteMessages.has(messageId)) {
            this.incompleteMessages.set(messageId, {
                totalSequences,
                receivedPackets: new Map(),
                rinfo,
                timestamp, // Store the message timestamp
            });
        }

        const message = this.incompleteMessages.get(messageId);
        if (!message.receivedPackets.has(sequenceNumber)) {
            message.receivedPackets.set(sequenceNumber, { payload, sequenceNumber });
        }

        this._sendAck(messageId, sequenceNumber, rinfo);

        // 2. Check if the message is now complete.
        if (message.receivedPackets.size === totalSequences) {
            // Assemble and emit the completed message.
            const frames = Array.from(message.receivedPackets.values());
            const data = Framer.assemble(frames);
            this.emit('message', data, rinfo);

            // Remove it from the incomplete map.
            this.incompleteMessages.delete(messageId);

            // 3. This is the crucial step: Update the high-water mark timestamp.
            this.#lastCompletedMessageTimestamp = message.timestamp;

            // 4. Purge all other incomplete messages that are now older than our completed one.
            for (const [id, incompleteMsg] of this.incompleteMessages.entries()) {
                if (incompleteMsg.timestamp < this.#lastCompletedMessageTimestamp) {
                    this.incompleteMessages.delete(id);
                }
            }
        }
    }

    _sendAck(messageId, sequenceNumber, rinfo) {
        const ack = { type: 'ack', messageId, sequenceNumber };
        const ackBuffer = Buffer.from(JSON.stringify(ack));
        try {
            this.socket.send(ackBuffer, rinfo.port, rinfo.address);
        } catch (error) {
            this.emit('error', error);
        }
    }

    _onTimeout(frame) {
        const key = `${frame.messageId}-${frame.sequenceNumber}`;
        if (this.inFlight.has(key)) {
            // CORRECTED BEHAVIOR: The packet is removed from the in-flight map and is NOT re-queued.
            // This effectively drops the packet, which is the correct strategy for clock sync.
            this.inFlight.delete(key);
            console.log(`[ConduitSocket] Packet timeout, dropping: ${key}`);
            
            // Check if we're done sending everything.
            if (this.inFlight.size === 0 && this.sendQueue.length === 0) {
                this.emit('drain');
            }
            
            // Attempt to send the next packet in the queue, if any.
            this._sendFrames();
        }
    }

    close() {
        this.socket.close();
    }
}

module.exports = ConduitSocket;