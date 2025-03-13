const express = require('express');
const request = require('request');
const app = express();

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Error: URL parameter is required');
    }

    // Forward the request and modify the response headers
    request({ url: targetUrl, headers: { 'User-Agent': req.headers['user-agent'] } })
        .on('response', (response) => {
            delete response.headers['x-frame-options']; // Remove the X-Frame-Options header
        })
        .on('error', (error) => {
            console.error('Error forwarding the request:', error);
            res.status(500).send('Failed to fetch the requested resource.');
        })
        .pipe(res);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Proxy server is running on port ${PORT}`);
});
