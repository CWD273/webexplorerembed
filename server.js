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

    if (!/^https?:\/\//i.test(targetUrl)) {
        const lastDomain = req.headers['referer'] && new URL(req.headers['referer']).searchParams.get('url');
        if (lastDomain) {
            const domain = new URL(lastDomain).origin;
            targetUrl = `${domain}${targetUrl}`;
        }
    }

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
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Proxy server is running on port ${PORT}`);
});
