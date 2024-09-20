<?php
// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

// OpenAQ API base URL
$openaq_base_url = 'https://api.openaq.org/';

// Get the API key from environment variable
$api_key = getenv('OPENAQ_API_KEY');

if (!$api_key) {
    http_response_code(500);
    echo json_encode(['error' => 'API key not set']);
    exit;
}

// Get the URL from the query parameter
$url = isset($_GET['url']) ? $_GET['url'] : null;

if (!$url) {
    http_response_code(400);
    echo json_encode(['error' => 'No URL provided']);
    exit;
}

// Validate the URL
if (strpos($url, $openaq_base_url) !== 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid URL. Must be an OpenAQ API URL.']);
    exit;
}

// Generate a cache key based on the full URL
$cache_key = md5($url);
$cache_file = "cache/{$cache_key}.json";

// Check if we have a valid cached response
if (file_exists($cache_file) && (filemtime($cache_file) > (time() - 3600))) {
    $cached_response = file_get_contents($cache_file);
    header('Content-Type: application/json');
    header('X-Cache: HIT');
    echo $cached_response;
    exit;
}

// If we don't have a cached response, make the API call
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'X-API-Key: ' . $api_key,
    'Accept: application/json'
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Set appropriate headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($http_code >= 200 && $http_code < 300) {
    // Cache the successful response
    if (!file_exists('cache')) {
        mkdir('cache', 0777, true);
    }
    file_put_contents($cache_file, $response);
    header('X-Cache: MISS');
    echo $response;
} else {
    http_response_code($http_code);
    echo $response;
}
