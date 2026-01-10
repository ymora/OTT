<?php
ob_start();
header('Content-Type: application/json');
try {
    $pdo = new PDO('pgsql:host=db;port=5432;dbname=ott;sslmode=disable', 'ott_user', 'ott_password');
    $pdo->query('SELECT 1');
    echo json_encode(['status' => 'healthy', 'timestamp' => date('c'), 'database' => 'connected', 'version' => '2.0.0']);
} catch (Exception $e) {
    http_response_code(503);
    echo json_encode(['status' => 'unhealthy', 'error' => $e->getMessage()]);
}
ob_end_flush();
?>
