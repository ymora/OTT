<?php
// Version simplifiée du handler devices pour debug
require_once __DIR__ . '/api/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = get_db_connection();
    
    $stmt = $pdo->query("SELECT id, sim_iccid, device_name, status, last_battery FROM devices WHERE deleted_at IS NULL LIMIT 10");
    $devices = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $response = [
        'success' => true,
        'devices' => $devices,
        'count' => count($devices)
    ];
    
    // Forcer la sortie
    ob_clean();
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
    
} catch (Exception $e) {
    ob_clean();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
