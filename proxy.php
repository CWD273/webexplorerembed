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

        // Optional: Set headers to mimic a browser
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]);

        $response = curl_exec($ch);
        if (curl_errno($ch)) {
            http_response_code(500);
            echo 'Error: ' . curl_error($ch);
        } else {
            echo $response;
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
