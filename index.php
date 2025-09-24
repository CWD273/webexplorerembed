<?php
// === INPUT & VALIDATION ===
if (!isset($_GET['url'])) {
    http_response_code(400);
    exit('Missing "url" parameter.');
}

$url = $_GET['url'];
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit('Invalid URL.');
}

if (isPrivateIP($url)) {
    http_response_code(403);
    exit('Access to private IPs is forbidden.');
}

// === FETCH THE CONTENT ===
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HEADER => false,
    CURLOPT_HTTPHEADER => [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ],
]);
$response = curl_exec($ch);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

if (curl_errno($ch)) {
    http_response_code(500);
    exit('cURL Error: ' . curl_error($ch));
}
curl_close($ch);

// === HANDLE HTML CONTENT ===
if (strpos($contentType, 'text/html') !== false) {
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    @$dom->loadHTML($response);

    // Remove <base> tags
    foreach ($dom->getElementsByTagName('base') as $base) {
        $base->parentNode->removeChild($base);
    }

    $tags = [
        'a'       => 'href',
        'img'     => 'src',
        'link'    => 'href',
        'script'  => 'src',
        'form'    => 'action',
        'iframe'  => 'src',
        'meta'    => 'content'
    ];

    foreach ($tags as $tag => $attribute) {
        foreach ($dom->getElementsByTagName($tag) as $element) {
            $attrValue = $element->getAttribute($attribute);
            if (!$attrValue) continue;

            if ($tag === 'meta' && strtolower($element->getAttribute('http-equiv')) === 'refresh') {
                if (preg_match('/url=([^;]+)/i', $attrValue, $matches)) {
                    $resolved = resolveUrl($url, trim($matches[1]));
                    $element->setAttribute($attribute, 'url=' . 'index.php?url=' . urlencode($resolved));
                }
                continue;
            }

            $resolved = resolveUrl($url, $attrValue);
            if ($resolved) {
                $proxied = 'index.php?url=' . urlencode($resolved);
                $element->setAttribute($attribute, $proxied);
            }
        }
    }

    // === INJECT JS TO REWRITE DYNAMIC LINKS & REQUESTS ===
    $script = <<<EOD
<script>
(function() {
    const proxy = url => 'index.php?url=' + encodeURIComponent(url);

    document.querySelectorAll('a, form').forEach(el => {
        if (el.tagName.toLowerCase() === 'a' && el.href) {
            el.href = proxy(el.href);
        } else if (el.tagName.toLowerCase() === 'form' && el.action) {
            el.action = proxy(el.action);
        }
    });

    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        if (typeof input === 'string') input = proxy(input);
        else if (input.url) input.url = proxy(input.url);
        return origFetch(input, init);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        arguments[1] = proxy(url);
        return origOpen.apply(this, arguments);
    };

    // Optional: Relax CSP (use with caution)
    // const meta = document.createElement('meta');
    // meta.httpEquiv = "Content-Security-Policy";
    // meta.content = "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;";
    // document.head.appendChild(meta);
})();
</script>
EOD;

    $html = $dom->saveHTML();
    $html = str_ireplace('</body>', $script . '</body>', $html);

    header("Content-Type: text/html; charset=UTF-8");
    echo $html;
} else {
    header("Content-Type: $contentType");
    echo $response;
}

// === HELPER FUNCTIONS ===
function resolveUrl($base, $relative) {
    if (strpos($relative, '//') === 0) {
        $scheme = parse_url($base, PHP_URL_SCHEME) ?? 'http';
        return $scheme . ':' . $relative;
    }
    if (parse_url($relative, PHP_URL_SCHEME) !== null) {
        return $relative;
    }

    $baseParts = parse_url($base);
    $baseScheme = $baseParts['scheme'] ?? 'http';
    $baseHost = $baseParts['host'] ?? '';
    $basePath = $baseParts['path'] ?? '/';
    $basePath = preg_replace('#/[^/]*$#', '', $basePath);
    $abs = $baseScheme . '://' . $baseHost . $basePath . '/' . ltrim($relative, '/');

    $parts = [];
    foreach (explode('/', $abs) as $segment) {
        if ($segment == '..') {
            array_pop($parts);
        } elseif ($segment !== '.' && $segment !== '') {
            $parts[] = $segment;
        }
    }

    return $baseScheme . '://' . $baseHost . '/' . implode('/', $parts);
}

function isPrivateIP($url) {
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host) return true;

    $ip = gethostbyname($host);
    return !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}
