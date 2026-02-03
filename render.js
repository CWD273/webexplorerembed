const puppeteer = require('puppeteer');
const express = require('express');
const app = express();

// Add CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse POST body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helper function to get content type from URL
function getContentType(url) {
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const types = {
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'pdf': 'application/pdf'
  };
  return types[ext] || 'text/html';
}

// Helper function to check if URL is likely a static resource
function isStaticResource(url) {
  const staticExtensions = ['.css', '.png', '.jpg', '.jpeg', '.gif', 
    '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webm', '.mp3', '.pdf'];
  return staticExtensions.some(ext => url.toLowerCase().includes(ext));
}

// Helper function to rewrite URLs
function rewriteUrls(html, targetUrl, proxyBaseUrl) {
  const urlObj = new URL(targetUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  
  // Rewrite absolute URLs
  html = html.replace(
    /(href|src|action|data|poster|background)=["']https?:\/\/[^"']+["']/gi,
    (match, attr) => {
      const url = match.match(/["'](https?:\/\/[^"']+)["']/)[1];
      return `${attr}="${proxyBaseUrl}/?url=${encodeURIComponent(url)}"`;
    }
  );
  
  // Rewrite protocol-relative URLs (//example.com/image.jpg)
  html = html.replace(
    /(href|src|action|data|poster|background)=["']\/\/[^"']+["']/gi,
    (match, attr) => {
      const url = match.match(/["'](\/\/[^"']+)["']/)[1];
      return `${attr}="${proxyBaseUrl}/?url=${encodeURIComponent(urlObj.protocol + url)}"`;
    }
  );
  
  // Rewrite root-relative URLs (/path/to/resource)
  html = html.replace(
    /(href|src|action|data|poster|background)=["'](\/[^"'\/][^"']*)["']/gi,
    (match, attr, path) => {
      const fullUrl = baseUrl + path;
      return `${attr}="${proxyBaseUrl}/?url=${encodeURIComponent(fullUrl)}"`;
    }
  );
  
  // Rewrite relative URLs (./image.jpg or image.jpg)
  html = html.replace(
    /(href|src|action|data|poster|background)=["'](?!https?:\/\/|\/\/|\/|#|data:|javascript:|mailto:)([^"']+)["']/gi,
    (match, attr, path) => {
      // Skip fragments and special protocols
      if (path.startsWith('#') || path.startsWith('javascript:') || path.startsWith('mailto:')) {
        return match;
      }
      
      // Get the directory of the current URL
      const currentDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      try {
        const fullUrl = new URL(path, currentDir).href;
        return `${attr}="${proxyBaseUrl}/?url=${encodeURIComponent(fullUrl)}"`;
      } catch (e) {
        return match;
      }
    }
  );
  
  // Rewrite CSS url() references
  html = html.replace(
    /url\(['"]?(?!data:)([^'"()]+)['"]?\)/gi,
    (match, url) => {
      url = url.trim();
      let fullUrl;
      
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          fullUrl = url;
        } else if (url.startsWith('//')) {
          fullUrl = urlObj.protocol + url;
        } else if (url.startsWith('/')) {
          fullUrl = baseUrl + url;
        } else {
          const currentDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          fullUrl = new URL(url, currentDir).href;
        }
        
        return `url("${proxyBaseUrl}/?url=${encodeURIComponent(fullUrl)}")`;
      } catch (e) {
        return match;
      }
    }
  );
  
  // Remove or modify problematic meta tags
  html = html.replace(
    /<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,
    '<!-- CSP removed by proxy -->'
  );
  
  // Inject script to handle dynamic URL changes and navigation
  const injectedScript = `
    <script>
      (function() {
        const proxyBase = '${proxyBaseUrl}/?url=';
        const baseUrl = '${baseUrl}';
        const currentUrl = '${targetUrl}';
        
        // Override document.domain to prevent cross-origin issues
        try {
          Object.defineProperty(document, 'domain', {
            get: function() { return '${urlObj.hostname}'; },
            set: function(v) { /* ignore */ }
          });
        } catch(e) {}
        
        // Function to resolve relative URLs
        function resolveUrl(url) {
          if (!url) return url;
          
          // Skip special protocols
          if (url.startsWith('javascript:') || url.startsWith('mailto:') || 
              url.startsWith('tel:') || url.startsWith('data:') || url.startsWith('#') ||
              url.startsWith('blob:') || url.startsWith('about:')) {
            return url;
          }
          
          // Already proxied
          if (url.includes('${proxyBaseUrl}/?url=')) {
            return url;
          }
          
          try {
            let fullUrl;
            if (url.startsWith('http://') || url.startsWith('https://')) {
              fullUrl = url;
            } else if (url.startsWith('//')) {
              fullUrl = '${urlObj.protocol}' + url;
            } else if (url.startsWith('/')) {
              fullUrl = baseUrl + url;
            } else {
              fullUrl = new URL(url, currentUrl).href;
            }
            return proxyBase + encodeURIComponent(fullUrl);
          } catch (e) {
            console.error('Error resolving URL:', url, e);
            return url;
          }
        }
        
        // Intercept all link clicks - FIXED VERSION
        document.addEventListener('click', function(e) {
          let target = e.target;
          
          // Find the closest anchor tag
          while (target && target.tagName !== 'A') {
            target = target.parentElement;
            if (!target || target === document.body) break;
          }
          
          if (target && target.tagName === 'A') {
            const href = target.getAttribute('href');
            
            // Skip special links
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || 
                href.startsWith('mailto:') || href.startsWith('tel:')) {
              return;
            }
            
            // Check if it's already a proxied URL
            if (href.includes('${proxyBaseUrl}/?url=')) {
              // Already proxied, allow default behavior
              return;
            }
            
            // Prevent default and navigate through proxy
            e.preventDefault();
            e.stopPropagation();
            
            const proxiedUrl = resolveUrl(href);
            
            // Navigate to the proxied URL directly (not through postMessage)
            window.location.href = proxiedUrl;
            
            return false;
          }
        }, true);
        
        // Intercept form submissions
        document.addEventListener('submit', function(e) {
          const form = e.target;
          if (form && form.action) {
            e.preventDefault();
            
            const action = form.getAttribute('action') || currentUrl;
            const proxiedAction = resolveUrl(action);
            const method = (form.method || 'GET').toUpperCase();
            
            if (method === 'GET') {
              // For GET, build query string and navigate
              const formData = new FormData(form);
              const params = new URLSearchParams(formData);
              const separator = proxiedAction.includes('?') ? '&' : '?';
              window.location.href = proxiedAction + separator + params.toString();
            } else {
              // For POST, use fetch
              const formData = new FormData(form);
              window.location.href = proxiedAction + '&' + new URLSearchParams(formData).toString();
            }
          }
        }, true);
        
        // Intercept AJAX requests
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
          const resolvedUrl = resolveUrl(url);
          return originalOpen.call(this, method, resolvedUrl, ...args);
        };
        
        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
          if (typeof url === 'string') {
            url = resolveUrl(url);
          } else if (url instanceof Request) {
            const resolvedUrl = resolveUrl(url.url);
            url = new Request(resolvedUrl, url);
          }
          return originalFetch.call(this, url, options);
        };
        
        // Handle dynamically created elements
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName) {
          const element = originalCreateElement.call(document, tagName);
          
          if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'img' || 
              tagName.toLowerCase() === 'link' || tagName.toLowerCase() === 'iframe') {
            
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
              if (name === 'src' || name === 'href') {
                value = resolveUrl(value);
              }
              return originalSetAttribute.call(this, name, value);
            };
          }
          
          return element;
        };
        
        // Override window.open
        const originalWindowOpen = window.open;
        window.open = function(url, ...args) {
          if (url) {
            url = resolveUrl(url);
          }
          return originalWindowOpen.call(this, url, ...args);
        };
        
        // Override location property setters
        const originalLocation = window.location;
        let locationHref = originalLocation.href;
        
        Object.defineProperty(window, 'location', {
          get: function() {
            return {
              ...originalLocation,
              get href() { return locationHref; },
              set href(url) {
                locationHref = url;
                originalLocation.href = resolveUrl(url);
              },
              assign: function(url) {
                originalLocation.assign(resolveUrl(url));
              },
              replace: function(url) {
                originalLocation.replace(resolveUrl(url));
              }
            };
          },
          set: function(url) {
            originalLocation.href = resolveUrl(url);
          }
        });
        
      })();
    </script>
  `;
  
  html = html.replace(/<head[^>]*>/i, (match) => `${match}${injectedScript}`);
  
  return html;
}

