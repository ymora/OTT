<?php
/**
 * Routeur principal de l'API
 * Extrait et refactorisé de api.php pour modularisation
 */

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../helpers_sql.php';
require_once __DIR__ . '/../validators.php';
require_once __DIR__ . '/../cache.php';
require_once __DIR__ . '/../handlers/auth.php';

global $pdo;
error_log("DEBUG: Etat de \$pdo -> " . (isset($pdo) ? 'Initialisé' : 'NULL'));
error_log("DEBUG: DATABASE_URL -> " . (getenv('DATABASE_URL') ?: 'absent'));

// Handlers Devices (modulaires)
require_once __DIR__ . '/../handlers/devices/utils.php';
require_once __DIR__ . '/../handlers/devices/crud.php';
require_once __DIR__ . '/../handlers/devices/patients.php';
require_once __DIR__ . '/../handlers/devices/measurements.php';
require_once __DIR__ . '/../handlers/devices/commands.php';
require_once __DIR__ . '/../handlers/devices/alerts.php';
require_once __DIR__ . '/../handlers/devices/logs.php';
require_once __DIR__ . '/../handlers/devices/config.php';
require_once __DIR__ . '/../handlers/devices/ota.php';
require_once __DIR__ . '/../handlers/devices/reports.php';

// Autres handlers
require_once __DIR__ . '/../handlers/firmwares.php';
require_once __DIR__ . '/../handlers/notifications.php';
require_once __DIR__ . '/../handlers/usb_logs.php';
require_once __DIR__ . '/../handlers/database_audit.php';
require_once __DIR__ . '/../handlers/migrations/migration_handlers.php';

// ============================================================================
// ROUTAGE PRINCIPAL
// ============================================================================

// Obtenir la méthode et le chemin
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = rtrim($path, '/'); // Normaliser le chemin
$path = preg_replace('#^/api\.php#', '', $path);
$path = $path === '' ? '/' : $path;

// Loguer la requête si activé
if (defined('LOG_REQUESTS') && LOG_REQUESTS) {
    error_log("[API] {$method} {$path} - " . $_SERVER['REMOTE_ADDR'] . " - " . ($_SERVER['HTTP_USER_AGENT'] ?? 'Unknown'));
}

