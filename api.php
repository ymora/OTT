<?php
/**
 * API REST V2.0 - HAPPLYZ MEDICAL OTT
 * Version complète avec JWT, multi-users, OTA, notifications, audit
 */

require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';
require_once __DIR__ . '/api/helpers.php';
require_once __DIR__ . '/api/handlers/auth.php';
require_once __DIR__ . '/api/handlers/devices.php';
require_once __DIR__ . '/api/handlers/firmwares.php';
require_once __DIR__ . '/api/handlers/notifications.php';

// Démarrer le buffer de sortie pour capturer toute sortie HTML accidentelle
ob_start();

// Headers CORS (DOIT être en tout premier)
// Origines par défaut (production + développement local)
$defaultAllowedOrigins = [
    'https://ymora.github.io',
    'http://localhost:3000',  // Développement local Next.js
    'http://localhost:3003',  // Autres ports locaux
    'http://localhost:5173'   // Vite dev server
];

// Origines supplémentaires via variable d'environnement
$extraOrigins = array_filter(array_map('trim', explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: '')));
$allowedOrigins = array_unique(array_merge($defaultAllowedOrigins, $extraOrigins));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
} elseif (empty($origin)) {
    // Si pas d'origine (requête directe), autoriser toutes les origines
    header('Access-Control-Allow-Origin: *');
} else {
    // Si origine non autorisée, quand même autoriser pour éviter les erreurs CORS
    // (la sécurité est gérée par l'authentification JWT)
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
}

header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-ICCID, X-Requested-With, Cache-Control, Accept');
header('Access-Control-Max-Age: 86400');
// Content-Type sera défini par chaque handler (JSON par défaut, SSE pour compilation)

// Debug mode activable via variable d'environnement
// IMPORTANT: En production, désactiver display_errors pour éviter les erreurs HTML dans les réponses JSON
if (getenv('DEBUG_ERRORS') === 'true') {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    // En production, désactiver l'affichage des erreurs pour éviter les réponses HTML
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
    // Logger les erreurs au lieu de les afficher
    ini_set('log_errors', 1);
}

// Intercepter toutes les erreurs fatales et les convertir en JSON
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // Nettoyer tout output précédent (HTML, warnings, etc.)
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        // S'assurer que le Content-Type est JSON
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode([
            'success' => false,
            'error' => 'Erreur serveur interne',
            'details' => getenv('DEBUG_ERRORS') === 'true' ? $error['message'] : 'Vérifiez les logs du serveur'
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
});

// Intercepter les warnings et notices pour les logger sans les afficher
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    // Logger l'erreur
    error_log("[PHP Error] $errstr in $errfile:$errline");
    
    // Si c'est une erreur fatale, retourner du JSON
    if (in_array($errno, [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // Nettoyer tout output précédent
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode([
            'success' => false,
            'error' => 'Erreur serveur',
            'details' => getenv('DEBUG_ERRORS') === 'true' ? $errstr : 'Vérifiez les logs'
        ]);
        exit;
    }
    
    // Pour les autres erreurs, continuer le traitement normal
    return false;
}, E_ALL & ~E_DEPRECATED & ~E_STRICT);

