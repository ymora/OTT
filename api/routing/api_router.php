<?php
/**
 * Routeur principal de l'API
 * Extrait et refactorisé de api.php pour modularisation
 */

require_once __DIR__ . '/../bootstrap/api_bootstrap.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../helpers_sql.php';
require_once __DIR__ . '/../validators.php';
require_once __DIR__ . '/../cache.php';
require_once __DIR__ . '/../handlers/auth.php';

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

// Loguer la requête si activé
if (LOG_REQUESTS) {
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
// } elseif($path === '/auth/verify' && $method === 'POST') {
//     handleVerifyToken(); // TODO: Implement

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
// } elseif(preg_match('#^/users/(\d+)/permanent-delete$#', $path, $m) && $method === 'DELETE') {
//     handlePermanentDeleteUser($m[1]); // TODO: Implement

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
// } elseif(preg_match('#^/patients/(\d+)/permanent-delete$#', $path, $m) && $method === 'DELETE') {
//     handlePermanentDeletePatient($m[1]); // TODO: Implement

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
    // PATCH pour mettre à jour un dispositif (pas pour restaurer)
    handleUpdateDevice($m[1]);
} elseif(preg_match('#^/devices/(\d+)/restore$#', $path, $m) && $method === 'PATCH') {
    // Route spécifique pour restaurer un dispositif archivé
    handleRestoreDevice($m[1]);
} elseif(preg_match('#^/devices/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteDevice($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'GET') {
    handleGetDeviceConfig($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'PUT') {
    handleUpdateDeviceConfig($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/ota$#', $path, $m) && $method === 'POST') {
    handleTriggerOTA($m[1]);

// DEVICE MEASUREMENTS
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/measurements$#', $path, $m) && $method === 'GET') {
    handleGetDeviceMeasurements($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/measurements$#', $path, $m) && $method === 'POST') {
    handlePostMeasurement($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceCommand($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'GET') {
    handleGetDeviceCommands($m[1]);
// } elseif(preg_match('#^/devices/([0-9A-Za-z]+)/commands/pending$#', $path, $m) && $method === 'GET') {
//     handleGetPendingDeviceCommands($m[1]); // TODO: Implement
// } elseif(preg_match('#^/devices/([0-9A-Za-z]+)/commands/([0-9A-Za-z]+)/execute$#', $path, $m) && $method === 'POST') {
//     handleExecuteDeviceCommand($m[1], $m[2]); // TODO: Implement
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/alerts$#', $path, $m) && $method === 'GET') {
    handleGetDeviceAlerts($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/alerts$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceAlert($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/alerts/([0-9A-Za-z]+)/acknowledge$#', $path, $m) && $method === 'POST') {
    handleAcknowledgeAlert($m[1], $m[2]);
// } elseif(preg_match('#^/devices/([0-9A-Za-z]+)/logs$#', $path, $m) && $method === 'GET') {
//     handleGetDeviceLogs($m[1]); // TODO: Implement
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/logs/clear$#', $path, $m) && $method === 'POST') {
    handleClearDeviceLogs($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/reports$#', $path, $m) && $method === 'GET') {
    handleGetDeviceReports($m[1]);
} elseif(preg_match('#^/devices/([0-9A-Za-z]+)/reports/generate$#', $path, $m) && $method === 'POST') {
    handleGenerateDeviceReport($m[1]);

// FIRMWARES
} elseif($method === 'POST' && preg_match('#^/firmwares/upload-ino/?$#', $path)) {
    // Log de debug pour vérifier que la route est bien matchée
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[ROUTER] Route upload-ino matchée - Path: ' . $path . ' Method: ' . $method);
    }
    handleUploadFirmwareIno();
} elseif($method === 'POST' && preg_match('#^/firmwares/compile/?$#', $path)) {
    // Route pour compiler un firmware (nouveau firmware)
    require_once __DIR__ . '/../handlers/firmwares/compile_and_flash.php';
    handleFirmwareCompile();
} elseif($method === 'POST' && preg_match('#^/firmwares/flash/?$#', $path)) {
    // Route pour flasher un firmware existant
    require_once __DIR__ . '/../handlers/firmwares/compile_and_flash.php';
    handleFirmwareFlash();
} elseif($method === 'POST' && preg_match('#^/firmwares/flash-fast/?$#', $path)) {
    // Route pour flasher rapidement un firmware
    require_once __DIR__ . '/../handlers/firmwares/flash_fast.php';
    handleFlashFirmware();
} elseif($method === 'POST' && preg_match('#^/firmwares/compile-and-flash/?$#', $path)) {
    // Route pour compiler et flasher en une seule opération
    require_once __DIR__ . '/../handlers/firmwares/compile_and_flash.php';
    handleFirmwareCompile();
    handleFirmwareFlash();
} elseif($method === 'POST' && preg_match('#^/devices/create/?$#', $path)) {
    // Route pour créer un dispositif (alternative à POST /devices)
    require_once __DIR__ . '/../handlers/devices/crud.php';
    handleCreateDevice();
} elseif($method === 'GET' && preg_match('#^/firmwares/check-version/([^/]+)$#', $path, $matches)) {
    handleCheckFirmwareVersion($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/debug-logs/(\d+)$#', $path, $matches)) {
    require_once __DIR__ . '/../handlers/firmwares/debug_logs.php';
    handleGetCompileDebugLogs($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/compile/(\d+)$#', $path, $matches)) {
    error_log('[ROUTER] Route GET /firmwares/compile/' . $matches[1] . ' matchée - Path: ' . $path);
    // Utiliser la version optimisée (plus rapide, moins de logs)
    require_once __DIR__ . '/../handlers/firmwares/compile_optimized.php';
    // Nettoyer le buffer AVANT d'appeler le handler SSE
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    handleCompileFirmwareOptimized($matches[1]);
    exit; // Important: arrêter l'exécution après SSE pour éviter tout output supplémentaire
} elseif($method === 'GET' && preg_match('#^/firmwares/(\d+)/download$#', $path, $matches)) {
    handleDownloadFirmware($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/(\d+)/ino/?$#', $path, $matches)) {
    // Log de debug
    error_log('[ROUTER] Route GET /firmwares/{id}/ino matchée - Path: ' . $path . ' ID: ' . ($matches[1] ?? 'N/A'));
    handleGetFirmwareIno($matches[1]);
} elseif($method === 'PUT' && preg_match('#^/firmwares/(\d+)/ino/?$#', $path, $matches)) {
    // Vérifier que c'est bien la bonne route avant d'appeler
    if (isset($matches[1]) && is_numeric($matches[1])) {
        handleUpdateFirmwareIno($matches[1]);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'ID de firmware invalide']);
    }
} elseif($path === '/firmwares' && $method === 'GET') {
    handleGetFirmwares();
// } elseif($path === '/firmwares' && $method === 'POST') {
//     handleCreateFirmware(); // TODO: Implement (use handleUploadFirmwareIno instead)
} elseif(preg_match('#^/firmwares/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetFirmware($m[1]);
} elseif(preg_match('#^/firmwares/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateFirmware($m[1]);
} elseif(preg_match('#^/firmwares/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteFirmware($m[1]);
// } elseif(preg_match('#^/firmwares/(\d+)/archive$#', $path, $m) && $method === 'PATCH') {
//     handleArchiveFirmware($m[1]); // TODO: Implement
} elseif(preg_match('#^/firmwares/(\d+)/restore$#', $path, $m) && $method === 'PATCH') {
    handleRestoreFirmware($m[1]);
// } elseif(preg_match('#^/firmwares/(\d+)/permanent-delete$#', $path, $m) && $method === 'DELETE') {
//     handlePermanentDeleteFirmware($m[1]); // TODO: Implement

// NOTIFICATIONS
} elseif($path === '/notifications' && $method === 'GET') {
    handleGetNotifications();
} elseif($path === '/notifications' && $method === 'POST') {
    handleCreateNotification();
// } elseif(preg_match('#^/notifications/(\d+)$#', $path, $m) && $method === 'GET') {
//     handleGetNotification($m[1]); // TODO: Implement
} elseif(preg_match('#^/notifications/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateNotification($m[1]);
} elseif(preg_match('#^/notifications/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteNotification($m[1]);
} elseif(preg_match('#^/notifications/(\d+)/mark-read$#', $path, $m) && $method === 'PATCH') {
    handleMarkNotificationAsRead($m[1]);
} elseif(preg_match('#^/notifications/mark-all-read$#', $path) && $method === 'PATCH') {
    handleMarkAllNotificationsAsRead();
} elseif(preg_match('#^/notifications/unread-count$#', $path) && $method === 'GET') {
    handleGetUnreadNotificationsCount();
// } elseif(preg_match('#^/notifications/clear-all$#', $path) && $method === 'DELETE') {
//     handleClearAllNotifications(); // TODO: Implement

// USB LOGS
} elseif($path === '/usb/logs' && $method === 'GET') {
    // Nettoyer le buffer AVANT d'appeler le handler
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    
    // Le Content-Type sera défini dans handleUsbLogsRequest()
    echo handleUsbLogsRequest($pdo, $method, $path, $body, $_GET, $userId, $userRole);

// Migration avec SQL en body - Route pour exécuter du SQL directement
} elseif($method === 'POST' && ($path === '/admin/migrate-sql' || preg_match('#^/admin/migrate-sql/?$#', $path))) {
    $user = requireAuth();
    if ($user['role_name'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin requis.']);
        return;
    }
    
    $body = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($body['sql'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'SQL requis']);
        return;
    }
    
    $sql = $body['sql'];
    
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        
        echo json_encode([
            'success' => true,
            'message' => 'SQL exécuté avec succès',
            'affected_rows' => $stmt->rowCount()
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }

// MIGRATIONS
} elseif($path === '/admin/migrations' && $method === 'GET') {
    handleGetMigrationHistory();
} elseif($path === '/admin/migrations' && $method === 'DELETE') {
    handleDeleteMigration($_GET['id'] ?? '');
} elseif(preg_match('#/migrate$#', $path) && $method === 'POST') {
    // Nettoyer le buffer AVANT d'appeler handleRunMigration pour éviter que les warnings polluent la réponse
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    handleRunMigration();
} elseif(preg_match('#/admin/repair-database$#', $path) && $method === 'POST') {
    handleRepairDatabase();
} elseif(preg_match('#/migrate/firmware-status$#', $path) && $method === 'POST') {
    handleMigrateFirmwareStatus();
} elseif(preg_match('#/admin/database-audit$#', $path) && $method === 'GET') {
    handleDatabaseAudit();
} elseif(preg_match('#/admin/database-audit$#', $path) && $method === 'POST') {
    handleRunDatabaseAudit();
} elseif(preg_match('#/admin/database-audit/repair$#', $path) && $method === 'POST') {
    handleRepairDatabaseAudit();
}

// STATISTICS - TODO: Implement these handlers
// } elseif($path === '/statistics' && $method === 'GET') {
//     handleGetStatistics();
// } elseif($path === '/statistics/performance' && $method === 'GET') {
//     handleGetPerformanceStatistics();
// } elseif($path === '/statistics/usage' && $method === 'GET') {
//     handleGetUsageStatistics();
// } elseif($path === '/statistics/errors' && $method === 'GET') {
//     handleGetErrorStatistics();

// SYSTEM - TODO: Implement these handlers
// } elseif($path === '/system/info' && $method === 'GET') {
//     handleGetSystemInfo();
// } elseif($path === '/system/health' && $method === 'GET') {
//     handleSystemHealthCheck();
// } elseif($path === '/system/logs' && $method === 'GET') {
//     handleGetSystemLogs();
// } elseif($path === '/system/clear-cache' && $method === 'POST') {
//     handleClearSystemCache();

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
?>
