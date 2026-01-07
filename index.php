<?php
/**
 * OTT API v2.0 - Point d'entrée
 * HAPPLYZ MEDICAL SAS
 */

require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';

header('Content-Type: application/json; charset=utf-8');

// Health check
if ($_SERVER['REQUEST_URI'] === '/' || $_SERVER['REQUEST_URI'] === '/index.php') {
    
    // Test connexion BDD
    $db_status = 'unknown';
    try {
        $dbConfig = ott_database_config(false);
        if ($dbConfig === null) {
            $db_status = 'not_configured';
        } else {
            $db_status = 'configured';
            $pdo = new PDO(
                $dbConfig['dsn'],
                $dbConfig['user'],
                $dbConfig['pass'],
                ott_pdo_options($dbConfig['type'])
            );
            $db_status = 'connected';
        }
    } catch(Throwable $e) {
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

