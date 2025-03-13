const express = require('express');
const request = require('request');
const app = express();

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.get('/proxy', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Error: URL parameter is required');
    }

    try {
        // Handle relative URLs by checking the "referer" header
        if (!/^https?:\/\//i.test(targetUrl)) {
            const referer = req.headers.referer;
            if (referer) {
                const refererUrl = new URL(referer);
                const baseUrl = new URL(refererUrl.searchParams.get('url')).origin;
                targetUrl = new URL(targetUrl, baseUrl).href;
            } else {
                throw new Error('Relative URL without base URL.');
            }
        }

        // Forward the request to the target URL
        request({ url: targetUrl, headers: { 'User-Agent': req.headers['user-agent'] } })
            .on('response', (response) => {
                delete response.headers['x-frame-options'];
                response.headers['Access-Control-Allow-Origin'] = '*';
            })
            .on('error', (error) => {
                console.error('Error forwarding the request:', error);
                res.status(500).send('Failed to fetch the requested resource.');
            })
            .pipe(res);

    } catch (error) {
        console.error('Error processing the URL:', error);
        res.status(400).send('Invalid or unsupported URL.');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Proxy server is running on port ${PORT}`);
});
