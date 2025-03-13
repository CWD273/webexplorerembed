const express = require('express');
const request = require('request');
const app = express();

// Middleware to handle CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', '*'); // Expose headers to the client
    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Handle preflight requests
    }
    next();
});

// Proxy route to forward requests
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Error: URL parameter is required');
    }

    // Forward the request and handle the response
    request({ url: targetUrl, headers: { 'User-Agent': req.headers['user-agent'] } })
        .on('response', (response) => {
            delete response.headers['x-frame-options']; // Remove X-Frame-Options header
            response.headers['Access-Control-Allow-Origin'] = '*'; // Add CORS header
        })
        .on('error', (error) => {
            console.error('Error forwarding the request:', error);
            res.status(500).send('Failed to fetch the requested resource.');
        })
        .pipe(res);
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Proxy server is running on port ${PORT}`);
});