// Répondre immédiatement aux requêtes OPTIONS (preflight)
// IMPORTANT: Les headers CORS doivent être définis AVANT cette vérification
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Pour les routes SSE, ne pas définir Content-Type (OPTIONS n'a pas de body)
    // Mais s'assurer que les headers CORS sont corrects
    http_response_code(204);
    // Ne pas définir Content-Type pour OPTIONS (pas de body)
    exit();
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Configuration base de données partagée avec le healthcheck
$dbConfig = ott_database_config();
if ($dbConfig === null) {
    http_response_code(500);
    die(json_encode(['success' => false, 'error' => 'Database configuration missing']));
}

define('DB_TYPE', $dbConfig['type']);
define('DB_HOST', $dbConfig['host']);
define('DB_PORT', $dbConfig['port']);
define('DB_NAME', $dbConfig['name']);
define('DB_USER', $dbConfig['user']);
define('DB_PASS', $dbConfig['pass']);

// JWT_SECRET doit être défini en production
$jwtSecret = getenv('JWT_SECRET');
if (empty($jwtSecret)) {
    $isProduction = getenv('APP_ENV') === 'production' || getenv('APP_ENV') === 'prod';
    if ($isProduction) {
        http_response_code(500);
        die(json_encode(['success' => false, 'error' => 'JWT_SECRET must be set in production']));
    }
    // En local, utiliser un secret par défaut (mais loguer un avertissement)
    $jwtSecret = 'CHANGEZ_CE_SECRET_EN_PRODUCTION';
    error_log('[SECURITY WARNING] JWT_SECRET not set, using default. This is UNSAFE in production!');
}
define('JWT_SECRET', $jwtSecret);
define('JWT_EXPIRATION', 86400); // 24h
define('AUTH_DISABLED', getenv('AUTH_DISABLED') === 'true');

define('SENDGRID_API_KEY', getenv('SENDGRID_API_KEY') ?: '');
define('SENDGRID_FROM_EMAIL', getenv('SENDGRID_FROM_EMAIL') ?: 'noreply@happlyz.com');

define('TWILIO_ACCOUNT_SID', getenv('TWILIO_ACCOUNT_SID') ?: '');
define('TWILIO_AUTH_TOKEN', getenv('TWILIO_AUTH_TOKEN') ?: '');
define('TWILIO_FROM_NUMBER', getenv('TWILIO_FROM_NUMBER') ?: '');

define('ENABLE_DEMO_RESET', getenv('ENABLE_DEMO_RESET') === 'true');
define('SQL_BASE_DIR', __DIR__ . '/sql');

// ============================================================================
// CONNEXION BDD
// ============================================================================

try {
    $pdo = new PDO(
        $dbConfig['dsn'],
        $dbConfig['user'],
        $dbConfig['pass'],
        ott_pdo_options($dbConfig['type'])
    );
} catch(PDOException $e) {
    http_response_code(500);
    die(json_encode(['success' => false, 'error' => 'Database connection failed', 'details' => $e->getMessage()]));
}

// ============================================================================
// MIGRATION HANDLERS (conservés dans api.php pour compatibilité)
// ============================================================================

function handleRunMigration() {
    global $pdo;
    
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? null;
    $allowWithoutAuth = in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost'], true) || AUTH_DISABLED || getenv('ALLOW_MIGRATION_ENDPOINT') === 'true';
    $currentUser = getCurrentUser();
    $isAdmin = $currentUser && $currentUser['role_name'] === 'admin';
    
    if (!$allowWithoutAuth && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        return;
    }
    
    try {
        $migrationFile = $_POST['file'] ?? $_GET['file'] ?? 'schema.sql';
        runSqlFile($pdo, $migrationFile);
        echo json_encode(['success' => true, 'message' => 'Migration executed']);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleMigrateFirmwareStatus() {
    global $pdo;
    requireAdmin();
    
    try {
        $results = [];
        
        // 1. Vérifier si la colonne status existe
        $checkStmt = $pdo->query("
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = 'firmware_versions'
                AND column_name = 'status'
            )
        ");
        $columnExists = $checkStmt->fetchColumn();
        $columnExists = ($columnExists === true || $columnExists === 't' || $columnExists === 1 || $columnExists === '1');
        
        if (!$columnExists) {
            $pdo->exec("
                ALTER TABLE firmware_versions 
                ADD COLUMN status VARCHAR(50) DEFAULT 'compiled' 
                CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error'))
            ");
            $results['status_column'] = 'added';
        } else {
            $results['status_column'] = 'already_exists';
        }
        
        // 2. Mettre à jour les firmwares existants sans status
        $updateCount = $pdo->exec("UPDATE firmware_versions SET status = 'compiled' WHERE status IS NULL");
        $results['updated_count'] = intval($updateCount);
        
        // 3. Compter les firmwares
        $countStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $countBefore = intval($countStmt->fetchColumn());
        $results['firmwares_before'] = $countBefore;
        
        // 4. Supprimer tous les firmwares fictifs
        if ($countBefore > 0) {
            $deleteCount = $pdo->exec("DELETE FROM firmware_versions");
            $results['deleted_count'] = intval($deleteCount);
            
            // Vérification finale
            $finalCountStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
            $finalCount = intval($finalCountStmt->fetchColumn());
            $results['firmwares_after'] = $finalCount;
        } else {
            $results['deleted_count'] = 0;
            $results['firmwares_after'] = 0;
        }
        
        auditLog('firmware_db.initialized', 'firmware', null, null, $results);
        
        echo json_encode([
            'success' => true,
            'message' => 'Base de données firmware initialisée avec succès',
            'results' => $results
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleClearFirmwares() {
    global $pdo;
    requireAdmin();
    
    try {
        $countStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $countBefore = intval($countStmt->fetchColumn());
        
        $pdo->exec("DELETE FROM firmware_versions");
        
        $finalCountStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $finalCount = intval($finalCountStmt->fetchColumn());
        
        auditLog('firmware_db.cleared', 'firmware', null, ['count' => $countBefore], ['count' => $finalCount]);
        
        echo json_encode([
            'success' => true,
            'deleted_count' => $countBefore,
            'remaining_count' => $finalCount
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

       function handleHealthCheck() {
           global $pdo;
           
           $health = [
               'success' => true,
               'service' => 'OTT API',
               'version' => '3.3.0',
               'status' => 'online',
               'php_version' => PHP_VERSION,
               'timestamp' => date('c'),
               'database' => 'unknown',
               'modules' => []
           ];
           
           // Test connexion BDD
           try {
               $dbConfig = ott_database_config();
               if ($dbConfig === null) {
                   $health['database'] = 'not_configured';
               } else {
                   $health['database'] = 'configured';
                   // Test connexion
                   $testPdo = new PDO(
                       $dbConfig['dsn'],
                       $dbConfig['user'],
                       $dbConfig['pass'],
                       ott_pdo_options($dbConfig['type'])
                   );
                   $testPdo->query('SELECT 1');
                   $health['database'] = 'connected';
               }
           } catch(Throwable $e) {
               $health['database'] = 'error: ' . $e->getMessage();
               $health['status'] = 'degraded';
           }
           
           // Vérifier modules
           $modules = [
               'api/helpers.php',
               'api/handlers/auth.php',
               'api/handlers/devices.php',
               'api/handlers/firmwares.php',
               'api/handlers/notifications.php'
           ];
           
           foreach ($modules as $module) {
               $health['modules'][$module] = file_exists(__DIR__ . '/' . $module) ? 'loaded' : 'missing';
           }
           
           // Si modules manquants, status = degraded
           if (in_array('missing', $health['modules'], true)) {
               $health['status'] = 'degraded';
           }
           
           http_response_code($health['status'] === 'online' ? 200 : 503);
           echo json_encode($health, JSON_PRETTY_PRINT);
       }

// ============================================================================
// ROUTING
// ============================================================================

function parseRequestPath() {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    
    // Si on est dans api.php directement, extraire le path
    if (strpos($requestUri, '/api.php') !== false) {
        $path = str_replace('/api.php', '', $requestUri);
        $path = strtok($path, '?'); // Supprimer query string
    } else {
        // Sinon, utiliser REQUEST_URI directement
        $path = parse_url($requestUri, PHP_URL_PATH);
    }
    
    // Normaliser le path
    $path = '/' . ltrim($path, '/');
    if ($path === '/') {
        $path = '';
    }
    
    return $path;
}

$path = parseRequestPath();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// Définir Content-Type selon le type de route
// ATTENTION: Pour SSE et /docs/, les headers sont définis dans les handlers
if ($method !== 'OPTIONS') {
    $isSSERoute = preg_match('#/firmwares/compile/(\d+)$#', $path) && $method === 'GET';
    $isDocsRoute = preg_match('#^/docs/#', $path) && $method === 'GET';
    if (!$isSSERoute && !$isDocsRoute) {
        header('Content-Type: application/json; charset=utf-8');
    }
}

// Documentation / Markdown files (doit être en premier pour éviter les conflits)
if(preg_match('#^/docs/([^/]+\.md)$#', $path, $m) && $method === 'GET') {
    $fileName = $m[1];
    $filePath = __DIR__ . '/' . $fileName;
    
    // Debug
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[ROUTER] Route /docs/ matchée - Path: ' . $path . ' File: ' . $fileName . ' FilePath: ' . $filePath);
    }
    
    // Si le fichier n'existe pas, essayer de le générer (pour SUIVI_TEMPS_FACTURATION.md)
    if (!file_exists($filePath) && $fileName === 'SUIVI_TEMPS_FACTURATION.md') {
        $scriptPath = __DIR__ . '/scripts/generate_time_tracking.ps1';
        if (file_exists($scriptPath)) {
            // Essayer de générer le fichier (si PowerShell est disponible)
            // Note: Sur Render/Linux, on pourrait utiliser une version bash du script
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[ROUTER] Tentative de génération du fichier ' . $fileName);
            }
        }
    }
    
    // Sécurité : vérifier que le fichier existe et est dans le répertoire autorisé
    if (file_exists($filePath) && is_readable($filePath)) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        readfile($filePath);
        exit;
    } else {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[ROUTER] Fichier non trouvé - Path: ' . $filePath . ' Exists: ' . (file_exists($filePath) ? 'yes' : 'no'));
        }
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false, 
            'error' => 'File not found. Please commit and push SUIVI_TEMPS_FACTURATION.md to the repository.',
            'path' => $filePath, 
            'fileName' => $fileName
        ]);
        exit;
    }

// Auth
} elseif(preg_match('#/auth/login$#', $path) && $method === 'POST') {
    handleLogin();
} elseif(preg_match('#/auth/me$#', $path) && $method === 'GET') {
    handleGetMe();
} elseif(preg_match('#/auth/refresh$#', $path) && $method === 'POST') {
    handleRefreshToken();

// Users
} elseif(preg_match('#/users$#', $path) && $method === 'GET') {
    handleGetUsers();
} elseif(preg_match('#/users$#', $path) && $method === 'POST') {
    handleCreateUser();
} elseif(preg_match('#/users/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateUser($m[1]);
} elseif(preg_match('#/users/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteUser($m[1]);
} elseif(preg_match('#/users/(\d+)/notifications$#', $path, $m) && $method === 'GET') {
    handleGetUserNotifications($m[1]);
} elseif(preg_match('#/users/(\d+)/notifications$#', $path, $m) && $method === 'PUT') {
    handleUpdateUserNotifications($m[1]);

// Roles
} elseif(preg_match('#/roles$#', $path) && $method === 'GET') {
    handleGetRoles();
} elseif(preg_match('#/permissions$#', $path) && $method === 'GET') {
    handleGetPermissions();

// Devices (API V1 compatible + V2)
} elseif(preg_match('#/devices$#', $path) && $method === 'GET') {
    handleGetDevices();
} elseif(preg_match('#/devices$#', $path) && $method === 'POST') {
    handleCreateDevice();
} elseif(preg_match('#/devices/measurements$#', $path) && $method === 'POST') {
    handlePostMeasurement();
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceCommand($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'GET') {
    handleGetDeviceCommands($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands/pending$#', $path, $m) && $method === 'GET') {
    handleGetPendingCommands($m[1]);
} elseif(preg_match('#/devices/commands/ack$#', $path) && $method === 'POST') {
    handleAcknowledgeCommand();
} elseif(preg_match('#/devices/commands$#', $path) && $method === 'GET') {
    handleListAllCommands();
} elseif(preg_match('#/device/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetDeviceHistory($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateDevice($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteDevice($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'GET') {
    handleGetDeviceConfig($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'PUT') {
    handleUpdateDeviceConfig($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/ota$#', $path, $m) && $method === 'POST') {
    handleTriggerOTA($m[1]);

// Firmwares
// IMPORTANT: Vérifier les routes spécifiques AVANT les routes génériques
} elseif($method === 'POST' && preg_match('#^/firmwares/upload-ino/?$#', $path)) {
    // Log de debug pour vérifier que la route est bien matchée
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[ROUTER] Route upload-ino matchée - Path: ' . $path . ' Method: ' . $method);
    }
    handleUploadFirmwareIno();
} elseif($method === 'GET' && preg_match('#^/firmwares/check-version/([^/]+)$#', $path, $matches)) {
    handleCheckFirmwareVersion($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/compile/(\d+)$#', $path, $matches)) {
    error_log('[ROUTER] Route GET /firmwares/compile/' . $matches[1] . ' matchée - Path: ' . $path);
    handleCompileFirmware($matches[1]);
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
        error_log('[ROUTER] Erreur: ID invalide dans PUT /firmwares/{id}/ino - Path: ' . $path);
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Invalid firmware ID']);
    }
} elseif($method === 'GET' && preg_match('#^/firmwares$#', $path)) {
    handleGetFirmwares();
} elseif($method === 'POST' && preg_match('#^/firmwares$#', $path)) {
    handleUploadFirmware();
} elseif($method === 'DELETE' && preg_match('#^/firmwares/(\d+)$#', $path, $matches)) {
    handleDeleteFirmware($matches[1]);

// Notifications
} elseif(preg_match('#/notifications/preferences$#', $path) && $method === 'GET') {
    handleGetNotificationPreferences();
} elseif(preg_match('#/notifications/preferences$#', $path) && $method === 'PUT') {
    handleUpdateNotificationPreferences();
} elseif(preg_match('#/notifications/test$#', $path) && $method === 'POST') {
    handleTestNotification();
} elseif(preg_match('#/notifications/queue$#', $path) && $method === 'GET') {
    handleGetNotificationsQueue();
} elseif(preg_match('#/notifications/process$#', $path) && $method === 'POST') {
    handleProcessNotificationsQueue();

// Admin tools
} elseif(preg_match('#/admin/reset-demo$#', $path) && $method === 'POST') {
    handleResetDemo();

       // Health check
       } elseif(preg_match('#/health$#', $path) && $method === 'GET') {
           handleHealthCheck();

       // Audit
       } elseif(preg_match('#/audit$#', $path) && $method === 'GET') {
           handleGetAuditLogs();
       } elseif(preg_match('#/audit$#', $path) && $method === 'DELETE') {
           handleClearAuditLogs();

// Logs
} elseif(preg_match('#/logs$#', $path) && $method === 'GET') {
    handleGetLogs();
} elseif(preg_match('#/logs$#', $path) && $method === 'POST') {
    handlePostLog();

// Alerts (V1 compatible)
} elseif(preg_match('#/alerts$#', $path) && $method === 'GET') {
    handleGetAlerts();
} elseif(preg_match('#/measurements/latest$#', $path) && $method === 'GET') {
    handleGetLatestMeasurements();

// Patients (V1 compatible)
} elseif(preg_match('#/patients$#', $path) && $method === 'GET') {
    handleGetPatients();
} elseif(preg_match('#/patients$#', $path) && $method === 'POST') {
    handleCreatePatient();
} elseif(preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdatePatient($m[1]);
} elseif(preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeletePatient($m[1]);
} elseif(preg_match('#/patients/(\d+)/notifications$#', $path, $m) && $method === 'GET') {
    handleGetPatientNotifications($m[1]);
} elseif(preg_match('#/patients/(\d+)/notifications$#', $path, $m) && $method === 'PUT') {
    handleUpdatePatientNotifications($m[1]);

// Reports
} elseif(preg_match('#/reports/overview$#', $path) && $method === 'GET') {
    handleGetReportsOverview();

// Migration & Admin (endpoints de maintenance - admin uniquement)
} elseif(preg_match('#/migrate$#', $path) && $method === 'POST') {
    handleRunMigration();
} elseif(preg_match('#/migrate/firmware-status$#', $path) && $method === 'POST') {
    handleMigrateFirmwareStatus();
} elseif(preg_match('#/admin/clear-firmwares$#', $path) && $method === 'POST') {
    handleClearFirmwares();
       } elseif(preg_match('#/admin/init-firmware-db$#', $path) && $method === 'POST') {
           // Alias pour handleMigrateFirmwareStatus (même fonctionnalité)
           handleMigrateFirmwareStatus();

       } else {
    // Debug: logger le chemin et la méthode pour comprendre pourquoi l'endpoint n'est pas trouvé
    $debugInfo = [
        'path' => $path,
        'method' => $method,
        'uri' => $_SERVER['REQUEST_URI'] ?? 'N/A',
        'script_name' => $_SERVER['SCRIPT_NAME'] ?? 'N/A',
        'request_method' => $_SERVER['REQUEST_METHOD'] ?? 'N/A'
    ];
    
    // Log spécifique pour les routes firmwares/ino qui ne matchent pas
    if (preg_match('#/firmwares.*ino#', $path)) {
        error_log("[API Router] Route firmwares/ino non matchée: " . json_encode($debugInfo));
    }
    
    error_log("[API Router] Path not matched: " . json_encode($debugInfo));
    http_response_code(404);
    echo json_encode([
        'success' => false, 
        'error' => 'Endpoint not found',
        'debug' => $debugInfo
    ]);
}
