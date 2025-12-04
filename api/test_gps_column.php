<?php
/**
 * ENDPOINT TEST - Vérifier si gps_enabled existe
 */

header('Content-Type: application/json');

require_once __DIR__ . '/../bootstrap/database.php';
require_once __DIR__ . '/helpers.php';

global $pdo;

try {
    // Test 1: columnExists fonctionne ?
    $tableExists = tableExists('device_configurations');
    
    // Test 2: gps_enabled existe ?
    $gpsExists = columnExists('device_configurations', 'gps_enabled');
    
    // Test 3: Compter configs
    $stmt = $pdo->query("SELECT COUNT(*) FROM device_configurations");
    $configCount = $stmt->fetchColumn();
    
    // Test 4: Si gps_enabled existe, compter combien sont activés
    $gpsCount = 0;
    if ($gpsExists) {
        $stmt = $pdo->query("SELECT COUNT(*) FROM device_configurations WHERE gps_enabled = true");
        $gpsCount = $stmt->fetchColumn();
    }
    
    echo json_encode([
        'success' => true,
        'table_exists' => $tableExists,
        'gps_column_exists' => $gpsExists,
        'total_configs' => $configCount,
        'gps_enabled_count' => $gpsCount,
        'message' => $gpsExists ? 'GPS colonne existe ✅' : 'GPS colonne manquante ❌'
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

