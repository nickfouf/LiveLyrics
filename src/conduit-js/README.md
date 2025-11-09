# Conduit.js

![Node.js](https://img.shields.io/badge/Node.js-14.x+-green.svg) ![License](https://img.shields.io/badge/License-MIT-blue.svg)

Conduit.js is a lightweight Node.js library for data transfer over UDP. It provides a simple, peer-to-peer, event-driven API for sending large JSON objects, with built-in support for message framing, a one-way congestion control mechanism, and a unique "latest message priority" ordering system ideal for real-time applications.

## The Problem with UDP

Standard UDP is fast but unreliable and connectionless. It doesn't guarantee packet arrival or order, and sending data too quickly can lead to network congestion and packet loss. Conduit.js adds a framing layer to handle large messages and a flow control mechanism to manage sending rates, but its most important feature is how it handles message ordering to prevent stale data. **It does not guarantee data delivery**, instead prioritizing the newest available message.

## Features

*   **Simplified API**: A single `ConduitSocket` class for both sending and receiving, reflecting UDP's peer-to-peer nature.
*   **Latest Message Priority**: A unique ordering mechanism that ensures only the most recent complete message is delivered. If a newer message is fully assembled before an older one, the older one is discarded, preventing the processing of stale data.
*   **JSON Framing**: Automatically fragments large JSON objects into smaller UDP packets and reassembles them on the other end.
*   **Flow Control**: Implements an Additive Increase algorithm to adjust the sending rate based on acknowledgments from the receiver.
*   **Modern ES Module Syntax**: Written in modern JavaScript with ES module imports/exports.
*   **Event-Driven API**: Uses Node.js `EventEmitter` for an intuitive and familiar API.

## Installation

Since Conduit.js is not on npm, you can include it in your project by copying the library files into your project directory.

```
your-project/
├── conduit-js/
│   ├── main.js
│   ├── ConduitSocket.js
│   ├── framer.js
│   └── congestionControl.js
├── peer1.js
├── peer2.js
└── package.json
```

Make sure your `package.json` is configured to use ES modules by adding `"type": "module"`.

```json
{
  "name": "your-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "peer1": "node peer1.js",
    "peer2": "node peer2.js"
  }
}
```

## Usage

The library provides a single `ConduitSocket` class. Here is an example of two peers communicating.

### Peer 1 (Sender)

**`peer1.js`**
```javascript
import { ConduitSocket } from './conduit-js/main.js';

const PEER_2_HOST = '127.0.0.1';
const PEER_2_PORT = 41235;

const socket1 = new ConduitSocket();
socket1.bind(41234); // Bind to its own port

socket1.on('listening', (address) => {
  console.log(`Socket 1 is ready to send from ${address.address}:${address.port}`);
  
  // Send a large JSON object
  const myData = {
    message: "This is a large data payload.",
    items: Array(500).fill(0).map((_, i) => `item-${i}`),
    timestamp: new Date().toISOString()
  };

  console.log("Sending JSON data...");
  socket1.send(myData, PEER_2_PORT, PEER_2_HOST);
});

// The 'drain' event fires when all data has been sent and acknowledged
socket1.on('drain', () => {
  console.log("Transfer complete! All acknowledged packets have been sent.");
  socket1.close();
});

socket1.on('error', (err) => {
    console.error('Socket 1 encountered an error:', err);
});
```

### Peer 2 (Receiver)

**`peer2.js`**
```javascript
import { ConduitSocket } from './conduit-js/main.js';

const MY_PORT = 41235;

const socket2 = new ConduitSocket();
socket2.bind(MY_PORT);

socket2.on('listening', (address) => {
  console.log(`Socket 2 is listening for messages at ${address.address}:${address.port}`);
});

socket2.on('message', (data, rinfo) => {
  console.log(`Received a complete message from ${rinfo.address}:${rinfo.port}`);
  console.log('Message Data:', data);
});

socket2.on('error', (err) => {
  console.error('Socket 2 encountered an error:', err);
});
```

## API Reference

### `ConduitSocket`

#### `new ConduitSocket()`
Creates a new `ConduitSocket` instance.

#### Events
*   `listening (address)`: Emitted when the socket has bound and is ready to send/receive data. `address` is an object with `port`, `family`, and `address` properties.
*   `message (data, rinfo)`: Emitted when a complete message has been reassembled. Due to the "latest message priority" logic, this will only fire for the newest message if frames arrive out of order. `data` is the parsed JSON object, and `rinfo` contains the remote address information.
*   `drain`: Emitted when the send queue is empty and all in-flight packets have been acknowledged.
*   `error (err)`: Emitted when an error occurs.

#### Methods
*   `bind(port, [address], [callback])`: Binds the socket to a `port` and optional `address`.
*   `send(jsonData, port, host)`: Sends a JSON object to a peer. The object is timestamped, framed, and sent.
*   `close()`: Closes the underlying socket.

## How It Works

*   **Framing**: When `send()` is called, the `Framer` serializes the JSON object, attaches a single `timestamp` for the entire message, and splits it into smaller chunks. Each chunk (frame) is sent as a separate UDP datagram containing the same message ID and timestamp.

*   **Latest Message Priority Ordering**: This is the core feature for real-time data. It guarantees that the application will not waste time processing old, irrelevant data.
    1.  When `send()` is called, the entire message is given a timestamp.
    2.  The receiver collects frames for multiple messages simultaneously, storing them in an "incomplete messages" buffer.
    3.  When a message is fully assembled, the receiver immediately emits it and records its timestamp as the "latest completed timestamp".
    4.  **Crucially, the receiver then purges all other incomplete messages in its buffer that have an older timestamp.**
    5.  Furthermore, any future frames that arrive with a timestamp older than the "latest completed timestamp" are instantly discarded and ignored.

    This ensures that if `message_2` completes before `message_1` (due to network jitter or packet loss), the system gives up on assembling `message_1` and focuses only on receiving messages that are newer than `message_2`.

*   **Acknowledgments (No Data Reliability)**: For every data packet the receiver gets, it sends back a lightweight acknowledgment (ACK) packet. The sender uses these ACKs to clear packets from its "in-flight" tracking window. If an ACK isn't received before a timer expires, the packet is considered lost and is **ignored**. It is **not** re-queued for sending. The ACKs exist solely for congestion control.

*   **Congestion Control**: The sender maintains a "congestion window" (`cwnd`), which limits the number of packets it can send without receiving an ACK.
    *   **Slow Start**: The `cwnd` starts at 1 and doubles for every received ACK, allowing for a rapid ramp-up of the sending rate.
    *   **Congestion Avoidance**: When the `cwnd` reaches a certain threshold, it switches to a slower, linear increase to gently probe for more bandwidth.
    *   **No Packet Loss Response**: Because lost packets are ignored, the congestion window is never reduced. The sending rate will only increase as ACKs are received.

## License

This project is licensed under the MIT License.