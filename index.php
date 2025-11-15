<?php
/**
 * OTT API v2.0 - Point d'entrée
 * HAPPLYZ MEDICAL SAS
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Health check
if ($_SERVER['REQUEST_URI'] === '/' || $_SERVER['REQUEST_URI'] === '/index.php') {
    
    // Test connexion BDD
    $db_status = 'unknown';
    try {
        $db_url = getenv('DATABASE_URL');
        if ($db_url) {
            $db_status = 'configured';
            // Tenter connexion
            $db = parse_url($db_url);
            $pdo = new PDO(
                "pgsql:host=" . $db['host'] . ";port=" . ($db['port'] ?? 5432) . ";dbname=" . ltrim($db['path'], '/'),
                $db['user'],
                $db['pass']
            );
            $db_status = 'connected';
        } else {
            $db_status = 'not_configured';
        }
    } catch(Exception $e) {
        $db_status = 'error: ' . $e->getMessage();
    }
    
    echo json_encode([
        'success' => true,
        'service' => 'OTT API',
        'version' => '3.0.0',
        'status' => 'online',
        'php_version' => PHP_VERSION,
        'database' => $db_status,
        'timestamp' => date('c'),
        'endpoints' => [
            'POST /api.php/auth/login' => 'Authentification JWT',
            'GET /api.php/devices' => 'Liste dispositifs',
            'GET /api.php/users' => 'Liste utilisateurs (auth requise)',
            'POST /api.php/devices/measurements' => 'Enregistrer mesure',
            'POST /api.php/devices/{iccid}/commands' => 'Planifier une commande descendante',
            'GET /api.php/devices/commands' => 'Lister les commandes (auth requise)',
            'POST /api.php/devices/commands/ack' => 'Accusé de réception des commandes (device)',
            'GET /api.php/firmwares' => 'Liste firmwares OTA',
            'GET /api.php/audit' => 'Logs audit'
        ]
    ], JSON_PRETTY_PRINT);
    exit;
}

// Toutes les autres requêtes → api.php
require_once 'api.php';
?>

