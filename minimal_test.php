<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

try {
    echo json_encode([
        'success' => true,
        'message' => 'Minimal test working',
        'php_version' => phpversion(),
        'timestamp' => date('c'),
        'env_test' => [
            'APP_ENV' => getenv('APP_ENV'),
            'DATABASE_URL_SET' => getenv('DATABASE_URL') ? 'YES' : 'NO',
            'DB_HOST' => getenv('DB_HOST'),
        ]
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}
?>
