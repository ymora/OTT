<?php
/**
 * Test simple pour vérifier l'upload de fichier
 * Usage: php -S localhost:8000 test_upload_simple.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$response = [
    'method' => $_SERVER['REQUEST_METHOD'],
    'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'not set',
    'files_keys' => array_keys($_FILES),
    'post_keys' => array_keys($_POST),
    'has_firmware_ino' => isset($_FILES['firmware_ino']),
];

if (isset($_FILES['firmware_ino'])) {
    $file = $_FILES['firmware_ino'];
    $response['file_info'] = [
        'name' => $file['name'],
        'type' => $file['type'],
        'size' => $file['size'],
        'tmp_name' => $file['tmp_name'],
        'error' => $file['error'],
        'exists' => file_exists($file['tmp_name']),
    ];
    
    // Lire le contenu pour vérifier
    if (file_exists($file['tmp_name'])) {
        $content = file_get_contents($file['tmp_name']);
        $response['file_content_preview'] = substr($content, 0, 200);
        
        // Chercher la version
        if (preg_match('/FIRMWARE_VERSION_STR\s+"([^"]+)"/', $content, $matches)) {
            $response['version_found'] = $matches[1];
        } else {
            $response['version_found'] = 'not found';
        }
    }
}

$response['success'] = true;
$response['message'] = 'Test upload OK';

echo json_encode($response, JSON_PRETTY_PRINT);

