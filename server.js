const express = require('express');
const request = require('request');
const app = express();

// Middleware to handle CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Handle preflight requests
    }
    next();
});

// Proxy route
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Error: URL parameter is required');
    }

    // Forward the request to the target URL
    request({ url: targetUrl, headers: { 'User-Agent': req.headers['user-agent'] } })
        .on('error', (error) => {
            console.error('Error forwarding the request:', error);
            res.status(500).send('Failed to fetch the requested resource.');
        })
        .pipe(res);
});

// Start the server on the assigned port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Proxy server is running on port ${PORT}`);
});
