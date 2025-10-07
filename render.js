const puppeteer = require('puppeteer');
const express = require('express');
const app = express();

// Add CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing "url" parameter.');
  
  try {
    const browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Important for Render
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set a reasonable timeout
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    const html = await page.content();
    await browser.close();
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