// Router principal
if ($path === '/health' && $method === 'GET') {
    // Health check
    header('Content-Type: application/json');
    try {
        $stmt = $pdo->query("SELECT 1");
        echo json_encode([
            'status' => 'healthy',
            'timestamp' => date('c'),
            'database' => 'connected',
            'version' => '2.0.0'
        ]);
    } catch (Exception $e) {
        http_response_code(503);
        echo json_encode([
            'status' => 'unhealthy',
            'error' => $e->getMessage()
        ]);
    }
    
// AUTHENTICATION
} elseif($path === '/auth/login' && $method === 'POST') {
    handleLogin();
} elseif($path === '/auth/logout' && $method === 'POST') {
    handleLogout();
} elseif($path === '/auth/refresh' && $method === 'POST') {
    handleRefreshToken();
} elseif($path === '/auth/me' && $method === 'GET') {
    handleGetCurrentUser();

// USERS
} elseif($path === '/users' && $method === 'GET') {
    handleGetUsers();
} elseif($path === '/users' && $method === 'POST') {
    handleCreateUser();
} elseif(preg_match('#^/users/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetUser($m[1]);
} elseif(preg_match('#^/users/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateUser($m[1]);
} elseif(preg_match('#^/users/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteUser($m[1]);
} elseif(preg_match('#^/users/(\d+)/archive$#', $path, $m) && $method === 'PATCH') {
    handleArchiveUser($m[1]);
} elseif(preg_match('#^/users/(\d+)/restore$#', $path, $m) && $method === 'PATCH') {
    handleRestoreUser($m[1]);

// PATIENTS
} elseif($path === '/patients' && $method === 'GET') {
    handleGetPatients();
} elseif($path === '/patients' && $method === 'POST') {
    handleCreatePatient();
} elseif(preg_match('#^/patients/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetPatient($m[1]);
} elseif(preg_match('#^/patients/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdatePatient($m[1]);
} elseif(preg_match('#^/patients/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeletePatient($m[1]);
} elseif(preg_match('#^/patients/(\d+)/archive$#', $path, $m) && $method === 'PATCH') {
    handleArchivePatient($m[1]);
} elseif(preg_match('#^/patients/(\d+)/restore$#', $path, $m) && $method === 'PATCH') {
    handleRestorePatient($m[1]);

// DEVICES
} elseif($path === '/devices' && $method === 'GET') {
    handleGetDevices();
} elseif($path === '/devices' && $method === 'POST') {
    handleCreateDevice();
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)$#', $path, $m) && $method === 'GET') {
    handleGetDevice($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateDevice($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)$#', $path, $m) && $method === 'PATCH') {
    handleUpdateDevice($m[1]);
} elseif(preg_match('#^/devices/(\d+)/restore$#', $path, $m) && $method === 'PATCH') {
    handleRestoreDevice($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/archive$#', $path, $m) && $method === 'PATCH') {
    handleArchiveDevice($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/measurements$#', $path, $m) && $method === 'GET') {
    handleGetDeviceMeasurements($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/measurements$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceMeasurement($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'GET') {
    handleGetDeviceCommands($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceCommand($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/alerts$#', $path, $m) && $method === 'GET') {
    handleGetDeviceAlerts($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/logs$#', $path, $m) && $method === 'GET') {
    handleGetDeviceLogs($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'GET') {
    handleGetDeviceConfig($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'PUT') {
    handleUpdateDeviceConfig($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/ota$#', $path, $m) && $method === 'POST') {
    handleOTAUpdate($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/reports$#', $path, $m) && $method === 'GET') {
    handleGetDeviceReports($m[1]);

// FIRMWARES
} elseif($path === '/firmwares' && $method === 'GET') {
    handleGetFirmwares();
} elseif($path === '/firmwares' && $method === 'POST') {
    handleCreateFirmware();
} elseif(preg_match('#^/firmwares/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetFirmware($m[1]);
} elseif(preg_match('#^/firmwares/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateFirmware($m[1]);
} elseif(preg_match('#^/firmwares/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteFirmware($m[1]);

// NOTIFICATIONS
} elseif($path === '/notifications' && $method === 'GET') {
    handleGetNotifications();
} elseif($path === '/notifications' && $method === 'POST') {
    handleCreateNotification();
} elseif(preg_match('#^/notifications/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetNotification($m[1]);
} elseif(preg_match('#^/notifications/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateNotification($m[1]);
} elseif(preg_match('#^/notifications/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteNotification($m[1]);

// USB LOGS
} elseif($path === '/usb/logs' && $method === 'GET') {
    handleGetUSBLogs();
} elseif($path === '/usb/logs' && $method === 'POST') {
    handleCreateUSBLog();
} elseif(preg_match('#^/usb/logs/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetUSBLog($m[1]);
} elseif(preg_match('#^/usb/logs/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteUSBLog($m[1]);

// MEASUREMENTS
} elseif($path === '/measurements' && $method === 'GET') {
    handleGetMeasurements();
} elseif($path === '/measurements' && $method === 'POST') {
    handleCreateMeasurement();
} elseif(preg_match('#^/measurements/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetMeasurement($m[1]);
} elseif(preg_match('#^/measurements/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateMeasurement($m[1]);
} elseif(preg_match('#^/measurements/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteMeasurement($m[1]);

// COMMANDS
} elseif($path === '/commands' && $method === 'GET') {
    handleGetCommands();
} elseif($path === '/commands' && $method === 'POST') {
    handleCreateCommand();
} elseif(preg_match('#^/commands/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetCommand($m[1]);
} elseif(preg_match('#^/commands/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateCommand($m[1]);
} elseif(preg_match('#^/commands/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteCommand($m[1]);
} elseif($path === '/commands/ack' && $method === 'POST') {
    handleAcknowledgeCommands();

// ALERTS
} elseif($path === '/alerts' && $method === 'GET') {
    handleGetAlerts();
} elseif($path === '/alerts' && $method === 'POST') {
    handleCreateAlert();
} elseif(preg_match('#^/alerts/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetAlert($m[1]);
} elseif(preg_match('#^/alerts/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateAlert($m[1]);
} elseif(preg_match('#^/alerts/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteAlert($m[1]);

// ADMIN - MIGRATIONS
} elseif(preg_match('#^/admin/migrations$#', $path) && $method === 'GET') {
    handleGetMigrations();
} elseif(preg_match('#^/admin/migrate-sql$#', $path) && $method === 'POST') {
    handleMigrateSQL();
} elseif(preg_match('#^/admin/migrate$#', $path) && $method === 'POST') {
    handleMigrate();
} elseif(preg_match('#^/admin/repair-database$#', $path) && $method === 'POST') {
    handleRepairDatabase();
} elseif(preg_match('#^/migrate/firmware-status$#', $path) && $method === 'POST') {
    handleMigrateFirmwareStatus();
} elseif(preg_match('#^/admin/database-audit$#', $path) && $method === 'GET') {
    handleDatabaseAudit();
} elseif(preg_match('#^/admin/database-audit$#', $path) && $method === 'POST') {
    handleRunDatabaseAudit();
} elseif(preg_match('#^/admin/database-audit/repair$#', $path) && $method === 'POST') {
    handleRepairDatabaseAudit();
} elseif($path === '/statistics' && $method === 'GET') {
    handleGetStatistics();
} elseif($path === '/statistics/performance' && $method === 'GET') {
    handleGetPerformanceStatistics();
} elseif($path === '/statistics/usage' && $method === 'GET') {
    handleGetUsageStatistics();
} elseif($path === '/statistics/errors' && $method === 'GET') {
    handleGetErrorStatistics();
} elseif($path === '/system/info' && $method === 'GET') {
    handleGetSystemInfo();
} elseif($path === '/system/health' && $method === 'GET') {
    handleSystemHealthCheck();
} elseif($path === '/system/logs' && $method === 'GET') {
    handleGetSystemLogs();
} elseif($path === '/system/clear-cache' && $method === 'POST') {
    handleClearSystemCache();

// FALLBACK - Route non trouvée
} else {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error' => 'Route non trouvée',
        'path' => $path,
        'method' => $method,
        'available_routes' => [
            'GET /health',
            'POST /auth/login',
            'GET /auth/me',
            'GET /users',
            'POST /users',
            'GET /patients',
            'POST /patients',
            'GET /devices',
            'POST /devices',
            'GET /firmwares',
            'POST /firmwares',
            'GET /notifications',
            'POST /notifications',
            'GET /usb/logs',
            'GET /statistics',
            'GET /admin/migrations',
            'POST /admin/migrate-sql',
            'POST /admin/migrate',
            'GET /admin/database-audit',
            'POST /admin/database-audit',
            'GET /system/info'
        ]
    ]);
}

// Nettoyer le buffer final
while (ob_get_level() > 0) {
    ob_end_clean();
}

// Envoyer la réponse JSON
header('Content-Type: application/json');
// Version: 2.0.1 - Syntax Fixed
?>