// Function to rewrite CSS content
function rewriteCss(css, targetUrl, proxyBaseUrl) {
  const urlObj = new URL(targetUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  const currentDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
  
  // Rewrite url() in CSS
  css = css.replace(
    /url\(['"]?(?!data:)([^'"()]+)['"]?\)/gi,
    (match, url) => {
      url = url.trim();
      let fullUrl;
      
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          fullUrl = url;
        } else if (url.startsWith('//')) {
          fullUrl = urlObj.protocol + url;
        } else if (url.startsWith('/')) {
          fullUrl = baseUrl + url;
        } else {
          fullUrl = new URL(url, currentDir).href;
        }
        
        return `url("${proxyBaseUrl}/?url=${encodeURIComponent(fullUrl)}")`;
      } catch (e) {
        return match;
      }
    }
  );
  
  return css;
}

// Handle both GET and POST requests
async function handleRequest(req, res) {
  const targetUrl = req.query.url || req.body.url;
  if (!targetUrl) return res.status(400).send('Missing "url" parameter.');
  
  try {
    // Get the proxy base URL from the request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const proxyBaseUrl = `${protocol}://${host}`;
    
    // Check if this is a static resource (CSS, images, etc.)
    if (isStaticResource(targetUrl)) {
      // For static resources, just fetch and return them
      const https = require('https');
      const http = require('http');
      const urlModule = require('url');
      
      const parsedUrl = urlModule.parse(targetUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      client.get(targetUrl, (response) => {
        const contentType = response.headers['content-type'] || getContentType(targetUrl);
        res.setHeader('Content-Type', contentType);
        
        // If it's CSS, rewrite URLs in it
        if (contentType.includes('text/css')) {
          let cssData = '';
          response.on('data', chunk => cssData += chunk);
          response.on('end', () => {
            const rewrittenCss = rewriteCss(cssData, targetUrl, proxyBaseUrl);
            res.send(rewrittenCss);
          });
        } else {
          // For other resources, pipe directly
          response.pipe(res);
        }
      }).on('error', (err) => {
        console.error('Error fetching resource:', err);
        res.status(500).send('Error fetching resource: ' + err.message);
      });
      
      return;
    }
    
    // For HTML pages, use Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set user agent and other properties to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    let html = await page.content();
    await browser.close();
    
    // Rewrite all URLs in the HTML
    html = rewriteUrls(html, targetUrl, proxyBaseUrl);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Error: ' + err.message);
  }
}

app.get('/', handleRequest);
app.post('/', handleRequest);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
