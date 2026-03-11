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



Make sure your `package.json` is configured to use ES modules by adding `"type": "module"`.


