<?php
/**
 * ENDPOINT TEMPORAIRE - Exécution migration GPS
 * À SUPPRIMER après exécution !
 */

header('Content-Type: application/json');

// Sécurité minimale - vérifier un token secret
$secret = $_GET['secret'] ?? '';
if ($secret !== 'execute-migration-gps-2025') {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

try {
    // Connexion PostgreSQL
    $dbUrl = getenv('DATABASE_URL') ?: 'postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data';
    $pdo = new PDO($dbUrl);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo json_encode(['status' => 'connected', 'message' => 'Connexion BDD OK']) . "\n";
    
    // Exécuter la migration
    $sql = "
        ALTER TABLE device_configurations 
        ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;
    ";
    
    $pdo->exec($sql);
    echo json_encode(['status' => 'migration', 'message' => 'Colonne gps_enabled ajoutée']) . "\n";
    
    // Mettre à jour les configs existantes
    $updateSql = "
        UPDATE device_configurations 
        SET gps_enabled = false 
        WHERE gps_enabled IS NULL;
    ";
    
    $updated = $pdo->exec($updateSql);
    echo json_encode(['status' => 'update', 'message' => "$updated configurations mises à jour"]) . "\n";
    
    // Vérifier le résultat
    $stmt = $pdo->query("SELECT COUNT(*) as total, SUM(CASE WHEN gps_enabled THEN 1 ELSE 0 END) as gps_on FROM device_configurations");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Migration GPS exécutée avec succès !',
        'total_configs' => $result['total'],
        'gps_enabled_count' => $result['gps_on']
    ]) . "\n";
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}

