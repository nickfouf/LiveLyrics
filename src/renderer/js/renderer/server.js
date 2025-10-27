const express = require('express');
const path = require('path');
const https = require('https');
const selfsigned = require('selfsigned');

const app = express();
const port = 3000;

// ✅ Add Cross-Origin Isolation headers
app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

app.use(express.static(path.join(__dirname, './')));

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

// -----------------------------
// HTTPS version with dynamic certs
// -----------------------------

const app2 = express();
const port2 = 3001;

// ✅ Add Cross-Origin Isolation headers (HTTPS too)
app2.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

// Serve static files
app2.use(express.static(path.join(__dirname, './')));

// Generate self-signed certificates
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

// Create HTTPS server
https.createServer(
    {
        key: pems.private,
        cert: pems.cert,
    },
    app2
).listen(port2, () => {
    console.log(`HTTPS server is running at https://localhost:${port2}`);
});
