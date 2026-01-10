<?php
// Script de test simple pour debugger l'API devices
header('Content-Type: application/json; charset=utf-8');

try {
    // Test connexion DB
    $pdo = new PDO("pgsql:host=db;port=5432;dbname=ott", "ott_user", "ott_password");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Test simple query
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM devices");
    $count = $stmt->fetch()['count'];
    
    $response = [
        'success' => true,
        'test' => 'debug',
        'device_count' => $count,
        'timestamp' => date('c')
    ];
    
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
