app.get('/proxy', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Error: URL parameter is required');
    }

    // If the target URL is relative, prepend the last known domain
    if (!/^https?:\/\//i.test(targetUrl)) {
        const lastDomain = req.headers['referer'] && new URL(req.headers['referer']).searchParams.get('url');
        if (lastDomain) {
            const domain = new URL(lastDomain).origin;
            targetUrl = `${domain}${targetUrl}`;
        }
    }

    // Forward the request to the target URL
    request({ url: targetUrl, headers: { 'User-Agent': req.headers['user-agent'] } })
        .on('response', (response) => {
            delete response.headers['x-frame-options'];
            response.headers['Access-Control-Allow-Origin'] = '*'; // Add CORS header
        })
        .on('error', (error) => {
            console.error('Error forwarding the request:', error);
            res.status(500).send('Failed to fetch the requested resource.');
        })
        .pipe(res);
});
