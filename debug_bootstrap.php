<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

echo json_encode([
    'success' => true,
    'message' => 'Debug bootstrap test',
    'step' => 'starting',
    'file_exists' => [
        'bootstrap/env_loader.php' => file_exists(__DIR__ . '/bootstrap/env_loader.php'),
        'bootstrap/database.php' => file_exists(__DIR__ . '/bootstrap/database.php'),
        'api/bootstrap.php' => file_exists(__DIR__ . '/api/bootstrap.php'),
        'api/routing/api_router.php' => file_exists(__DIR__ . '/api/routing/api_router.php'),
    ],
    'pwd' => getcwd(),
    'dir' => __DIR__
]);
?>
