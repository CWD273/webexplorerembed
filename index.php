<?php
if (isset($_GET['url'])) {
    $url = $_GET['url'];

    // Validate the URL
    if (filter_var($url, FILTER_VALIDATE_URL)) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_HEADER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]);

        $response = curl_exec($ch);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

        if (curl_errno($ch)) {
            http_response_code(500);
            echo 'Error: ' . curl_error($ch);
        } else {
            // If content is HTML, rewrite URLs
            if (strpos($contentType, 'text/html') !== false) {
                $baseUrl = $url;
                $dom = new DOMDocument();

                // Suppress warnings due to malformed HTML
                @$dom->loadHTML($response);

                $tags = [
                    'a'      => 'href',
                    'img'    => 'src',
                    'link'   => 'href',
                    'script' => 'src',
                    'form'   => 'action'
                ];

                foreach ($tags as $tag => $attribute) {
                    $elements = $dom->getElementsByTagName($tag);
                    foreach ($elements as $element) {
                        $attrValue = $element->getAttribute($attribute);
                        if (!$attrValue) continue;

                        // Convert to absolute URL
                        $absoluteUrl = resolveUrl($baseUrl, $attrValue);
                        if ($absoluteUrl) {
                            // Re-route through proxy
                            $proxiedUrl = 'index.php?url=' . urlencode($absoluteUrl);
                            $element->setAttribute($attribute, $proxiedUrl);
                        }
                    }
                }

                echo $dom->saveHTML();
            } else {
                // Serve non-HTML content (images, CSS, etc.) as-is
                header("Content-Type: $contentType");
                echo $response;
            }
        }
        curl_close($ch);
    } else {
        http_response_code(400);
        echo 'Invalid URL';
    }
} else {
    http_response_code(400);
    echo 'URL parameter is missing';
}

// Helper to resolve relative URLs
function resolveUrl($base, $relative) {
    // If already absolute
    if (parse_url($relative, PHP_URL_SCHEME) !== null) {
        return $relative;
    }

    // Resolve relative to base
    return rtrim(dirname($base), '/') . '/' . ltrim($relative, '/');
}
