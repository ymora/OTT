<?php
/**
 * API REST V2.0 - HAPPLYZ MEDICAL OTT
 * Version complète avec JWT, multi-users, OTA, notifications, audit
 */

require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';

// Headers CORS (DOIT être en tout premier)
// Origines par défaut (production)
$defaultAllowedOrigins = [
    'https://ymora.github.io'
];

// En développement, ajouter localhost
$isDev = getenv('APP_ENV') !== 'production' && getenv('APP_ENV') !== 'prod';
if ($isDev) {
    $defaultAllowedOrigins = array_merge($defaultAllowedOrigins, [
        'http://localhost:3000',
        'http://localhost:3003',
        'http://localhost:5173'
    ]);
}

// Origines supplémentaires via variable d'environnement
$extraOrigins = array_filter(array_map('trim', explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: '')));
$allowedOrigins = array_unique(array_merge($defaultAllowedOrigins, $extraOrigins));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
} elseif (empty($origin)) {
    header('Access-Control-Allow-Origin: *');
}

header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-ICCID, X-Requested-With, Cache-Control, Accept');
header('Access-Control-Max-Age: 86400');
// Content-Type sera défini par chaque handler (JSON par défaut, SSE pour compilation)

// Debug mode activable via variable d'environnement
if (getenv('DEBUG_ERRORS') === 'true') {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
}

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
    // En développement, utiliser un secret par défaut (mais loguer un avertissement)
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
// JWT FUNCTIONS
// ============================================================================

function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function generateJWT($payload) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXPIRATION;
    
    $base64UrlHeader = base64UrlEncode($header);
    $base64UrlPayload = base64UrlEncode(json_encode($payload));
    $signature = hash_hmac('sha256', $base64UrlHeader . '.' . $base64UrlPayload, JWT_SECRET, true);
    $base64UrlSignature = base64UrlEncode($signature);
    
    return $base64UrlHeader . '.' . $base64UrlPayload . '.' . $base64UrlSignature;
}

function verifyJWT($jwt) {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return false;
    
    list($base64UrlHeader, $base64UrlPayload, $base64UrlSignature) = $parts;
    $signature = base64UrlDecode($base64UrlSignature);
    $expectedSignature = hash_hmac('sha256', $base64UrlHeader . '.' . $base64UrlPayload, JWT_SECRET, true);
    
    if (!hash_equals($signature, $expectedSignature)) return false;
    
    $payload = json_decode(base64UrlDecode($base64UrlPayload), true);
    if ($payload['exp'] < time()) return false;
    
    return $payload;
}

function getDemoUser() {
    static $demoUser = null;
    if ($demoUser !== null) return $demoUser;
    
    global $pdo;
    try {
        $stmt = $pdo->prepare("SELECT * FROM users_with_roles ORDER BY id ASC LIMIT 1");
        $stmt->execute();
        $user = $stmt->fetch();
        if ($user) {
            $user['permissions'] = $user['permissions'] ? explode(',', $user['permissions']) : ['*'];
            $demoUser = $user;
            return $demoUser;
        }
    } catch (PDOException $e) {}
    
    $demoUser = [
        'id' => 0,
        'email' => 'demo@ott.local',
        'first_name' => 'Demo',
        'last_name' => 'User',
        'role_name' => 'admin',
        'permissions' => ['*']
    ];
    return $demoUser;
}

function getCurrentUser() {
    if (AUTH_DISABLED) {
        return getDemoUser();
    }
    
    $jwt = null;
    
    // Essayer d'abord depuis les headers (pour les requêtes normales)
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? '';
    
    if (!empty($authHeader) && preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $jwt = $matches[1];
    }
    
    // Si pas trouvé dans les headers, essayer depuis les query parameters (pour EventSource)
    if (empty($jwt) && isset($_GET['token'])) {
        $jwt = $_GET['token'];
    }
    
    if (empty($jwt)) return null;
    
    $payload = verifyJWT($jwt);
    if (!$payload) return null;
    
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM users_with_roles WHERE id = :id AND is_active = TRUE");
    $stmt->execute(['id' => $payload['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user) return null;
    $user['permissions'] = $user['permissions'] ? explode(',', $user['permissions']) : [];
    
    return $user;
}

function requireAuth() {
    $user = getCurrentUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        exit();
    }
    return $user;
}

function requirePermission($permission) {
    $user = requireAuth();
    if (AUTH_DISABLED) {
        return $user;
    }
    if (!in_array($permission, $user['permissions']) && $user['role_name'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        exit();
    }
    return $user;
}

function requireAdmin() {
    $user = requireAuth();
    if (AUTH_DISABLED) {
        return $user;
    }
    if (($user['role_name'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin privileges required']);
        exit();
    }
    return $user;
}

// ============================================================================
// HELPERS - Firmware
// ============================================================================

/**
 * Obtient le répertoire de version pour un firmware (ex: "3.0-rebuild" -> "v3.0")
 */
function getVersionDir($version) {
    // Extraire la version majeure (ex: "3.0-rebuild" -> "v3.0")
    preg_match('/^(\d+\.\d+)/', $version, $matches);
    return 'v' . ($matches[1] ?? 'unknown');
}

/**
 * Copie récursivement un répertoire et son contenu
 */
function copyRecursive($src, $dst) {
    $dir = opendir($src);
    if (!$dir) {
        return false;
    }
    
    if (!is_dir($dst)) {
        mkdir($dst, 0755, true);
    }
    
    while (($file = readdir($dir)) !== false) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        
        $srcPath = $src . '/' . $file;
        $dstPath = $dst . '/' . $file;
        
        if (is_dir($srcPath)) {
            copyRecursive($srcPath, $dstPath);
        } else {
            copy($srcPath, $dstPath);
        }
    }
    
    closedir($dir);
    return true;
}

// ============================================================================
// HELPERS - Database
// ============================================================================

/**
 * Vérifie si une table existe dans la base de données
 */
function tableExists($tableName) {
    global $pdo;
    try {
        $stmt = $pdo->prepare("
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = :table_name
            )
        ");
        $stmt->execute(['table_name' => $tableName]);
        $result = $stmt->fetchColumn();
        return ($result === true || $result === 't' || $result === 1 || $result === '1');
    } catch(PDOException $e) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log("[tableExists] Error checking table $tableName: " . $e->getMessage());
        }
        return false;
    }
}

/**
 * Vérifie si une colonne existe dans une table
 */
function columnExists($tableName, $columnName) {
    global $pdo;
    try {
        $stmt = $pdo->prepare("
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = :table_name
                AND column_name = :column_name
            )
        ");
        $stmt->execute([
            'table_name' => $tableName,
            'column_name' => $columnName
        ]);
        $result = $stmt->fetchColumn();
        return ($result === true || $result === 't' || $result === 1 || $result === '1');
    } catch(PDOException $e) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log("[columnExists] Error checking column $tableName.$columnName: " . $e->getMessage());
        }
        return false;
    }
}

// ============================================================================
// HELPERS - Audit
// ============================================================================

function auditLog($action, $entity_type = null, $entity_id = null, $old_value = null, $new_value = null) {
    global $pdo;
    $user = getCurrentUser();
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, old_value, new_value)
            VALUES (:user_id, :action, :entity_type, :entity_id, :ip_address, :user_agent, :old_value, :new_value)
        ");
        $stmt->execute([
            'user_id' => $user ? $user['id'] : null,
            'action' => $action,
            'entity_type' => $entity_type,
            'entity_id' => $entity_id,
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'old_value' => $old_value ? json_encode($old_value) : null,
            'new_value' => $new_value ? json_encode($new_value) : null
        ]);
    } catch(PDOException $e) {}
}

function runSqlFile(PDO $pdo, $filename) {
    $path = SQL_BASE_DIR . '/' . ltrim($filename, '/');
    if (!file_exists($path)) {
        throw new RuntimeException("SQL file not found: {$filename}");
    }
    $sql = file_get_contents($path);
    if ($sql === false) {
        throw new RuntimeException("Unable to read SQL file: {$filename}");
    }
    $pdo->exec($sql);
}

function handleRunMigration() {
    global $pdo;
    
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? null;
    $allowWithoutAuth = in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost'], true) || AUTH_DISABLED || getenv('ALLOW_MIGRATION_ENDPOINT') === 'true';
    $currentUser = getCurrentUser();
    $isAdmin = $currentUser && $currentUser['role_name'] === 'admin';
    
    if (!$allowWithoutAuth && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden: admin only']);
        return;
    }
    
    $migrationFile = SQL_BASE_DIR . '/schema.sql';
    
    if (!file_exists($migrationFile)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Migration file not found']);
        return;
    }
    
    try {
        $sql = file_get_contents($migrationFile);
        if ($sql === false) {
            throw new RuntimeException("Unable to read migration file");
        }
        
        // Exécuter la migration
        $pdo->exec($sql);
        
        // Vérifier les résultats
        $results = [];
        
        // Vérifier colonne phone et table (utilise helpers)
        $results['phone_column'] = columnExists('users', 'phone') ? 'exists' : 'missing';
        $results['patient_notifications_table'] = tableExists('patient_notifications_preferences') ? 'exists' : 'missing';
        
        echo json_encode([
            'success' => true,
            'message' => 'Migration executed successfully',
            'results' => $results
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Migration error';
        error_log('[handleRunMigration] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleMigrateFirmwareStatus() {
    global $pdo;
    
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? null;
    $allowWithoutAuth = in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost'], true) || AUTH_DISABLED || getenv('ALLOW_MIGRATION_ENDPOINT') === 'true';
    $currentUser = getCurrentUser();
    $isAdmin = $currentUser && $currentUser['role_name'] === 'admin';
    
    if (!$allowWithoutAuth && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden: admin only']);
        return;
    }
    
    try {
        // Vérifier si la colonne existe déjà
        $columnExists = columnExists('firmware_versions', 'status');
        
        if ($columnExists) {
            echo json_encode([
                'success' => true,
                'message' => 'Column status already exists',
                'column_exists' => true
            ]);
            return;
        }
        
        // Ajouter la colonne status
        $pdo->exec("
            ALTER TABLE firmware_versions 
            ADD COLUMN status VARCHAR(50) DEFAULT 'compiled' 
            CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error'))
        ");
        
        // Mettre à jour les firmwares existants
        $pdo->exec("UPDATE firmware_versions SET status = 'compiled' WHERE status IS NULL");
        
        // Vérifier que la colonne a été créée
        $columnExistsAfter = columnExists('firmware_versions', 'status');
        
        echo json_encode([
            'success' => true,
            'message' => 'Column status added successfully',
            'column_exists' => $columnExistsAfter
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Migration error';
        error_log('[handleMigrateFirmwareStatus] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleClearFirmwares() {
    global $pdo;
    
    requirePermission('firmwares.manage');
    
    try {
        // Compter les firmwares avant suppression
        $countStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $countBefore = $countStmt->fetchColumn();
        
        // Supprimer tous les firmwares
        $pdo->exec("DELETE FROM firmware_versions");
        
        auditLog('firmwares.cleared', 'firmware', null, ['count' => $countBefore], ['count' => 0]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Tous les firmwares ont été supprimés',
            'deleted_count' => intval($countBefore)
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleClearFirmwares] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleInitFirmwareDb() {
    global $pdo;
    
    requirePermission('firmwares.manage');
    
    $results = [];
    
    try {
        // 1. Vérifier et ajouter la colonne status
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
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleInitFirmwareDb] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

// ============================================================================
// ROUTER
// ============================================================================

/**
 * Parse et normalise le chemin de la requête
 * Gère les différents formats : /api.php/route, /route, api.php/route
 */
function parseRequestPath() {
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH) ?? '/';
    
    // Gérer PATH_INFO en priorité (Apache mod_rewrite)
    $pathInfo = $_SERVER['PATH_INFO'] ?? '';
    if (!empty($pathInfo)) {
        $path = $pathInfo;
    }
    
    // Normaliser : supprimer /api.php du début si présent
    if (strpos($path, '/api.php') === 0) {
        $path = substr($path, strlen('/api.php'));
        if (empty($path)) {
            $path = '/';
        } else if ($path[0] !== '/') {
            $path = '/' . $path;
        }
    }
    
    // Gérer SCRIPT_NAME si présent (Apache mod_rewrite)
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    if (!empty($scriptName) && $scriptName !== '/api.php' && strpos($path, $scriptName) === 0) {
        $path = substr($path, strlen($scriptName));
        if (empty($path)) {
            $path = '/';
        } else if ($path[0] !== '/') {
            $path = '/' . $path;
        }
    }
    
    // Normaliser les slashes multiples
    $path = preg_replace('#/+#', '/', $path);
    
    // S'assurer que le path commence par /
    if (empty($path) || $path === '') {
        $path = '/';
    } else if ($path[0] !== '/') {
        $path = '/' . $path;
    }
    
    // Log de debug pour les paths firmwares/ino
    if (preg_match('#/firmwares.*ino#', $path)) {
        error_log('[parseRequestPath] Firmwares/ino path: ' . $path . ' URI: ' . $uri . ' PATH_INFO: ' . ($pathInfo ?: 'empty'));
    }
    
    return $path;
}

$path = parseRequestPath();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// Définir Content-Type selon le type de route
// ATTENTION: Pour SSE, les headers sont définis dans handleCompileFirmware() APRÈS l'authentification
// Définir Content-Type selon le type de route
// Pour SSE, les headers sont définis dans handleCompileFirmware() APRÈS l'authentification
if ($method !== 'OPTIONS') {
    $isSSERoute = preg_match('#/firmwares/compile/(\d+)$#', $path) && $method === 'GET';
    if (!$isSSERoute) {
        header('Content-Type: application/json; charset=utf-8');
    }
}

// Auth
if(preg_match('#/auth/login$#', $path) && $method === 'POST') {
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
} elseif(preg_match('#/devices/commands$#', $path) && $method === 'GET') {
    handleListAllCommands();
} elseif(preg_match('#/devices/commands/ack$#', $path) && $method === 'POST') {
    handleAcknowledgeCommand();
} elseif(preg_match('#/devices/logs$#', $path) && $method === 'POST') {
    handlePostLog();
} elseif(preg_match('#/logs$#', $path) && $method === 'GET') {
    handleGetLogs();
} elseif(preg_match('#/devices/(\d+)/config$#', $path, $m) && $method === 'GET') {
    handleGetDeviceConfig($m[1]);
} elseif(preg_match('#/devices/(\d+)/config$#', $path, $m) && $method === 'PUT') {
    handleUpdateDeviceConfig($m[1]);
} elseif(preg_match('#/devices/(\d+)/ota$#', $path, $m) && $method === 'POST') {
    handleTriggerOTA($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceCommand($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'GET') {
    handleGetDeviceCommands($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands/pending$#', $path, $m) && $method === 'GET') {
    handleGetPendingCommands($m[1]);
} elseif(preg_match('#/device/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetDeviceHistory($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateDevice($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteDevice($m[1]);

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

// Audit
} elseif(preg_match('#/audit$#', $path) && $method === 'GET') {
    handleGetAuditLogs();
} elseif(preg_match('#/audit$#', $path) && $method === 'DELETE') {
    handleClearAuditLogs();

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

// Migration (temporaire - à supprimer après exécution)
} elseif(preg_match('#/migrate$#', $path) && $method === 'POST') {
    handleRunMigration();
} elseif(preg_match('#/migrate/firmware-status$#', $path) && $method === 'POST') {
    handleMigrateFirmwareStatus();
} elseif(preg_match('#/admin/clear-firmwares$#', $path) && $method === 'POST') {
    handleClearFirmwares();
} elseif(preg_match('#/admin/init-firmware-db$#', $path) && $method === 'POST') {
    handleInitFirmwareDb();

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

// ============================================================================
// HANDLERS - AUTH
// ============================================================================

function handleLogin() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';
    
    if (empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Email and password required']);
        return;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users_with_roles WHERE email = :email AND is_active = TRUE");
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();
        
        if (!$user || !password_verify($password, $user['password_hash'])) {
            auditLog('user.login_failed', 'user', null, null, ['email' => $email]);
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
            return;
        }
        
        $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = :id")->execute(['id' => $user['id']]);
        
        $token = generateJWT([
            'user_id' => $user['id'],
            'email' => $user['email'],
            'role' => $user['role_name']
        ]);
        
        auditLog('user.login', 'user', $user['id']);
        
        unset($user['password_hash']);
        $user['permissions'] = $user['permissions'] ? explode(',', $user['permissions']) : [];
        
        echo json_encode(['success' => true, 'token' => $token, 'user' => $user]);
        
    } catch(PDOException $e) {
        error_log('[handleLogin] Database error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetMe() {
    $user = requireAuth();
    unset($user['password_hash']);
    echo json_encode(['success' => true, 'user' => $user]);
}

function handleRefreshToken() {
    $user = requireAuth();
    $token = generateJWT(['user_id' => $user['id'], 'email' => $user['email'], 'role' => $user['role_name']]);
    echo json_encode(['success' => true, 'token' => $token]);
}

// ============================================================================
// HANDLERS - USERS
// ============================================================================

function handleGetUsers() {
    global $pdo;
    requirePermission('users.view');
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    
    try {
        // Compter le total (exclure soft delete)
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL");
        $countStmt->execute();
        $total = $countStmt->fetchColumn();
        
        // Vérifier si la colonne phone existe (utilise helper)
        $hasPhoneColumn = columnExists('users', 'phone');
        
        // Requête unifiée : retourner phone si la colonne existe, sinon NULL
        if ($hasPhoneColumn) {
            $stmt = $pdo->prepare("
                SELECT 
                    u.id, u.email, u.first_name, u.last_name, u.phone, u.password_hash,
                    u.is_active, u.last_login, u.created_at,
                    r.name AS role_name,
                    r.description AS role_description,
                    COALESCE(STRING_AGG(p.code, ','), '') AS permissions,
                    COALESCE(unp.email_enabled, FALSE) as email_enabled,
                    COALESCE(unp.sms_enabled, FALSE) as sms_enabled,
                    COALESCE(unp.push_enabled, FALSE) as push_enabled,
                    COALESCE(unp.notify_battery_low, FALSE) as notify_battery_low,
                    COALESCE(unp.notify_device_offline, FALSE) as notify_device_offline,
                    COALESCE(unp.notify_abnormal_flow, FALSE) as notify_abnormal_flow,
                    COALESCE(unp.notify_new_patient, FALSE) as notify_new_patient
                FROM users u
                JOIN roles r ON u.role_id = r.id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                LEFT JOIN user_notifications_preferences unp ON u.id = unp.user_id
                WHERE u.deleted_at IS NULL
                GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.password_hash,
                         u.is_active, u.last_login, u.created_at, r.name, r.description,
                         unp.email_enabled, unp.sms_enabled, unp.push_enabled,
                         unp.notify_battery_low, unp.notify_device_offline, 
                         unp.notify_abnormal_flow, unp.notify_new_patient
                ORDER BY u.created_at DESC
                LIMIT :limit OFFSET :offset
            ");
        } else {
            // Version sans colonne phone - retourner NULL AS phone
            $stmt = $pdo->prepare("
                SELECT 
                    u.id, u.email, u.first_name, u.last_name, NULL AS phone, u.password_hash,
                    u.is_active, u.last_login, u.created_at,
                    r.name AS role_name,
                    r.description AS role_description,
                    COALESCE(STRING_AGG(p.code, ','), '') AS permissions,
                    COALESCE(unp.email_enabled, FALSE) as email_enabled,
                    COALESCE(unp.sms_enabled, FALSE) as sms_enabled,
                    COALESCE(unp.push_enabled, FALSE) as push_enabled,
                    COALESCE(unp.notify_battery_low, FALSE) as notify_battery_low,
                    COALESCE(unp.notify_device_offline, FALSE) as notify_device_offline,
                    COALESCE(unp.notify_abnormal_flow, FALSE) as notify_abnormal_flow,
                    COALESCE(unp.notify_new_patient, FALSE) as notify_new_patient
                FROM users u
                JOIN roles r ON u.role_id = r.id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                LEFT JOIN user_notifications_preferences unp ON u.id = unp.user_id
                WHERE u.deleted_at IS NULL
                GROUP BY u.id, u.email, u.first_name, u.last_name, u.password_hash,
                         u.is_active, u.last_login, u.created_at, r.name, r.description,
                         unp.email_enabled, unp.sms_enabled, unp.push_enabled,
                         unp.notify_battery_low, unp.notify_device_offline, 
                         unp.notify_abnormal_flow, unp.notify_new_patient
                ORDER BY u.created_at DESC
                LIMIT :limit OFFSET :offset
            ");
        }
        
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $users = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true, 
            'users' => $users,
            'pagination' => [
                'total' => intval($total),
                'limit' => $limit,
                'offset' => $offset,
                'has_more' => ($offset + $limit) < $total
            ]
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetUsers] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleCreateUser() {
    global $pdo;
    requirePermission('users.manage');
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (empty($input['email']) || empty($input['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing required fields']);
        return;
    }
    
    // Vérifier si l'email existe déjà (avant de créer)
    try {
        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email AND deleted_at IS NULL");
        $checkStmt->execute(['email' => trim($input['email'])]);
        $existingUser = $checkStmt->fetch();
        if ($existingUser) {
            http_response_code(409);
            echo json_encode([
                'success' => false, 
                'error' => 'Cet email est déjà utilisé par un autre utilisateur'
            ]);
            return;
        }
    } catch(PDOException $e) {
        // Si la vérification échoue, continuer quand même (la contrainte unique le détectera)
        error_log('[handleCreateUser] Email check failed: ' . $e->getMessage());
    }
    
    try {
        // Vérifier si la colonne phone existe (utilise helper)
        $hasPhoneColumn = columnExists('users', 'phone');
        
        // Gérer is_active comme boolean (PostgreSQL)
        $isActive = true; // Par défaut
        if (array_key_exists('is_active', $input)) {
            $value = $input['is_active'];
            if (is_bool($value)) {
                $isActive = $value;
            } elseif (is_string($value)) {
                $trimmed = trim($value);
                if ($trimmed === '' || $trimmed === 'false' || $trimmed === '0' || $trimmed === 'off' || $trimmed === 'no') {
                    $isActive = false;
                } else {
                    $isActive = in_array(strtolower($trimmed), ['true', '1', 'yes', 'on']);
                }
            } elseif (is_numeric($value)) {
                $isActive = (int)$value !== 0;
            }
        }
        
        if ($hasPhoneColumn) {
            $stmt = $pdo->prepare("
                INSERT INTO users (email, password_hash, first_name, last_name, role_id, phone, is_active)
                VALUES (:email, :password_hash, :first_name, :last_name, :role_id, :phone, :is_active)
            ");
            $stmt->execute([
                'email' => $input['email'],
                'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT),
                'first_name' => $input['first_name'] ?? '',
                'last_name' => $input['last_name'] ?? '',
                'role_id' => $input['role_id'] ?? 3, // technicien par défaut (viewer supprimé)
                'phone' => !empty($input['phone']) ? trim($input['phone']) : null,
                'is_active' => $isActive
            ]);
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO users (email, password_hash, first_name, last_name, role_id, is_active)
                VALUES (:email, :password_hash, :first_name, :last_name, :role_id, :is_active)
            ");
            $stmt->execute([
                'email' => $input['email'],
                'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT),
                'first_name' => $input['first_name'] ?? '',
                'last_name' => $input['last_name'] ?? '',
                'role_id' => $input['role_id'] ?? 3, // technicien par défaut (viewer supprimé)
                'is_active' => $isActive
            ]);
        }
        
        $user_id = $pdo->lastInsertId();
        // Créer les préférences de notifications par défaut (unifié avec handleCreatePatient)
        try {
            // Vérifier si la table existe
            // Vérifier si la table existe (utilise helper)
            if (tableExists('user_notifications_preferences')) {
                $pdo->prepare("
                    INSERT INTO user_notifications_preferences 
                    (user_id, email_enabled, sms_enabled, push_enabled, 
                     notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_new_patient) 
                    VALUES (:user_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
                ")->execute(['user_id' => $user_id]);
            }
        } catch(PDOException $e) {
            // Ignorer si la table n'existe pas encore
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleCreateUser] Could not create notification preferences: ' . $e->getMessage());
            }
        }
        
        auditLog('user.created', 'user', $user_id, null, $input);
        echo json_encode(['success' => true, 'user_id' => $user_id]);
        
    } catch(PDOException $e) {
        // Gérer les erreurs de contrainte unique (fallback si la vérification préalable a échoué)
        if ($e->getCode() == 23000 || strpos($e->getMessage(), '23505') !== false || strpos($e->getMessage(), 'duplicate key') !== false) {
            http_response_code(409);
            echo json_encode([
                'success' => false, 
                'error' => 'Cet email est déjà utilisé par un autre utilisateur'
            ]);
        } else {
            http_response_code(500);
            $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur lors de la création de l\'utilisateur';
            error_log('[handleCreateUser] Database error: ' . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $errorMsg]);
        }
    }
}

function handleUpdateUser($user_id) {
    global $pdo;
    requirePermission('users.manage');
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id AND deleted_at IS NULL");
        $stmt->execute(['id' => $user_id]);
        $old_user = $stmt->fetch();
        
        if (!$old_user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'User not found']);
            return;
        }
        
        // Vérifier si la colonne phone existe (utilise helper)
        $hasPhoneColumn = columnExists('users', 'phone');
        
        $updates = [];
        $params = ['id' => $user_id];
        
        // Champs texte normaux
        foreach(['first_name', 'last_name', 'email', 'role_id'] as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
        }
        
        // Gérer is_active comme boolean (PostgreSQL)
        if (array_key_exists('is_active', $input)) {
            $isActive = false;
            $value = $input['is_active'];
            
            // Ignorer les valeurs null ou undefined
            if ($value === null || $value === '') {
                // Ne pas mettre à jour si valeur vide/null
                // Mais si c'est explicitement false, on doit le traiter
                // On considère que '' signifie false pour les checkboxes
                $isActive = false;
            } elseif (is_bool($value)) {
                $isActive = $value;
            } elseif (is_string($value)) {
                $trimmed = trim($value);
                if ($trimmed === '' || $trimmed === 'false' || $trimmed === '0' || $trimmed === 'off' || $trimmed === 'no') {
                    $isActive = false;
                } else {
                    $isActive = in_array(strtolower($trimmed), ['true', '1', 'yes', 'on']);
                }
            } elseif (is_numeric($value)) {
                $isActive = (int)$value !== 0;
            }
            $updates[] = "is_active = " . ($isActive ? 'TRUE' : 'FALSE');
        }
        
        // Gérer le champ phone si la colonne existe
        if ($hasPhoneColumn && array_key_exists('phone', $input)) {
            $updates[] = "phone = :phone";
            $params['phone'] = !empty($input['phone']) ? trim($input['phone']) : null;
        }
        
        if (isset($input['password']) && !empty($input['password'])) {
            $updates[] = "password_hash = :password_hash";
            $params['password_hash'] = password_hash($input['password'], PASSWORD_BCRYPT);
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
            return;
        }
        
        $stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = :id");
        $stmt->execute($params);
        
        // Récupérer l'utilisateur mis à jour pour le retourner
        // Construire la requête selon l'existence de la colonne phone
        if ($hasPhoneColumn) {
            $updatedStmt = $pdo->prepare("
                SELECT 
                    u.id, u.email, u.first_name, u.last_name, u.phone, u.password_hash,
                    u.is_active, u.last_login, u.created_at,
                    r.name AS role_name
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE u.id = :id AND u.deleted_at IS NULL
            ");
        } else {
            $updatedStmt = $pdo->prepare("
                SELECT 
                    u.id, u.email, u.first_name, u.last_name, NULL AS phone, u.password_hash,
                    u.is_active, u.last_login, u.created_at,
                    r.name AS role_name
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE u.id = :id AND u.deleted_at IS NULL
            ");
        }
        $updatedStmt->execute(['id' => $user_id]);
        $updated_user = $updatedStmt->fetch();
        
        auditLog('user.updated', 'user', $user_id, $old_user, $input);
        echo json_encode(['success' => true, 'user' => $updated_user]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleUpdateUser] Database error: ' . $e->getMessage() . ' | User ID: ' . $user_id . ' | Input: ' . json_encode($input));
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleDeleteUser($user_id) {
    global $pdo;
    requirePermission('users.manage');
    
    try {
        // Vérifier que l'utilisateur existe
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        $stmt->execute(['id' => $user_id]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Utilisateur introuvable']);
            return;
        }
        
        // Ne pas permettre la suppression de soi-même
        $currentUser = getCurrentUser();
        if ($currentUser && intval($currentUser['id']) === intval($user_id)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Vous ne pouvez pas supprimer votre propre compte']);
            return;
        }
        
        // Vérifier s'il y a des entrées d'audit liées (optionnel, mais on peut les garder avec user_id NULL)
        // Les dispositifs sont liés aux PATIENTS, pas aux utilisateurs, donc pas de vérification nécessaire
        
        // Supprimer les préférences de notifications associées
        try {
            $pdo->prepare("DELETE FROM user_notifications_preferences WHERE user_id = :user_id")->execute(['user_id' => $user_id]);
        } catch(PDOException $e) {
            // Ignorer si la table n'existe pas
            error_log('[handleDeleteUser] Could not delete notification preferences: ' . $e->getMessage());
        }
        
        // Mettre à jour les logs d'audit pour mettre user_id à NULL (garder l'historique)
        try {
            $pdo->prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = :user_id")->execute(['user_id' => $user_id]);
        } catch(PDOException $e) {
            // Ignorer si ça échoue
            error_log('[handleDeleteUser] Could not update audit logs: ' . $e->getMessage());
        }
        
        // Supprimer l'utilisateur
        // Soft delete au lieu de DELETE réel
        $pdo->prepare("UPDATE users SET deleted_at = NOW() WHERE id = :id")->execute(['id' => $user_id]);
        
        auditLog('user.deleted', 'user', $user_id, $user, null);
        echo json_encode(['success' => true, 'message' => 'Utilisateur supprimé avec succès']);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur de base de données';
        error_log('[handleDeleteUser] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

// ============================================================================
// HANDLERS - ROLES & PERMISSIONS
// ============================================================================

function handleGetRoles() {
    global $pdo;
    requireAuth();
    
    try {
        $stmt = $pdo->prepare("
            SELECT r.*, COALESCE(STRING_AGG(p.code, ','), '') as permissions
            FROM roles r
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            GROUP BY r.id
            ORDER BY r.id
        ");
        $stmt->execute();
        echo json_encode(['success' => true, 'roles' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetRoles] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetPermissions() {
    global $pdo;
    requirePermission('users.roles');
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM permissions ORDER BY category, code");
        $stmt->execute();
        echo json_encode(['success' => true, 'permissions' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

// ============================================================================
// HANDLERS - DEVICES (Compatible V1 + V2)
// ============================================================================

function handleGetDevices() {
    global $pdo;
    
    // Permettre accès sans auth pour dispositifs IoT (rétrocompatibilité)
    // OU avec auth JWT pour dashboard
    $user = getCurrentUser();
    
    try {
        // Requête simplifiée et robuste - éviter duplication firmware_version
        $stmt = $pdo->prepare("
            SELECT 
                d.id,
                d.sim_iccid,
                d.device_serial,
                d.device_name,
                d.status,
                d.patient_id,
                d.installation_date,
                d.first_use_date,
                d.last_seen,
                d.last_battery,
                d.latitude,
                d.longitude,
                d.created_at,
                d.updated_at,
                p.first_name, 
                p.last_name,
                COALESCE(dc.firmware_version, d.firmware_version) as firmware_version,
                COALESCE(dc.ota_pending, FALSE) as ota_pending
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            LEFT JOIN device_configurations dc ON d.id = dc.device_id
            WHERE d.deleted_at IS NULL
            ORDER BY d.last_seen DESC NULLS LAST, d.created_at DESC
        ");
        $stmt->execute();
        $devices = $stmt->fetchAll();
        echo json_encode(['success' => true, 'devices' => $devices]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetDevices] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleCreateDevice() {
    global $pdo;
    requirePermission('devices.edit');

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $sim_iccid = trim($input['sim_iccid'] ?? '');
    $device_name = trim($input['device_name'] ?? '');
    $device_serial = trim($input['device_serial'] ?? '');
    $patient_id = $input['patient_id'] ?? null;

    // Validation ICCID : soit vide/null (dispositif USB non flashé), soit valide (min 10 caractères)
    if ($sim_iccid !== '' && $sim_iccid !== null && strlen($sim_iccid) < 10) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'SIM ICCID invalide (minimum 10 caractères)']);
        return;
    }
    
    // Si pas d'ICCID, générer un identifiant temporaire unique pour permettre la création
    if (empty($sim_iccid) || $sim_iccid === null) {
        // Générer un ICCID temporaire basé sur le device_serial ou device_name
        $tempIdentifier = $device_serial ? substr($device_serial, -8) : 
                        ($device_name ? preg_replace('/[^0-9A-Za-z]/', '', substr($device_name, -8)) : '');
        $sim_iccid = 'TEMP-' . str_pad($tempIdentifier ?: uniqid(), 15, '0', STR_PAD_LEFT);
    }

    $patientParam = null;
    if ($patient_id !== null && $patient_id !== '') {
        $patientParam = (int)$patient_id;
        $stmt = $pdo->prepare("SELECT id FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patientParam]);
        if (!$stmt->fetch()) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Patient inexistant']);
            return;
        }
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO devices (sim_iccid, device_serial, device_name, patient_id, status, installation_date, first_use_date)
            VALUES (:sim_iccid, :device_serial, :device_name, :patient_id, :status, :installation_date, :first_use_date)
            RETURNING *
        ");
        $stmt->execute([
            'sim_iccid' => $sim_iccid,
            'device_serial' => $device_serial ?: null,
            'device_name' => $device_name ?: null,
            'patient_id' => $patientParam,
            'status' => $input['status'] ?? 'inactive',
            'installation_date' => $input['installation_date'] ?? null,
            'first_use_date' => $input['first_use_date'] ?? null,
        ]);
        $device = $stmt->fetch();

        $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id)")
            ->execute(['device_id' => $device['id']]);

        auditLog('device.created', 'device', $device['id'], null, $device);
        echo json_encode(['success' => true, 'device' => $device]);
    } catch(PDOException $e) {
        if ($e->getCode() === '23505') {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'SIM ICCID déjà utilisé']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
    }
}

function handleUpdateDevice($device_id) {
    global $pdo;
    requirePermission('devices.edit');

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    try {
        $stmt = $pdo->prepare("SELECT * FROM devices WHERE id = :id");
        $stmt->execute(['id' => $device_id]);
        $device = $stmt->fetch();

        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Device not found']);
            return;
        }

        $fields = ['device_name', 'status', 'installation_date', 'first_use_date', 'latitude', 'longitude', 'firmware_version'];
        $updates = [];
        $params = ['id' => $device_id];
        
        // Permettre la mise à jour de last_seen via PUT (pour reconnaissance USB)
        if (array_key_exists('last_seen', $input) && $input['last_seen']) {
            $updates[] = "last_seen = :last_seen";
            $params['last_seen'] = $input['last_seen'];
        }

        foreach ($fields as $field) {
            if (array_key_exists($field, $input)) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
        }

        if (array_key_exists('patient_id', $input)) {
            if ($input['patient_id'] === null || $input['patient_id'] === '') {
                $updates[] = "patient_id = NULL";
            } else {
                $patientId = (int)$input['patient_id'];
                $patientCheck = $pdo->prepare("SELECT id FROM patients WHERE id = :id");
                $patientCheck->execute(['id' => $patientId]);
                if (!$patientCheck->fetch()) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'error' => 'Patient not found']);
                    return;
                }
                $updates[] = "patient_id = :patient_id";
                $params['patient_id'] = $patientId;
            }
        }

        if (empty($updates)) {
            echo json_encode(['success' => true, 'device' => $device]);
            return;
        }

        $sql = "UPDATE devices SET " . implode(', ', $updates) . ", updated_at = NOW() WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $stmt = $pdo->prepare("
            SELECT d.*, p.first_name, p.last_name
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            WHERE d.id = :id AND d.deleted_at IS NULL
        ");
        $stmt->execute(['id' => $device_id]);
        $updated = $stmt->fetch();

        auditLog('device.updated', 'device', $device_id, $device, $updated);
        echo json_encode(['success' => true, 'device' => $updated]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleDeleteDevice($device_id) {
    global $pdo;
    requirePermission('devices.delete');
    
    try {
        // Vérifier que le dispositif existe
        $stmt = $pdo->prepare("SELECT * FROM devices WHERE id = :id AND deleted_at IS NULL");
        $stmt->execute(['id' => $device_id]);
        $device = $stmt->fetch();
        
        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Dispositif introuvable']);
            return;
        }
        
        // Vérifier si le dispositif est assigné à un patient
        if ($device['patient_id']) {
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => 'Impossible de supprimer un dispositif assigné à un patient. Désassignez d\'abord le dispositif.'
            ]);
            return;
        }
        
        // Soft delete : mettre deleted_at à NOW()
        $pdo->prepare("UPDATE devices SET deleted_at = NOW() WHERE id = :id")
            ->execute(['id' => $device_id]);
        
        // Enregistrer dans l'audit
        auditLog('device.deleted', 'device', $device_id, $device, null);
        
        echo json_encode([
            'success' => true, 
            'message' => 'Dispositif supprimé avec succès'
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeleteDevice] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

// Fonction helper pour obtenir la position depuis l'IP du client (pour dispositifs USB)
function getLocationFromIp($ip) {
    // Ignorer les IPs locales/privées
    if (empty($ip) || $ip === '127.0.0.1' || $ip === '::1' || 
        strpos($ip, '192.168.') === 0 || strpos($ip, '10.') === 0 || 
        strpos($ip, '172.') === 0 || strpos($ip, 'localhost') !== false) {
        return null;
    }
    
    try {
        // Utiliser ip-api.com (gratuit, sans clé API, limite 45 req/min)
        $url = "http://ip-api.com/json/$ip?fields=status,lat,lon";
        $context = stream_context_create([
            'http' => [
                'timeout' => 2,
                'method' => 'GET'
            ]
        ]);
        $response = @file_get_contents($url, false, $context);
        
        if ($response) {
            $data = json_decode($response, true);
            if ($data && $data['status'] === 'success' && isset($data['lat']) && isset($data['lon'])) {
                return [
                    'latitude' => floatval($data['lat']),
                    'longitude' => floatval($data['lon'])
                ];
            }
        }
    } catch (Exception $e) {
        // Ignorer les erreurs de géolocalisation IP (non critique)
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[getLocationFromIp] Erreur: ' . $e->getMessage());
        }
    }
    
    return null;
}

// Fonction helper pour obtenir l'IP réelle du client
function getClientIp() {
    $ipKeys = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
    foreach ($ipKeys as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = $_SERVER[$key];
            // Si X-Forwarded-For contient plusieurs IPs, prendre la première
            if (strpos($ip, ',') !== false) {
                $ip = trim(explode(',', $ip)[0]);
            }
            return $ip;
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? null;
}

function handlePostMeasurement() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Support des deux formats : device_sim_iccid (ancien) et sim_iccid (firmware)
    $iccid = trim($input['sim_iccid'] ?? $input['device_sim_iccid'] ?? '');
    
    // Validation de l'ICCID (longueur max 20 selon le schéma)
    if (!$input || empty($iccid) || strlen($iccid) > 20) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid data: sim_iccid required and must be max 20 characters']);
        return;
    }
    
    // Support des deux formats pour flow/flowrate
    $flowrate = $input['flow'] ?? $input['flowrate'] ?? $input['payload']['flowrate'] ?? 0;
    // Support des deux formats pour battery
    $battery = $input['battery'] ?? $input['payload']['battery'] ?? 0;
    // RSSI optionnel
    $rssi = $input['rssi'] ?? $input['signal_strength'] ?? null;
    // Firmware version optionnel
    $firmware_version = $input['firmware_version'] ?? null;
    // Timestamp optionnel (auto-généré si absent)
    $timestamp = isset($input['timestamp']) ? $input['timestamp'] : null;
    // Status optionnel
    $status = $input['status'] ?? 'TIMER';
    
    // Position GPS optionnelle (pour dispositifs OTA)
    $latitude = null;
    $longitude = null;
    if (isset($input['latitude']) && is_numeric($input['latitude'])) {
        $latitude = floatval($input['latitude']);
    } elseif (isset($input['payload']['latitude']) && is_numeric($input['payload']['latitude'])) {
        $latitude = floatval($input['payload']['latitude']);
    }
    if (isset($input['longitude']) && is_numeric($input['longitude'])) {
        $longitude = floatval($input['longitude']);
    } elseif (isset($input['payload']['longitude']) && is_numeric($input['payload']['longitude'])) {
        $longitude = floatval($input['payload']['longitude']);
    }
    
    // Détecter si c'est une mesure USB (status = 'USB') ou OTA
    $isUsbMeasurement = ($status === 'USB' || strpos($iccid, 'USB-') === 0 || strpos($iccid, 'TEMP-') === 0);
    
    try {
        // Normaliser le timestamp
        $timestampValue = $timestamp ? date('Y-m-d H:i:s', strtotime($timestamp)) : date('Y-m-d H:i:s');
        
        // Début de transaction pour garantir la cohérence des données
        $pdo->beginTransaction();
        
        try {
            // Utiliser la fonction helper pour rechercher le dispositif
            $device = findDeviceByIdentifier($iccid, true); // true = FOR UPDATE
            
            if (!$device) {
                // Enregistrement automatique du nouveau dispositif avec paramètres par défaut
                // Utiliser l'ICCID comme nom par défaut du dispositif (identifiant unique de la SIM)
                
                // Déterminer la position initiale
                $initialLatitude = null;
                $initialLongitude = null;
                
                if ($isUsbMeasurement) {
                    // Dispositif USB : géolocaliser via IP du client
                    $clientIp = getClientIp();
                    if ($clientIp) {
                        $ipLocation = getLocationFromIp($clientIp);
                        if ($ipLocation) {
                            $initialLatitude = $ipLocation['latitude'];
                            $initialLongitude = $ipLocation['longitude'];
                        }
                    }
                } else {
                    // Dispositif OTA : utiliser les coordonnées GPS/réseau cellulaire envoyées
                    if ($latitude !== null && $longitude !== null) {
                        // Valider les coordonnées
                        if ($latitude >= -90 && $latitude <= 90 && $longitude >= -180 && $longitude <= 180) {
                            $initialLatitude = $latitude;
                            $initialLongitude = $longitude;
                        }
                    }
                }
                
                $insertStmt = $pdo->prepare("
                    INSERT INTO devices (sim_iccid, device_name, device_serial, last_seen, last_battery, firmware_version, status, first_use_date, latitude, longitude)
                    VALUES (:iccid, :device_name, :device_serial, :timestamp, :battery, :firmware_version, 'active', :timestamp, :latitude, :longitude)
                ");
                $insertStmt->execute([
                    'iccid' => $iccid,
                    'device_name' => $iccid, // Utiliser l'ICCID comme nom par défaut
                    'device_serial' => $iccid, // Utiliser l'ICCID comme numéro de série (c'est l'ID unique de la SIM)
                    'battery' => $battery,
                    'firmware_version' => $firmware_version,
                    'timestamp' => $timestampValue,
                    'latitude' => $initialLatitude,
                    'longitude' => $initialLongitude
                ]);
                $device_id = $pdo->lastInsertId();
                
                // Créer la configuration par défaut
                $pdo->prepare("INSERT INTO device_configurations (device_id, firmware_version) VALUES (:device_id, :firmware_version)")
                    ->execute(['device_id' => $device_id, 'firmware_version' => $firmware_version]);
            } else {
                $device_id = $device['id'];
                
                // Mettre à jour les informations du dispositif
                $updateParams = ['battery' => $battery, 'id' => $device_id, 'timestamp' => $timestampValue];
                $updateFields = ['last_seen = :timestamp', 'last_battery = :battery'];
                
                // Mettre à jour la version firmware si fournie et différente
                if ($firmware_version && $firmware_version !== $device['firmware_version']) {
                    $updateFields[] = 'firmware_version = :firmware_version';
                    $updateParams['firmware_version'] = $firmware_version;
                }
                
                // Gestion de la position
                // Pour OTA : utiliser latitude/longitude envoyées par le firmware (GPS ou réseau cellulaire)
                // Pour USB : utiliser l'IP du client pour géolocaliser
                if ($isUsbMeasurement) {
                    // Dispositif USB : géolocaliser via IP du client
                    $clientIp = getClientIp();
                    if ($clientIp) {
                        $ipLocation = getLocationFromIp($clientIp);
                        if ($ipLocation) {
                            $updateFields[] = 'latitude = :latitude';
                            $updateFields[] = 'longitude = :longitude';
                            $updateParams['latitude'] = $ipLocation['latitude'];
                            $updateParams['longitude'] = $ipLocation['longitude'];
                        }
                    }
                } else {
                    // Dispositif OTA : utiliser les coordonnées GPS/réseau cellulaire envoyées
                    if ($latitude !== null && $longitude !== null) {
                        // Valider les coordonnées (latitude: -90 à 90, longitude: -180 à 180)
                        if ($latitude >= -90 && $latitude <= 90 && $longitude >= -180 && $longitude <= 180) {
                            $updateFields[] = 'latitude = :latitude';
                            $updateFields[] = 'longitude = :longitude';
                            $updateParams['latitude'] = $latitude;
                            $updateParams['longitude'] = $longitude;
                        }
                    }
                }
                
                $pdo->prepare("UPDATE devices SET " . implode(', ', $updateFields) . " WHERE id = :id")
                    ->execute($updateParams);
                
                // Mettre à jour la configuration si firmware_version a changé
                if ($firmware_version && $firmware_version !== $device['firmware_version']) {
                    $pdo->prepare("UPDATE device_configurations SET firmware_version = :firmware_version WHERE device_id = :device_id")
                        ->execute(['firmware_version' => $firmware_version, 'device_id' => $device_id]);
                }
            }
            
            // Enregistrer la mesure
            $measurementStmt = $pdo->prepare("
                INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
                VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status)
            ");
            $measurementStmt->execute([
                'device_id' => $device_id,
                'flowrate' => $flowrate,
                'battery' => $battery,
                'rssi' => $rssi,
                'status' => $status,
                'timestamp' => $timestampValue
            ]);
            
            // Alertes
            if ($battery < 20) {
                createAlert($pdo, $device_id, 'low_battery', 'high', "Batterie faible: $battery%");
            }
            
            // Commit de la transaction
            $pdo->commit();
            
            $commands = fetchPendingCommandsForDevice($device_id);
            echo json_encode([
                'success' => true,
                'device_id' => $device_id,
                'device_auto_registered' => !$device,
                'commands' => $commands
            ]);
            
        } catch(PDOException $e) {
            // Rollback en cas d'erreur
            $pdo->rollBack();
            
            // Gérer les contraintes uniques (race condition)
            if ($e->getCode() == 23000) {
                // Contrainte unique violée (dispositif créé entre-temps par une autre requête)
                    // Réessayer une fois
                    try {
                        $pdo->beginTransaction();
                        // Utiliser la fonction helper pour rechercher le dispositif (sans FOR UPDATE pour le retry)
                        $device = findDeviceByIdentifier($iccid, false);
                        
                        if ($device) {
                        $device_id = $device['id'];
                        // Continuer avec la mise à jour et l'insertion de la mesure
                        $updateParams = ['battery' => $battery, 'id' => $device_id, 'timestamp' => $timestampValue];
                        $pdo->prepare("UPDATE devices SET last_seen = :timestamp, last_battery = :battery WHERE id = :id")
                            ->execute($updateParams);
                        
                        $pdo->prepare("
                            INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
                            VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status)
                        ")->execute([
                            'device_id' => $device_id,
                            'flowrate' => $flowrate,
                            'battery' => $battery,
                            'rssi' => $rssi,
                            'status' => $status,
                            'timestamp' => $timestampValue
                        ]);
                        
                        if ($battery < 20) {
                            createAlert($pdo, $device_id, 'low_battery', 'high', "Batterie faible: $battery%");
                        }
                        
                        $pdo->commit();
                        $commands = fetchPendingCommandsForDevice($device_id);
                        echo json_encode([
                            'success' => true,
                            'device_id' => $device_id,
                            'device_auto_registered' => false,
                            'commands' => $commands
                        ]);
                        return;
                    }
                } catch(PDOException $retryE) {
                    $pdo->rollBack();
                    throw $retryE;
                }
            }
            throw $e;
        }
        
    } catch(PDOException $e) {
        // S'assurer que la transaction est annulée
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code($e->getCode() == 23000 ? 409 : 500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handlePostMeasurement] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

/**
 * Recherche un dispositif par ICCID, device_serial ou device_name (avec correspondance partielle)
 * Priorité : sim_iccid exact > device_name exact > device_name LIKE > device_serial exact
 * 
 * @param string $identifier ICCID, serial ou device_name à rechercher
 * @param bool $forUpdate Si true, ajoute FOR UPDATE à la requête (pour transactions)
 * @return array|false Dispositif trouvé ou false
 */
function findDeviceByIdentifier($identifier, $forUpdate = false) {
    global $pdo;
    
    if (empty($identifier)) {
        return false;
    }
    
    $forUpdateClause = $forUpdate ? ' FOR UPDATE' : '';
    
    // 1. Recherche par sim_iccid exact
    $stmt = $pdo->prepare("SELECT * FROM devices WHERE sim_iccid = :identifier" . $forUpdateClause);
    $stmt->execute(['identifier' => $identifier]);
    $device = $stmt->fetch();
    if ($device) {
        return $device;
    }
    
    // 2. Recherche par device_name exact
    $stmt = $pdo->prepare("SELECT * FROM devices WHERE device_name = :identifier" . $forUpdateClause);
    $stmt->execute(['identifier' => $identifier]);
    $device = $stmt->fetch();
    if ($device) {
        return $device;
    }
    
    // 3. Recherche par device_name LIKE (pour USB-xxx:yyy)
    $stmt = $pdo->prepare("SELECT * FROM devices WHERE device_name LIKE :pattern" . $forUpdateClause);
    $stmt->execute(['pattern' => '%' . $identifier . '%']);
    $device = $stmt->fetch();
    if ($device) {
        return $device;
    }
    
    // 4. Recherche par device_serial exact
    $stmt = $pdo->prepare("SELECT * FROM devices WHERE device_serial = :identifier" . $forUpdateClause);
    $stmt->execute(['identifier' => $identifier]);
    $device = $stmt->fetch();
    if ($device) {
        return $device;
    }
    
    return false;
}

/**
 * @deprecated Utiliser findDeviceByIdentifier() à la place
 */
function getDeviceByIccid($iccid) {
    return findDeviceByIdentifier($iccid, false);
}

function normalizePriority($priority) {
    $allowed = ['low', 'normal', 'high', 'critical'];
    $priority = strtolower($priority ?? 'normal');
    return in_array($priority, $allowed) ? $priority : 'normal';
}

function normalizeCommandStatus($status) {
    $allowed = ['pending','executing','executed','error','expired','cancelled'];
    $status = strtolower($status ?? '');
    return in_array($status, $allowed) ? $status : null;
}

function safeJsonDecode($value) {
    if ($value === null || $value === '') {
        return null;
    }
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
}

function expireDeviceCommands($device_id = null) {
    global $pdo;
    $sql = "
        UPDATE device_commands
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
    ";
    $params = [];
    if ($device_id) {
        $sql .= " AND device_id = :device_id";
        $params['device_id'] = $device_id;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
}

function formatCommandForDevice($row) {
    return [
        'id' => (int)$row['id'],
        'command' => $row['command'],
        'payload' => safeJsonDecode($row['payload']),
        'priority' => $row['priority'],
        'status' => $row['status'],
        'execute_after' => $row['execute_after'],
        'expires_at' => $row['expires_at'],
    ];
}

function formatCommandForDashboard($row) {
    return [
        'id' => (int)$row['id'],
        'command' => $row['command'],
        'payload' => safeJsonDecode($row['payload']),
        'priority' => $row['priority'],
        'status' => $row['status'],
        'execute_after' => $row['execute_after'],
        'expires_at' => $row['expires_at'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
        'executed_at' => $row['executed_at'],
        'result_status' => $row['result_status'],
        'result_message' => $row['result_message'],
        'result_payload' => safeJsonDecode($row['result_payload']),
        'device_name' => $row['device_name'] ?? null,
        'sim_iccid' => $row['sim_iccid'] ?? null,
        'patient_first_name' => $row['patient_first_name'] ?? null,
        'patient_last_name' => $row['patient_last_name'] ?? null
    ];
}

function fetchPendingCommandsForDevice($device_id, $limit = 5) {
    global $pdo;
    expireDeviceCommands($device_id);
    
    // Vérifier si une OTA est en attente et créer automatiquement la commande OTA_REQUEST
    $configStmt = $pdo->prepare("
        SELECT target_firmware_version, firmware_url, ota_pending
        FROM device_configurations
        WHERE device_id = :device_id AND ota_pending = TRUE
    ");
    $configStmt->execute(['device_id' => $device_id]);
    $config = $configStmt->fetch();
    
    if ($config && $config['ota_pending']) {
        // Vérifier si une commande OTA_REQUEST n'existe pas déjà
        $existingOtaStmt = $pdo->prepare("
            SELECT id FROM device_commands
            WHERE device_id = :device_id
              AND command = 'OTA_REQUEST'
              AND status = 'pending'
        ");
        $existingOtaStmt->execute(['device_id' => $device_id]);
        
        if (!$existingOtaStmt->fetch()) {
            // Récupérer les infos du firmware (MD5, etc.)
            $firmwareStmt = $pdo->prepare("
                SELECT version, checksum, file_path
                FROM firmware_versions
                WHERE version = :version
            ");
            $firmwareStmt->execute(['version' => $config['target_firmware_version']]);
            $firmware = $firmwareStmt->fetch();
            
            if ($firmware) {
                // Construire l'URL complète
                $base_url = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https://' : 'http://';
                $base_url .= $_SERVER['HTTP_HOST'];
                $firmware_url = $config['firmware_url'] ?: ($base_url . '/' . $firmware['file_path']);
                
                // Calculer le MD5 depuis le fichier (le firmware attend MD5, pas SHA256)
                $firmware_full_path = __DIR__ . '/' . $firmware['file_path'];
                $md5 = file_exists($firmware_full_path) ? hash_file('md5', $firmware_full_path) : '';
                
                // Créer le payload OTA_REQUEST avec url, md5, et version
                $otaPayload = [
                    'url' => $firmware_url,
                    'md5' => $md5,
                    'version' => $firmware['version']
                ];
                
                // Insérer la commande OTA_REQUEST
                $insertStmt = $pdo->prepare("
                    INSERT INTO device_commands (device_id, command, payload, priority, status, execute_after, expires_at)
                    VALUES (:device_id, 'OTA_REQUEST', :payload, 'high', 'pending', NOW(), NOW() + INTERVAL '24 HOURS')
                ");
                $insertStmt->execute([
                    'device_id' => $device_id,
                    'payload' => json_encode($otaPayload)
                ]);
            }
        }
    }
    
    $stmt = $pdo->prepare("
        SELECT id, command, payload, priority, status, execute_after, expires_at
        FROM device_commands
        WHERE device_id = :device_id
          AND status = 'pending'
          AND execute_after <= NOW()
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY 
            CASE priority
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'normal' THEN 3
                ELSE 4
            END,
            created_at ASC
        LIMIT :limit
    ");
    $stmt->bindValue(':device_id', $device_id, PDO::PARAM_INT);
    $stmt->bindValue(':limit', max(1, min($limit, 20)), PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();
    return array_map('formatCommandForDevice', $rows);
}

function handleGetPendingCommands($iccid) {
    $device = getDeviceByIccid($iccid);
    if (!$device) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Device not found']);
        return;
    }
    
    $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 5;
    $commands = fetchPendingCommandsForDevice($device['id'], $limit);
    echo json_encode(['success' => true, 'commands' => $commands]);
}

function handleCreateDeviceCommand($iccid) {
    global $pdo;
    $user = requireAdmin();
    
    $device = getDeviceByIccid($iccid);
    if (!$device) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Device not found']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $command = strtoupper(trim($input['command'] ?? ''));
    if (empty($command)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Command is required']);
        return;
    }
    
    $priority = normalizePriority($input['priority'] ?? 'normal');
    $executeAfter = new DateTime();
    if (!empty($input['execute_after'])) {
        try {
            $executeAfter = new DateTime($input['execute_after']);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid execute_after date']);
            return;
        }
    } elseif (!empty($input['delay_seconds'])) {
        $executeAfter->modify('+' . intval($input['delay_seconds']) . ' seconds');
    }
    
    $expiresAt = null;
    if (!empty($input['expires_at'])) {
        try {
            $expiresAt = new DateTime($input['expires_at']);
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid expires_at date']);
            return;
        }
    } elseif (!empty($input['expires_in_seconds'])) {
        $expiresAt = (clone $executeAfter)->modify('+' . intval($input['expires_in_seconds']) . ' seconds');
    } else {
        $expiresAt = (clone $executeAfter)->modify('+1 hour');
    }
    
    $payloadJson = null;
    if (array_key_exists('payload', $input)) {
        $payloadJson = json_encode($input['payload']);
        if (json_last_error() !== JSON_ERROR_NONE) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid payload JSON']);
            return;
        }
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO device_commands (device_id, command, payload, priority, status, execute_after, expires_at, requested_by)
            VALUES (:device_id, :command, :payload, :priority, 'pending', :execute_after, :expires_at, :requested_by)
        ");
        $stmt->execute([
            'device_id' => $device['id'],
            'command' => $command,
            'payload' => $payloadJson,
            'priority' => $priority,
            'execute_after' => $executeAfter->format('Y-m-d H:i:s'),
            'expires_at' => $expiresAt ? $expiresAt->format('Y-m-d H:i:s') : null,
            'requested_by' => $user['id'] ?? null
        ]);
        
        $commandId = $pdo->lastInsertId();
        auditLog('device.command_create', 'device', $device['id'], null, [
            'command_id' => $commandId,
            'command' => $command,
            'priority' => $priority
        ]);
        
        $stmt = $pdo->prepare("SELECT dc.*, d.sim_iccid, d.device_name FROM device_commands dc JOIN devices d ON dc.device_id = d.id WHERE dc.id = :id");
        $stmt->execute(['id' => $commandId]);
        $row = $stmt->fetch();
        
        echo json_encode(['success' => true, 'command' => formatCommandForDashboard($row)]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetDeviceCommands($iccid) {
    global $pdo;
    requireAdmin();
    
    $device = getDeviceByIccid($iccid);
    if (!$device) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Device not found']);
        return;
    }
    
    $limit = min(intval($_GET['limit'] ?? 100), 500);
    $statusFilter = isset($_GET['status']) ? normalizeCommandStatus($_GET['status']) : null;
    
    try {
        $sql = "
            SELECT dc.*, d.sim_iccid, d.device_name,
                   p.first_name AS patient_first_name,
                   p.last_name AS patient_last_name
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            WHERE dc.device_id = :device_id AND d.deleted_at IS NULL
        ";
        $params = ['device_id' => $device['id']];
        if ($statusFilter) {
            $sql .= " AND dc.status = :status";
            $params['status'] = $statusFilter;
        }
        $sql .= " ORDER BY dc.created_at DESC LIMIT :limit";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        $rows = $stmt->fetchAll();
        echo json_encode(['success' => true, 'commands' => array_map('formatCommandForDashboard', $rows)]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleListAllCommands() {
    global $pdo;
    requireAdmin();
    
    $statusFilter = isset($_GET['status']) ? normalizeCommandStatus($_GET['status']) : null;
    $iccidFilter = $_GET['iccid'] ?? null;
    $limit = min(intval($_GET['limit'] ?? 200), 500);
    
    try {
        expireDeviceCommands();
        $sql = "
            SELECT dc.*, d.sim_iccid, d.device_name,
                   p.first_name AS patient_first_name,
                   p.last_name AS patient_last_name
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            WHERE d.deleted_at IS NULL
        ";
        $params = [];
        if ($statusFilter) {
            $sql .= " AND dc.status = :status";
            $params['status'] = $statusFilter;
        }
        if ($iccidFilter) {
            $sql .= " AND d.sim_iccid = :iccid";
            $params['iccid'] = $iccidFilter;
        }
        $sql .= " ORDER BY dc.created_at DESC LIMIT :limit";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        
        echo json_encode(['success' => true, 'commands' => array_map('formatCommandForDashboard', $rows)]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleAcknowledgeCommand() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    $commandId = intval($input['command_id'] ?? 0);
    $iccid = $input['device_sim_iccid'] ?? '';
    
    if (!$commandId || empty($iccid)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'command_id and device_sim_iccid required']);
        return;
    }
    
    try {
        $stmt = $pdo->prepare("
            SELECT dc.*, d.sim_iccid, d.id as device_id
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            WHERE dc.id = :id
        ");
        $stmt->execute(['id' => $commandId]);
        $command = $stmt->fetch();
        
        if (!$command) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Command not found']);
            return;
        }
        if ($command['sim_iccid'] !== $iccid) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'ICCID mismatch']);
            return;
        }
        if (in_array($command['status'], ['executed', 'cancelled'])) {
            echo json_encode(['success' => true]);
            return;
        }
        
        $statusInput = strtolower($input['status'] ?? 'executed');
        $newStatus = $statusInput === 'error' ? 'error' : 'executed';
        $resultStatus = $statusInput === 'error' ? 'error' : 'success';
        $resultMessage = $input['message'] ?? ($newStatus === 'executed' ? 'Commande exécutée' : 'Commande en erreur');
        $resultPayload = null;
        if (array_key_exists('result_payload', $input)) {
            $resultPayload = json_encode($input['result_payload']);
            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid result_payload JSON']);
                return;
            }
        }
        
        $stmt = $pdo->prepare("
            UPDATE device_commands
            SET status = :status,
                executed_at = NOW(),
                result_status = :result_status,
                result_message = :result_message,
                result_payload = :result_payload
            WHERE id = :id
        ");
        $stmt->execute([
            'status' => $newStatus,
            'result_status' => $resultStatus,
            'result_message' => $resultMessage,
            'result_payload' => $resultPayload,
            'id' => $commandId
        ]);
        
        // Si c'est une commande OTA_REQUEST exécutée, désactiver ota_pending
        if ($command['command'] === 'OTA_REQUEST' && $newStatus === 'executed') {
            $pdo->prepare("
                UPDATE device_configurations
                SET ota_pending = FALSE
                WHERE device_id = :device_id
            ")->execute(['device_id' => $command['device_id']]);
        }
        
        auditLog('device.command_ack', 'device', $command['device_id'], null, [
            'command_id' => $commandId,
            'status' => $newStatus
        ]);
        
        echo json_encode(['success' => true]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleResetDemo() {
    global $pdo;
    $user = requireAdmin();

    if (!ENABLE_DEMO_RESET) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Demo reset disabled on this instance']);
        return;
    }

    $tables = [
        'audit_logs',
        'notifications_queue',
        'device_commands',
        'device_logs',
        'alerts',
        'measurements',
        'firmware_versions',
        'device_configurations',
        'devices',
        'patients',
        'user_notifications_preferences',
        'users',
        'role_permissions',
        'permissions',
        'roles'
    ];

    // Whitelist des tables autorisées pour TRUNCATE (sécurité)
    $allowedTables = [
        'devices', 'measurements', 'alerts', 'device_commands', 'device_logs',
        'device_configurations', 'patients', 'users', 'user_notifications_preferences',
        'patient_notifications_preferences', 'notifications_queue', 'audit_logs',
        'firmware_versions', 'role_permissions', 'permissions', 'roles'
    ];
    
    // Valider que toutes les tables demandées sont dans la whitelist
    $invalidTables = array_diff($tables, $allowedTables);
    if (!empty($invalidTables)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Unauthorized table(s): ' . implode(', ', $invalidTables)
        ]);
        return;
    }

    $startedAt = microtime(true);

    try {
        // TRUNCATE sécurisé : tables validées via whitelist
        $pdo->exec('TRUNCATE TABLE ' . implode(', ', $tables) . ' RESTART IDENTITY CASCADE');
        runSqlFile($pdo, 'base_seed.sql');
        runSqlFile($pdo, 'demo_seed.sql');

        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
        auditLog('admin.reset_demo', 'system', null, null, ['duration_ms' => $durationMs]);

        echo json_encode([
            'success' => true,
            'message' => 'Base de démo réinitialisée',
            'meta' => [
                'duration_ms' => $durationMs,
                'tables_reset' => count($tables),
                'actor' => $user['email'] ?? null
            ]
        ]);
    } catch(Throwable $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Demo reset failed',
            'details' => $e->getMessage()
        ]);
    }
}

function handlePostLog() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Support des deux formats : sim_iccid (firmware) et device_sim_iccid (ancien)
    $iccid = trim($input['sim_iccid'] ?? $input['device_sim_iccid'] ?? '');
    
    // Support des deux formats pour l'événement : event (ancien) ou directement level/event_type/message (firmware)
    $hasEvent = isset($input['event']) || isset($input['level']) || isset($input['event_type']);
    
    // Validation de l'ICCID (longueur max 20 selon le schéma)
    if (!$input || empty($iccid) || strlen($iccid) > 20 || !$hasEvent) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid data: sim_iccid (max 20 chars) and event/level required']);
        return;
    }
    
    // Extraire les données de l'événement selon le format
    $level = $input['event']['level'] ?? $input['level'] ?? 'INFO';
    $event_type = $input['event']['type'] ?? $input['event_type'] ?? 'unknown';
    $message = $input['event']['message'] ?? $input['message'] ?? '';
    $details = $input['event']['details'] ?? $input['details'] ?? null;
    
    try {
        // Début de transaction pour garantir la cohérence
        $pdo->beginTransaction();
        
        try {
            $stmt = $pdo->prepare("SELECT id FROM devices WHERE sim_iccid = :iccid FOR UPDATE");
            $stmt->execute(['iccid' => $iccid]);
            $device = $stmt->fetch();
            
            if (!$device) {
                // Enregistrement automatique du dispositif si inexistant
                // Utiliser l'ICCID comme nom par défaut du dispositif (identifiant unique de la SIM)
                $pdo->prepare("INSERT INTO devices (sim_iccid, device_name, device_serial, status, first_use_date) VALUES (:iccid, :device_name, :device_serial, 'active', NOW())")
                    ->execute([
                        'iccid' => $iccid,
                        'device_name' => $iccid, // Utiliser l'ICCID comme nom par défaut
                        'device_serial' => $iccid // Utiliser l'ICCID comme numéro de série (c'est l'ID unique de la SIM)
                    ]);
                $device_id = $pdo->lastInsertId();
                
                // Créer la configuration par défaut
                $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id)")
                    ->execute(['device_id' => $device_id]);
            } else {
                $device_id = $device['id'];
            }
            
            $pdo->prepare("
                INSERT INTO device_logs (device_id, timestamp, level, event_type, message, details)
                VALUES (:device_id, NOW(), :level, :event_type, :message, :details)
            ")->execute([
                'device_id' => $device_id,
                'level' => $level,
                'event_type' => $event_type,
                'message' => $message,
                'details' => $details ? json_encode($details) : null
            ]);
            
            $pdo->commit();
            
            echo json_encode([
                'success' => true,
                'device_auto_registered' => !$device
            ]);
            
        } catch(PDOException $e) {
            $pdo->rollBack();
            
            // Gérer les contraintes uniques (race condition)
            if ($e->getCode() == 23000) {
                // Réessayer une fois
                try {
                    $pdo->beginTransaction();
                    $retryStmt = $pdo->prepare("SELECT id FROM devices WHERE sim_iccid = :iccid");
                    $retryStmt->execute(['iccid' => $iccid]);
                    $device = $retryStmt->fetch();
                    
                    if ($device) {
                        $device_id = $device['id'];
                        $pdo->prepare("
                            INSERT INTO device_logs (device_id, timestamp, level, event_type, message, details)
                            VALUES (:device_id, NOW(), :level, :event_type, :message, :details)
                        ")->execute([
                            'device_id' => $device_id,
                            'level' => $level,
                            'event_type' => $event_type,
                            'message' => $message,
                            'details' => $details ? json_encode($details) : null
                        ]);
                        $pdo->commit();
                        echo json_encode([
                            'success' => true,
                            'device_auto_registered' => false
                        ]);
                        return;
                    }
                } catch(PDOException $retryE) {
                    $pdo->rollBack();
                    throw $retryE;
                }
            }
            throw $e;
        }
        
    } catch(PDOException $e) {
        // S'assurer que la transaction est annulée
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code($e->getCode() == 23000 ? 409 : 500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handlePostLog] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetLogs() {
    global $pdo;
    
    $device_id = isset($_GET['device_id']) ? intval($_GET['device_id']) : null;
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    
    try {
        $sql = "
            SELECT l.*, d.sim_iccid, d.device_name, p.first_name, p.last_name
            FROM device_logs l
            JOIN devices d ON l.device_id = d.id
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            WHERE d.deleted_at IS NULL
        ";
        
        $params = [];
        if ($device_id) {
            $sql .= " AND l.device_id = :device_id";
            $params['device_id'] = $device_id;
        }
        
        $sql .= " ORDER BY l.timestamp DESC LIMIT :limit";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        echo json_encode(['success' => true, 'logs' => $stmt->fetchAll()]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetDeviceHistory($device_id) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("
            SELECT * FROM measurements 
            WHERE device_id = :device_id 
            ORDER BY timestamp DESC 
            LIMIT 1000
        ");
        $stmt->execute(['device_id' => $device_id]);
        echo json_encode(['success' => true, 'measurements' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetLatestMeasurements() {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("
            SELECT m.*, d.sim_iccid, d.device_name
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            AND d.deleted_at IS NULL
            ORDER BY m.timestamp DESC
        ");
        $stmt->execute();
        echo json_encode(['success' => true, 'measurements' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetAlerts() {
    global $pdo;
    
    // Pagination et filtres
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $status = isset($_GET['status']) ? $_GET['status'] : null;
    $severity = isset($_GET['severity']) ? $_GET['severity'] : null;
    $device_id = isset($_GET['device_id']) ? intval($_GET['device_id']) : null;
    
    try {
        // Construire la requête avec filtres
        $sql = "
            SELECT a.*, d.sim_iccid, d.device_name, p.first_name, p.last_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            WHERE d.deleted_at IS NULL
        ";
        $params = [];
        
        // Filtrer par device_id si fourni
        if ($device_id) {
            $sql .= " AND a.device_id = :device_id";
            $params['device_id'] = $device_id;
        }
        
        // Ne retourner que les alertes actives (non résolues) par défaut
        // Le statut "resolved" n'est plus utilisé - les alertes disparaissent quand elles ne sont plus pertinentes
        if ($status && in_array($status, ['unresolved', 'acknowledged'])) {
            $sql .= " AND a.status = :status";
            $params['status'] = $status;
        } else {
            // Par défaut, exclure les alertes résolues
            $sql .= " AND a.status != 'resolved'";
        }
        
        if ($severity && in_array($severity, ['low', 'medium', 'high', 'critical'])) {
            $sql .= " AND a.severity = :severity";
            $params['severity'] = $severity;
        }
        
        // Compter le total
        $countSql = "SELECT COUNT(*) FROM (" . $sql . ") AS count_query";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();
        
        // Requête avec pagination
        $sql .= " ORDER BY a.created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        echo json_encode([
            'success' => true, 
            'alerts' => $stmt->fetchAll(),
            'pagination' => [
                'total' => intval($total),
                'limit' => $limit,
                'offset' => $offset,
                'has_more' => ($offset + $limit) < $total
            ]
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetAlerts] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetPatients() {
    global $pdo;
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    
    try {
        // Vérifier si la table existe (utilise helper)
        $hasNotificationsTable = tableExists('patient_notifications_preferences');
        
        // Compter le total AVANT la requête principale (exclure soft delete)
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL");
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
        // Requête optimisée avec pagination et préférences de notifications
        // Utiliser COALESCE pour retourner les valeurs par défaut du schéma si NULL
        // TOUJOURS utiliser la version sans JOIN si la table n'existe pas
        if ($hasNotificationsTable) {
            $stmt = $pdo->prepare("
                SELECT p.*, 
                       (SELECT COUNT(*) FROM devices WHERE patient_id = p.id) as device_count,
                       (SELECT COUNT(*) FROM measurements m JOIN devices d ON m.device_id = d.id WHERE d.patient_id = p.id AND m.timestamp >= NOW() - INTERVAL '7 DAYS') as measurements_7d,
                       (SELECT id FROM devices WHERE patient_id = p.id ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS device_id,
                       (SELECT device_name FROM devices WHERE patient_id = p.id ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS device_name,
                       (SELECT sim_iccid FROM devices WHERE patient_id = p.id ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS sim_iccid,
                       COALESCE(pnp.email_enabled, FALSE) as email_enabled,
                       COALESCE(pnp.sms_enabled, FALSE) as sms_enabled,
                       COALESCE(pnp.push_enabled, FALSE) as push_enabled,
                       COALESCE(pnp.notify_battery_low, FALSE) as notify_battery_low,
                       COALESCE(pnp.notify_device_offline, FALSE) as notify_device_offline,
                       COALESCE(pnp.notify_abnormal_flow, FALSE) as notify_abnormal_flow,
                       COALESCE(pnp.notify_alert_critical, FALSE) as notify_alert_critical
                FROM patients p
                LEFT JOIN patient_notifications_preferences pnp ON p.id = pnp.patient_id
                WHERE p.deleted_at IS NULL
                ORDER BY p.last_name, p.first_name
                LIMIT :limit OFFSET :offset
            ");
        } else {
            // Fallback si la table n'existe pas encore
            $stmt = $pdo->prepare("
                SELECT p.*, 
                       (SELECT COUNT(*) FROM devices WHERE patient_id = p.id) as device_count,
                       (SELECT COUNT(*) FROM measurements m JOIN devices d ON m.device_id = d.id WHERE d.patient_id = p.id AND m.timestamp >= NOW() - INTERVAL '7 DAYS') as measurements_7d,
                       (SELECT id FROM devices WHERE patient_id = p.id ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS device_id,
                       (SELECT device_name FROM devices WHERE patient_id = p.id ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS device_name,
                       (SELECT sim_iccid FROM devices WHERE patient_id = p.id ORDER BY updated_at DESC NULLS LAST LIMIT 1) AS sim_iccid,
                       FALSE as email_enabled,
                       FALSE as sms_enabled,
                       FALSE as push_enabled,
                       FALSE as notify_battery_low,
                       FALSE as notify_device_offline,
                       FALSE as notify_abnormal_flow,
                       FALSE as notify_alert_critical
                FROM patients p
                WHERE p.deleted_at IS NULL
                ORDER BY p.last_name, p.first_name
                LIMIT :limit OFFSET :offset
            ");
        }
        
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $patients = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Log pour debug (seulement si DEBUG_ERRORS est activé)
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleGetPatients] Total patients: ' . $total . ' | Found: ' . count($patients) . ' | Has notifications table: ' . ($hasNotificationsTable ? 'yes' : 'no'));
        }
        
        echo json_encode([
            'success' => true, 
            'patients' => $patients,
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'has_more' => ($offset + $limit) < $total
            ]
        ], JSON_UNESCAPED_UNICODE);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetPatients] Database error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleCreatePatient() {
    global $pdo;
    requirePermission('patients.edit');

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $first_name = trim($input['first_name'] ?? '');
    $last_name = trim($input['last_name'] ?? '');
    if (empty($first_name) || empty($last_name)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Prénom et nom sont requis']);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO patients (first_name, last_name, birth_date, phone, email, city, postal_code)
            VALUES (:first_name, :last_name, :birth_date, :phone, :email, :city, :postal_code)
            RETURNING *
        ");
        $stmt->execute([
            'first_name' => $first_name,
            'last_name' => $last_name,
            'birth_date' => $input['birth_date'] ?? null,
            'phone' => $input['phone'] ?? null,
            'email' => $input['email'] ?? null,
            'city' => $input['city'] ?? null,
            'postal_code' => $input['postal_code'] ?? null
        ]);
        $patient = $stmt->fetch();
        
        // Créer les préférences de notifications par défaut (unifié avec handleCreateUser)
        try {
            // Vérifier si la table existe
            // Utiliser helper pour vérifier la table
            $hasTable = tableExists('patient_notifications_preferences');
            if ($hasTable) {
                $pdo->prepare("
                    INSERT INTO patient_notifications_preferences 
                    (patient_id, email_enabled, sms_enabled, push_enabled, 
                     notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_alert_critical) 
                    VALUES (:patient_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
                ")->execute(['patient_id' => $patient['id']]);
            }
        } catch(PDOException $e) {
            // Ignorer si la table n'existe pas encore
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleCreatePatient] Could not create notification preferences: ' . $e->getMessage());
            }
        }
        
        auditLog('patient.created', 'patient', $patient['id'], null, $patient);
        echo json_encode(['success' => true, 'patient' => $patient]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleCreatePatient] Database error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleUpdatePatient($patient_id) {
    global $pdo;
    requirePermission('patients.edit');

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    try {
        $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);
        $patient = $stmt->fetch();

        if (!$patient) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Patient introuvable']);
            return;
        }

        // Champs texte normaux
        $textFields = ['first_name','last_name','birth_date','phone','email','city','postal_code','address','notes'];
        $updates = [];
        $params = ['id' => $patient_id];

        foreach ($textFields as $field) {
            if (array_key_exists($field, $input)) {
                $updates[] = "$field = :$field";
                // Gérer les valeurs null/vides
                $params[$field] = ($input[$field] === '' || $input[$field] === null) ? null : $input[$field];
            }
        }

        if (empty($updates)) {
            echo json_encode(['success' => true, 'patient' => $patient]);
            return;
        }

        $pdo->prepare("
            UPDATE patients SET " . implode(', ', $updates) . ", updated_at = NOW()
            WHERE id = :id
        ")->execute($params);

        // Récupérer le patient mis à jour (unifié avec handleUpdateUser)
        $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);
        $updated = $stmt->fetch();
        auditLog('patient.updated', 'patient', $patient_id, $patient, $updated);
        echo json_encode(['success' => true, 'patient' => $updated]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleUpdatePatient] Database error: ' . $e->getMessage() . ' | Patient ID: ' . $patient_id . ' | Input: ' . json_encode($input));
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleDeletePatient($patient_id) {
    global $pdo;
    requirePermission('patients.edit');

    try {
        // Vérifier que le patient existe
        $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);
        $patient = $stmt->fetch();

        if (!$patient) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Patient introuvable']);
            return;
        }

        // Vérifier s'il y a des dispositifs assignés
        $deviceStmt = $pdo->prepare("SELECT COUNT(*) FROM devices WHERE patient_id = :patient_id");
        $deviceStmt->execute(['patient_id' => $patient_id]);
        $deviceCount = $deviceStmt->fetchColumn();

        if ($deviceCount > 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Impossible de supprimer un patient avec des dispositifs assignés. Veuillez d\'abord désassigner les dispositifs.']);
            return;
        }

        // Supprimer les préférences de notifications associées
        try {
            $pdo->prepare("DELETE FROM patient_notifications_preferences WHERE patient_id = :patient_id")->execute(['patient_id' => $patient_id]);
        } catch(PDOException $e) {
            // Ignorer si la table n'existe pas
            error_log('[handleDeletePatient] Could not delete notification preferences: ' . $e->getMessage());
        }

        // Supprimer le patient
        // Soft delete au lieu de DELETE réel
        $pdo->prepare("UPDATE patients SET deleted_at = NOW() WHERE id = :id")->execute(['id' => $patient_id]);

        auditLog('patient.deleted', 'patient', $patient_id, $patient, null);
        echo json_encode(['success' => true, 'message' => 'Patient supprimé avec succès']);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeletePatient] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetReportsOverview() {
    global $pdo;
    requirePermission('reports.view');

    try {
        // Optimisation : requêtes combinées pour réduire les appels DB
        $statsQuery = $pdo->prepare("
            SELECT 
                (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_total,
                (SELECT COUNT(*) FROM devices WHERE status = 'active' AND deleted_at IS NULL) as devices_active,
                (SELECT COUNT(*) FROM alerts WHERE status = 'unresolved') as alerts_unresolved,
                (SELECT COUNT(*) FROM measurements WHERE timestamp >= NOW() - INTERVAL '24 HOURS') as measurements_24h,
                (SELECT COALESCE(AVG(flowrate), 0) FROM measurements WHERE timestamp >= NOW() - INTERVAL '24 HOURS') as avg_flowrate_24h,
                (SELECT COALESCE(AVG(battery), 0) FROM measurements WHERE battery IS NOT NULL AND timestamp >= NOW() - INTERVAL '24 HOURS') as avg_battery_24h
        ");
        $statsQuery->execute();
        $statsRow = $statsQuery->fetch();
        
        $stats = [
            'devices_total' => (int)$statsRow['devices_total'],
            'devices_active' => (int)$statsRow['devices_active'],
            'alerts_unresolved' => (int)$statsRow['alerts_unresolved'],
            'measurements_24h' => (int)$statsRow['measurements_24h'],
            'avg_flowrate_24h' => round((float)$statsRow['avg_flowrate_24h'], 2),
            'avg_battery_24h' => round((float)$statsRow['avg_battery_24h'], 2)
        ];

        // Utiliser prepare() pour toutes les requêtes (bonne pratique)
        $trendStmt = $pdo->prepare("
            SELECT DATE(timestamp) AS day,
                   ROUND(AVG(flowrate)::numeric, 2) AS avg_flowrate,
                   ROUND(AVG(battery)::numeric, 2) AS avg_battery
            FROM measurements
            WHERE timestamp >= NOW() - INTERVAL '7 DAYS'
            GROUP BY day
            ORDER BY day
        ");
        $trendStmt->execute();

        $topDevicesStmt = $pdo->prepare("
            SELECT d.id, d.device_name, d.sim_iccid, d.latitude, d.longitude, d.status,
                   ROUND(AVG(m.flowrate)::numeric, 2) AS avg_flowrate,
                   ROUND(AVG(m.battery)::numeric, 2) AS avg_battery,
                   MAX(m.timestamp) AS last_measurement
            FROM devices d
            LEFT JOIN measurements m ON m.device_id = d.id
            WHERE d.deleted_at IS NULL
            GROUP BY d.id
            ORDER BY last_measurement DESC NULLS LAST
            LIMIT 5
        ");
        $topDevicesStmt->execute();

        $severityStmt = $pdo->prepare("
            SELECT severity, COUNT(*) AS count
            FROM alerts
            WHERE status = 'unresolved'
            GROUP BY severity
        ");
        $severityStmt->execute();

        $assignmentStmt = $pdo->prepare("
            SELECT p.id AS patient_id,
                   p.first_name,
                   p.last_name,
                   d.device_name,
                   d.sim_iccid,
                   d.status,
                   d.last_seen
            FROM patients p
            LEFT JOIN devices d ON d.patient_id = p.id AND d.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
            ORDER BY p.last_name, p.first_name
        ");
        $assignmentStmt->execute();

        echo json_encode([
            'success' => true,
            'overview' => $stats,
            'trend' => $trendStmt->fetchAll(),
            'top_devices' => $topDevicesStmt->fetchAll(),
            'severity_breakdown' => $severityStmt->fetchAll(),
            'assignments' => $assignmentStmt->fetchAll()
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function createAlert($pdo, $device_id, $type, $severity, $message) {
    try {
        $stmt = $pdo->prepare("
            SELECT id FROM alerts 
            WHERE device_id = :device_id AND type = :type AND status = 'unresolved'
            AND created_at >= NOW() - INTERVAL '1 HOUR'
        ");
        $stmt->execute(['device_id' => $device_id, 'type' => $type]);
        
        if ($stmt->rowCount() > 0) return;
        
        $pdo->prepare("
            INSERT INTO alerts (id, device_id, type, severity, message, status, created_at)
            VALUES (:id, :device_id, :type, :severity, :message, 'unresolved', NOW())
        ")->execute([
            'id' => 'alert_' . uniqid(),
            'device_id' => $device_id,
            'type' => $type,
            'severity' => $severity,
            'message' => $message
        ]);
        
        // Déclencher les notifications pour cette alerte
        triggerAlertNotifications($pdo, $device_id, $type, $severity, $message);
    } catch(PDOException $e) {}
}

// ============================================================================
// HANDLERS - OTA & CONFIGURATION
// ============================================================================

function handleGetDeviceConfig($device_id) {
    global $pdo;
    
    // Permettre dispositifs IoT (header X-Device-ICCID) OU users authentifiés
    $headers = getallheaders();
    $iccid = $headers['X-Device-ICCID'] ?? '';
    
    if (empty($iccid)) {
        requirePermission('devices.view');
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM device_configurations WHERE device_id = :device_id");
        $stmt->execute(['device_id' => $device_id]);
        $config = $stmt->fetch();
        
        if (!$config) {
            $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id)")->execute(['device_id' => $device_id]);
            $stmt->execute(['device_id' => $device_id]);
            $config = $stmt->fetch();
        }
        
        $pdo->prepare("UPDATE device_configurations SET config_applied_at = NOW() WHERE device_id = :device_id")
            ->execute(['device_id' => $device_id]);
        
        echo json_encode(['success' => true, 'config' => $config]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleUpdateDeviceConfig($device_id) {
    global $pdo;
    requireAdmin();
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM device_configurations WHERE device_id = :device_id");
        $stmt->execute(['device_id' => $device_id]);
        $old_config = $stmt->fetch();
        
        $updates = [];
        $params = ['device_id' => $device_id];
        
        foreach(['sleep_minutes', 'measurement_duration_ms', 'send_every_n_wakeups', 'calibration_coefficients'] as $field) {
            if (array_key_exists($field, $input)) {
                if ($input[$field] === null) {
                    // Permettre de mettre à NULL pour réinitialiser
                    $updates[] = "$field = NULL";
                } else {
                $updates[] = "$field = :$field";
                $params[$field] = is_array($input[$field]) ? json_encode($input[$field]) : $input[$field];
                }
            }
        }
        
        $updates[] = "last_config_update = NOW()";
        
        if (count($updates) > 1) {
            $stmt = $pdo->prepare("UPDATE device_configurations SET " . implode(', ', $updates) . " WHERE device_id = :device_id");
            $stmt->execute($params);
            
            auditLog('device.config_updated', 'device', $device_id, $old_config, $input);
            echo json_encode(['success' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
        }
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleTriggerOTA($device_id) {
    global $pdo;
    requirePermission('devices.ota');
    
    $input = json_decode(file_get_contents('php://input'), true);
    $firmware_version = $input['firmware_version'] ?? '';
    
    if (empty($firmware_version)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Firmware version required']);
        return;
    }
    
    try {
        // Récupérer les informations du dispositif
        $deviceStmt = $pdo->prepare("
            SELECT d.*, dc.ota_pending, dc.target_firmware_version
            FROM devices d
            LEFT JOIN device_configurations dc ON d.id = dc.device_id
            WHERE d.id = :device_id AND d.deleted_at IS NULL
        ");
        $deviceStmt->execute(['device_id' => $device_id]);
        $device = $deviceStmt->fetch();
        
        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Dispositif introuvable']);
            return;
        }
        
        // Vérifier si une mise à jour OTA est déjà en cours
        if ($device['ota_pending'] && $device['target_firmware_version']) {
            http_response_code(409);
            echo json_encode([
                'success' => false, 
                'error' => 'Une mise à jour OTA est déjà en cours pour ce dispositif',
                'pending_version' => $device['target_firmware_version']
            ]);
            return;
        }
        
        // Vérifier si le dispositif est hors ligne (> 6 heures)
        if ($device['last_seen']) {
            $lastSeen = new DateTime($device['last_seen']);
            $now = new DateTime();
            $hoursSinceLastSeen = ($now->getTimestamp() - $lastSeen->getTimestamp()) / 3600;
            
            if ($hoursSinceLastSeen > 6) {
                http_response_code(400);
                echo json_encode([
                    'success' => false, 
                    'error' => 'Le dispositif est hors ligne depuis ' . round($hoursSinceLastSeen, 1) . ' heures. Impossible de déclencher OTA.',
                    'hours_offline' => round($hoursSinceLastSeen, 1)
                ]);
                return;
            }
        } else {
            // Dispositif jamais vu
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => 'Le dispositif n\'a jamais été vu en ligne. Impossible de déclencher OTA.'
            ]);
            return;
        }
        
        // Vérifier la batterie (seuil : 20%)
        if ($device['last_battery'] !== null && $device['last_battery'] !== '') {
            $battery = is_numeric($device['last_battery']) ? floatval($device['last_battery']) : null;
            if ($battery !== null && $battery < 20) {
                http_response_code(400);
                echo json_encode([
                    'success' => false, 
                    'error' => 'Batterie trop faible (' . round($battery, 1) . '%). Minimum requis : 20% pour une mise à jour OTA.',
                    'battery_level' => $battery
                ]);
                return;
            }
        }
        
        // Vérifier le firmware
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE version = :version");
        $stmt->execute(['version' => $firmware_version]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware not found']);
            return;
        }
        
        // Construire URL complète
        $base_url = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https://' : 'http://';
        $base_url .= $_SERVER['HTTP_HOST'];
        $firmware_url = $base_url . '/' . $firmware['file_path'];
        
        $pdo->prepare("
            UPDATE device_configurations 
            SET target_firmware_version = :version,
                firmware_url = :url,
                ota_pending = TRUE,
                ota_requested_at = NOW()
            WHERE device_id = :device_id
        ")->execute([
            'version' => $firmware_version,
            'url' => $firmware_url,
            'device_id' => $device_id
        ]);
        
        auditLog('device.ota_triggered', 'device', $device_id, null, ['firmware_version' => $firmware_version]);
        echo json_encode(['success' => true, 'message' => 'OTA triggered']);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleTriggerOTA] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetFirmwares() {
    global $pdo;
    requireAdmin();
    
    try {
        $stmt = $pdo->prepare("
            SELECT fv.*, u.email as uploaded_by_email, u.first_name, u.last_name
            FROM firmware_versions fv
            LEFT JOIN users u ON fv.uploaded_by = u.id AND u.deleted_at IS NULL
            ORDER BY fv.created_at DESC
        ");
        $stmt->execute();
        echo json_encode(['success' => true, 'firmwares' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleCheckFirmwareVersion($version) {
    global $pdo;
    requireAuth();
    
    // Décoder la version (au cas où elle serait encodée)
    $version = urldecode($version);
    
    try {
        $stmt = $pdo->prepare("SELECT id, version, file_path, created_at, status FROM firmware_versions WHERE version = :version");
        $stmt->execute(['version' => $version]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            echo json_encode([
                'success' => true,
                'exists' => true,
                'firmware' => $existing
            ]);
        } else {
            echo json_encode([
                'success' => true,
                'exists' => false
            ]);
        }
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleDeleteFirmware($firmware_id) {
    global $pdo;
    requirePermission('firmwares.manage');
    
    try {
        // Récupérer les infos du firmware avant suppression
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware introuvable']);
            return;
        }
        
        // Supprimer le fichier physique s'il existe
        if (!empty($firmware['file_path'])) {
            $file_path = __DIR__ . '/' . ltrim($firmware['file_path'], '/');
            if (file_exists($file_path)) {
                @unlink($file_path);
            }
        }
        
        // Supprimer aussi le fichier .ino s'il existe dans hardware/firmware/
        $version_dir = getVersionDir($firmware['version']);
        $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
        if (is_dir($ino_dir)) {
            $ino_files = glob($ino_dir . 'fw_ott_v' . $firmware['version'] . '_*.ino');
            foreach ($ino_files as $ino_file) {
                @unlink($ino_file);
            }
        }
        
        // Supprimer de la base de données
        $deleteStmt = $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id");
        $deleteStmt->execute(['id' => $firmware_id]);
        
        auditLog('firmware.deleted', 'firmware', $firmware_id, $firmware, null);
        
        echo json_encode([
            'success' => true,
            'message' => 'Firmware supprimé avec succès',
            'deleted_version' => $firmware['version']
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeleteFirmware] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetFirmwareIno($firmware_id) {
    global $pdo;
    
    // Log de debug
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleGetFirmwareIno] Appelé avec firmware_id: ' . $firmware_id);
    }
    
    requireAuth();
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        // Stocker firmware_id pour utilisation dans la recherche de fichier
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware introuvable']);
            return;
        }
        
        // Construire le chemin du fichier .ino en utilisant l'ID du firmware
        $ino_path = null;
        
        // Essayer d'abord le chemin exact depuis la base de données
        $test_paths = [
            $firmware['file_path'],
            __DIR__ . '/' . $firmware['file_path'],
        ];
        
        // Si le chemin contient hardware/firmware/, essayer aussi sans préfixe
        if (preg_match('#^hardware/firmware/#', $firmware['file_path'])) {
            $relative_path = preg_replace('#^hardware/firmware/#', '', $firmware['file_path']);
            $test_paths[] = __DIR__ . '/hardware/firmware/' . $relative_path;
        }
        
        // Tester chaque chemin
        foreach ($test_paths as $test_path) {
            if (file_exists($test_path) && preg_match('/\.ino$/', $test_path)) {
                $ino_path = $test_path;
                break;
            }
        }
        
        // Si le fichier n'est pas trouvé avec le chemin exact, chercher par ID
        if (!$ino_path || !file_exists($ino_path)) {
            $version_dir = getVersionDir($firmware['version']);
            $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
            
            if (is_dir($ino_dir)) {
                // Chercher le fichier avec l'ID dans le nom (pattern le plus fiable)
                $pattern_with_id = 'fw_ott_v' . $firmware['version'] . '_id' . $firmware_id . '.ino';
                $ino_path_with_id = $ino_dir . $pattern_with_id;
                
                if (file_exists($ino_path_with_id)) {
                    $ino_path = $ino_path_with_id;
                } else {
                    // Fallback : chercher tous les fichiers .ino pour cette version (pour compatibilité avec anciens fichiers)
                    $pattern = 'fw_ott_v' . $firmware['version'] . '_*.ino';
                    $ino_files = glob($ino_dir . $pattern);
                    if (!empty($ino_files)) {
                        // Trier par date de modification (le plus récent en premier)
                        usort($ino_files, function($a, $b) {
                            return filemtime($b) - filemtime($a);
                        });
                        $ino_path = $ino_files[0];
                    }
                }
            }
        }
        
        if (!$ino_path || !file_exists($ino_path)) {
            http_response_code(404);
            $error_msg = 'Fichier .ino introuvable: ' . $firmware['file_path'];
            if (getenv('DEBUG_ERRORS') === 'true') {
                $error_msg .= ' (Version: ' . $firmware['version'] . ', ID: ' . $firmware_id . ')';
            }
            echo json_encode(['success' => false, 'error' => $error_msg]);
            return;
        }
        
        $ino_content = file_get_contents($ino_path);
        if ($ino_content === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible de lire le fichier .ino']);
            return;
        }
        
        echo json_encode([
            'success' => true,
            'content' => $ino_content,
            'version' => $firmware['version'],
            'file_path' => $firmware['file_path'],
            'status' => $firmware['status']
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetFirmwareIno] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleUpdateFirmwareIno($firmware_id) {
    global $pdo;
    
    // Vérifier que l'utilisateur est admin ou technicien
    $user = requireAuth();
    if ($user['role_name'] !== 'admin' && $user['role_name'] !== 'technicien') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin ou technicien requis.']);
        return;
    }
    
    try {
        // Récupérer le body JSON
        $body = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($body['content']) || empty($body['content'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Contenu du fichier .ino manquant']);
            return;
        }
        
        $ino_content = $body['content'];
        
        // Vérifier la version dans le contenu
        $version = null;
        if (preg_match('/FIRMWARE_VERSION_STR\s+"([^"]+)"/', $ino_content, $matches)) {
            $version = $matches[1];
        } else if (preg_match('/FIRMWARE_VERSION\s*=\s*"([^"]+)"/', $ino_content, $matches)) {
            $version = $matches[1];
        }
        
        if (!$version) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.']);
            return;
        }
        
        // Récupérer le firmware existant
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware introuvable']);
            return;
        }
        
        // Vérifier que la version n'a pas changé (ou la mettre à jour si elle a changé)
        if ($firmware['version'] !== $version) {
            // Vérifier si la nouvelle version existe déjà
            $checkStmt = $pdo->prepare("SELECT id FROM firmware_versions WHERE version = :version AND id != :id");
            $checkStmt->execute(['version' => $version, 'id' => $firmware_id]);
            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'La version ' . $version . ' existe déjà']);
                return;
            }
        }
        
        // Trouver le chemin du fichier .ino
        // Utiliser la nouvelle version si elle a changé
        $target_version = $version;
        
        // D'abord, chercher le fichier .ino existant (peut être avec l'ancienne version)
        $ino_path = null;
        
        // Vérifier le file_path original s'il existe et est un .ino
        if (!empty($firmware['file_path']) && preg_match('/\.ino$/', $firmware['file_path'])) {
            $test_path = $firmware['file_path'];
            if (!file_exists($test_path)) {
                $test_path = __DIR__ . '/' . $firmware['file_path'];
            }
            if (file_exists($test_path) && preg_match('/\.ino$/', $test_path)) {
                $ino_path = $test_path;
            }
        }
        
        // Si pas trouvé, chercher dans le dossier de l'ancienne version
        if (!$ino_path) {
            $old_version_dir = getVersionDir($firmware['version']);
            $old_ino_dir = __DIR__ . '/hardware/firmware/' . $old_version_dir . '/';
            if (is_dir($old_ino_dir)) {
                $old_ino_files = glob($old_ino_dir . 'fw_ott_v' . $firmware['version'] . '_*.ino');
                if (!empty($old_ino_files)) {
                    $ino_path = $old_ino_files[0];
                }
            }
        }
        
        // Si la version a changé ou si pas de fichier trouvé, créer/utiliser le dossier de la nouvelle version
        $version_dir = getVersionDir($target_version);
        $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
        
        if (!is_dir($ino_dir)) {
            mkdir($ino_dir, 0755, true);
        }
        
        // Si la version a changé ou si pas de fichier trouvé, utiliser le nouveau dossier
        if ($firmware['version'] !== $target_version || !$ino_path) {
            // Chercher dans le nouveau dossier
            $new_ino_files = glob($ino_dir . 'fw_ott_v' . $target_version . '_*.ino');
            if (!empty($new_ino_files)) {
                $ino_path = $new_ino_files[0];
            } else {
                // Créer un nouveau fichier dans le nouveau dossier avec l'ID
                $ino_filename = 'fw_ott_v' . $target_version . '_id' . $firmware_id . '.ino';
                $ino_path = $ino_dir . $ino_filename;
            }
        }
        
        // Sauvegarder le contenu
        if (file_put_contents($ino_path, $ino_content) === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible d\'enregistrer le fichier .ino']);
            return;
        }
        
        // Mettre à jour la base de données
        $file_size = filesize($ino_path);
        $checksum = hash_file('sha256', $ino_path);
        
        // Calculer le chemin relatif
        $relative_path = str_replace(__DIR__ . '/', '', $ino_path);
        // Normaliser les séparateurs pour la base de données
        $relative_path = str_replace('\\', '/', $relative_path);
        
        $updateStmt = $pdo->prepare("
            UPDATE firmware_versions 
            SET version = :version,
                file_path = :file_path,
                file_size = :file_size,
                checksum = :checksum,
                status = 'pending_compilation'
            WHERE id = :id
        ");
        $updateStmt->execute([
            'version' => $target_version,
            'file_path' => $relative_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'id' => $firmware_id
        ]);
        
        auditLog('firmware.ino.updated', 'firmware', $firmware_id, $firmware, [
            'version' => $version,
            'file_size' => $file_size
        ]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Fichier .ino mis à jour avec succès',
            'version' => $target_version,
            'firmware_id' => $firmware_id
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleUpdateFirmwareIno] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function extractVersionFromBin($bin_path) {
    // Tente d'extraire la version depuis le fichier .bin
    // Cherche la section .version avec OTT_FW_VERSION=
    $data = file_get_contents($bin_path);
    if ($data === false) {
        return null;
    }
    
    // Méthode 1: Chercher OTT_FW_VERSION=<version>
    if (preg_match('/OTT_FW_VERSION=([^\x00]+)/', $data, $matches)) {
        return trim($matches[1]);
    }
    
    // Méthode 2: Chercher des patterns de version (X.Y ou X.Y-Z)
    if (preg_match('/(\d+\.\d+[-\w]*)/', $data, $matches)) {
        $version = trim($matches[1]);
        if (preg_match('/^\d+\.\d+/', $version)) {
            return $version;
        }
    }
    
    return null;
}

function handleUploadFirmware() {
    global $pdo;
    $user = requireAdmin();
    
    if (!isset($_FILES['firmware'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No file uploaded']);
        return;
    }
    
    $file = $_FILES['firmware'];
    $version = $_POST['version'] ?? '';
    $release_notes = $_POST['release_notes'] ?? '';
    $is_stable = isset($_POST['is_stable']) && $_POST['is_stable'] === 'true';
    
    if (pathinfo($file['name'], PATHINFO_EXTENSION) !== 'bin') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid file type: .bin required']);
        return;
    }
    
    // Sauvegarder temporairement pour extraire la version
    $tmp_path = $file['tmp_name'];
    
    // Si version non fournie, tenter de l'extraire depuis le .bin
    if (empty($version)) {
        $extracted_version = extractVersionFromBin($tmp_path);
        if ($extracted_version) {
            $version = $extracted_version;
        } else {
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => 'Version not found in binary and not provided. Please provide version or ensure firmware contains OTT_FW_VERSION section.'
            ]);
            return;
        }
    }
    
    $version_dir = getVersionDir($version);
    $upload_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
    
    $file_path = 'hardware/firmware/' . $version_dir . '/fw_ott_v' . $version . '.bin';
    $full_path = __DIR__ . '/' . $file_path;
    
    if (!move_uploaded_file($tmp_path, $full_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save file']);
        return;
    }
    
    // Calculer MD5 pour validation OTA (en plus du SHA256)
    $md5 = hash_file('md5', $full_path);
    $checksum = hash_file('sha256', $full_path);
    $file_size = filesize($full_path);
    
    try {
        $pdo->prepare("
            INSERT INTO firmware_versions (version, file_path, file_size, checksum, release_notes, is_stable, uploaded_by)
            VALUES (:version, :file_path, :file_size, :checksum, :release_notes, :is_stable, :uploaded_by)
        ")->execute([
            'version' => $version,
            'file_path' => $file_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'release_notes' => $release_notes,
            'is_stable' => $is_stable ? 1 : 0,
            'uploaded_by' => $user['id']
        ]);
        
        $firmware_id = $pdo->lastInsertId();
        auditLog('firmware.uploaded', 'firmware', $firmware_id, null, [
            'version' => $version, 
            'file_size' => $file_size,
            'extracted_from_bin' => empty($_POST['version'])
        ]);
        
        echo json_encode([
            'success' => true, 
            'firmware_id' => $firmware_id, 
            'version' => $version,
            'checksum' => $checksum,
            'md5' => $md5,
            'extracted_from_bin' => empty($_POST['version'])
        ]);
        
    } catch(PDOException $e) {
        unlink($full_path);
        http_response_code($e->getCode() == 23000 ? 409 : 500);
        echo json_encode(['success' => false, 'error' => $e->getCode() == 23000 ? 'Version exists' : 'Database error']);
    }
}

function handleDownloadFirmware($firmware_id) {
    global $pdo;
    requireAuth();
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware not found']);
            return;
        }
        
        $file_path = __DIR__ . '/' . $firmware['file_path'];
        
        if (!file_exists($file_path)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware file not found on server']);
            return;
        }
        
        // Envoyer le fichier
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="fw_ott_v' . $firmware['version'] . '.bin"');
        header('Content-Length: ' . filesize($file_path));
        header('Cache-Control: no-cache, must-revalidate');
        header('Pragma: no-cache');
        
        readfile($file_path);
        exit;
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleUploadFirmwareIno() {
    global $pdo;
    
    // Log de debug
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleUploadFirmwareIno] Début - Method: ' . $_SERVER['REQUEST_METHOD']);
        error_log('[handleUploadFirmwareIno] FILES: ' . json_encode(array_keys($_FILES)));
    }
    
    // Définir Content-Type JSON immédiatement (AVANT requireAuth qui peut exit())
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    
    // Authentification (requireAuth peut exit() directement)
    $user = requireAuth();
    
    // Vérifier que l'utilisateur est admin ou technicien
    if ($user['role_name'] !== 'admin' && $user['role_name'] !== 'technicien') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin ou technicien requis.']);
        return;
    }
    
    // Vérifier que le fichier est présent (AVANT tout traitement)
    if (!isset($_FILES['firmware_ino'])) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] ❌ Fichier non reçu');
            error_log('[handleUploadFirmwareIno] FILES: ' . json_encode($_FILES));
            error_log('[handleUploadFirmwareIno] POST: ' . json_encode($_POST));
            error_log('[handleUploadFirmwareIno] CONTENT_TYPE: ' . ($_SERVER['CONTENT_TYPE'] ?? 'not set'));
        }
        http_response_code(400);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false, 
            'error' => 'No file uploaded',
            'debug' => [
                'files_keys' => array_keys($_FILES),
                'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'not set',
                'method' => $_SERVER['REQUEST_METHOD'] ?? 'not set'
            ]
        ]);
        return;
    }
    
    $file = $_FILES['firmware_ino'];
    
    // Vérifier les erreurs d'upload PHP
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'Fichier trop volumineux (php.ini)',
            UPLOAD_ERR_FORM_SIZE => 'Fichier trop volumineux (formulaire)',
            UPLOAD_ERR_PARTIAL => 'Upload partiel',
            UPLOAD_ERR_NO_FILE => 'Aucun fichier',
            UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant',
            UPLOAD_ERR_CANT_WRITE => 'Erreur d\'écriture',
            UPLOAD_ERR_EXTENSION => 'Extension bloquée'
        ];
        $errorMsg = $errorMessages[$file['error']] ?? 'Erreur inconnue: ' . $file['error'];
        
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] ❌ Erreur upload PHP: ' . $errorMsg);
        }
        
        http_response_code(400);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => $errorMsg]);
        return;
    }
    
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleUploadFirmwareIno] ✅ Fichier reçu: ' . $file['name'] . ' (' . $file['size'] . ' bytes)');
    }
    
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleUploadFirmwareIno] File received: ' . $file['name'] . ' (' . $file['size'] . ' bytes)');
    }
    
    if (pathinfo($file['name'], PATHINFO_EXTENSION) !== 'ino') {
        http_response_code(400);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Invalid file type: .ino required']);
        return;
    }
    
    // Extraire la version depuis le fichier .ino (AVANT de créer le dossier)
    if (!file_exists($file['tmp_name'])) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] Fichier temporaire introuvable: ' . $file['tmp_name']);
        }
        http_response_code(500);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Fichier temporaire introuvable']);
        return;
    }
    
    $ino_content = file_get_contents($file['tmp_name']);
    if ($ino_content === false) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] Impossible de lire le fichier temporaire');
        }
        http_response_code(500);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Impossible de lire le fichier']);
        return;
    }
    
    $version = null;
    
    // Chercher FIRMWARE_VERSION_STR dans le fichier
    if (preg_match('/FIRMWARE_VERSION_STR\s+"([^"]+)"/', $ino_content, $matches)) {
        $version = $matches[1];
    } else if (preg_match('/FIRMWARE_VERSION\s*=\s*"([^"]+)"/', $ino_content, $matches)) {
        $version = $matches[1];
    }
    
    if (!$version) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.']);
        return;
    }
    
    // Vérifier si la version existe déjà
    $existingStmt = $pdo->prepare("SELECT id, version, file_path, created_at FROM firmware_versions WHERE version = :version");
    $existingStmt->execute(['version' => $version]);
    $existingFirmware = $existingStmt->fetch();
    
    if ($existingFirmware) {
        // Version existe déjà - retourner l'info pour afficher le modal
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'error' => 'Cette version de firmware existe déjà',
            'existing_firmware' => [
                'id' => $existingFirmware['id'],
                'version' => $existingFirmware['version'],
                'file_path' => $existingFirmware['file_path'],
                'created_at' => $existingFirmware['created_at']
            ]
        ]);
        return;
    }
    
    // Créer le dossier pour les fichiers .ino uploadés (par version) - APRÈS extraction de la version
    $version_dir = getVersionDir($version);
    $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
    if (!is_dir($ino_dir)) {
        if (!mkdir($ino_dir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible de créer le dossier de destination']);
            return;
        }
    }
    
    // Sauvegarder temporairement le fichier .ino (avant insertion en DB pour obtenir l'ID)
    $temp_filename = 'temp_' . uniqid() . '.ino';
    $temp_path = $ino_dir . $temp_filename;
    
    if (!move_uploaded_file($file['tmp_name'], $temp_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save .ino file']);
        return;
    }
    
    // Vérifier que le fichier temporaire a bien été créé
    if (!file_exists($temp_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Fichier .ino non trouvé après upload']);
        return;
    }
    
    // Enregistrer dans la base de données (statut: pending_compilation) avec un chemin temporaire
    try {
        $file_size = filesize($temp_path);
        $checksum = hash_file('sha256', $temp_path);
        
        // Utiliser RETURNING pour PostgreSQL (plus fiable que lastInsertId)
        $stmt = $pdo->prepare("
            INSERT INTO firmware_versions (version, file_path, file_size, checksum, release_notes, is_stable, uploaded_by, status)
            VALUES (:version, :file_path, :file_size, :checksum, :release_notes, :is_stable, :uploaded_by, 'pending_compilation')
            RETURNING id
        ");
        
        // Chemin temporaire pour l'insertion initiale
        $temp_file_path = 'hardware/firmware/' . $version_dir . '/' . $temp_filename;
        
        $stmt->execute([
            'version' => $version,
            'file_path' => $temp_file_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'release_notes' => 'Compilé depuis .ino',
            'is_stable' => 0,
            'uploaded_by' => $user['id']
        ]);
        
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $firmware_id = $result['id'] ?? $pdo->lastInsertId();
        
        // Renommer le fichier avec l'ID pour garantir l'unicité et la retrouvabilité
        $ino_filename = 'fw_ott_v' . $version . '_id' . $firmware_id . '.ino';
        $ino_path = $ino_dir . $ino_filename;
        $final_file_path = 'hardware/firmware/' . $version_dir . '/' . $ino_filename;
        
        if (!rename($temp_path, $ino_path)) {
            // Si le renommage échoue, nettoyer et retourner une erreur
            @unlink($temp_path);
            // Supprimer l'entrée en DB
            $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id")->execute(['id' => $firmware_id]);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible de renommer le fichier .ino']);
            return;
        }
        
        // Mettre à jour le file_path dans la base de données avec le nom final
        $updateStmt = $pdo->prepare("UPDATE firmware_versions SET file_path = :file_path WHERE id = :id");
        $updateStmt->execute([
            'file_path' => $final_file_path,
            'id' => $firmware_id
        ]);
        
        auditLog('firmware.ino.uploaded', 'firmware', $firmware_id, null, [
            'version' => $version,
            'file_size' => $file_size
        ]);
        
        // S'assurer que le Content-Type est JSON (si pas déjà défini pour SSE)
        if (!headers_sent() && !isset($GLOBALS['sse_mode'])) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        $response = [
            'success' => true,
            'firmware_id' => $firmware_id,
            'upload_id' => $firmware_id,
            'version' => $version,
            'message' => 'Fichier .ino uploadé avec succès. Prêt pour compilation.'
        ];
        
        echo json_encode($response);
        flush(); // Forcer l'envoi immédiat de la réponse
        
        // Log pour debug
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] ✅ Upload réussi - Réponse: ' . json_encode($response));
        }
        
    } catch(PDOException $e) {
        if (isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        $errorMsg = 'Database error';
        if (getenv('DEBUG_ERRORS') === 'true') {
            $errorMsg = $e->getMessage();
            error_log('[handleUploadFirmwareIno] PDOException: ' . $e->getMessage());
        }
        
        if ($e->getCode() == 23000 || strpos($e->getMessage(), '23505') !== false || strpos($e->getMessage(), 'duplicate key') !== false) {
            http_response_code(409);
            $errorMsg = 'Cette version existe déjà';
        } else {
            http_response_code(500);
        }
        
        if (!headers_sent() && !isset($GLOBALS['sse_mode'])) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        if (isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        http_response_code(500);
        if (!headers_sent() && !isset($GLOBALS['sse_mode'])) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur lors de l\'upload';
        error_log('[handleUploadFirmwareIno] Exception: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleCompileFirmware($firmware_id) {
    global $pdo;
    
    // CRITIQUE: Ignorer l'arrêt du script si la connexion client se ferme
    // Cela garantit que la compilation continue même si l'utilisateur change d'onglet
    ignore_user_abort(true);
    set_time_limit(0); // Pas de limite de temps pour la compilation
    
    // Désactiver la mise en buffer pour SSE
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Vérifier si les headers ont déjà été envoyés
    if (!headers_sent()) {
        // Configurer pour Server-Sent Events (SSE) - DOIT être avant tout output
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no'); // Désactiver la mise en buffer pour nginx
    }
    
    // Envoyer immédiatement pour établir la connexion
    echo ": keep-alive\n\n";
    flush();
    
    // Vérifier l'authentification APRÈS avoir envoyé les headers SSE
    // Si l'auth échoue, envoyer une erreur via SSE au lieu d'un JSON avec exit()
    $user = getCurrentUser();
    if (!$user) {
        sendSSE('error', 'Unauthorized - Veuillez vous reconnecter');
        flush();
        return;
    }
    
    // Vérifier que le firmware existe et est en attente de compilation
    try {
        sendSSE('log', 'info', 'Connexion établie, vérification du firmware...');
        
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            sendSSE('error', 'Firmware not found');
            flush();
            return;
        }
        
        // Marquer immédiatement comme "compiling" dans la base de données
        // Cela permet de savoir que la compilation est en cours même si la connexion SSE se ferme
        $pdo->prepare("UPDATE firmware_versions SET status = 'compiling' WHERE id = :id")->execute(['id' => $firmware_id]);
        
        if ($firmware['status'] !== 'pending_compilation' && $firmware['status'] !== 'compiling') {
            // Remettre le statut d'origine si on ne peut pas compiler
            $pdo->prepare("UPDATE firmware_versions SET status = :status WHERE id = :id")->execute([
                'status' => $firmware['status'],
                'id' => $firmware_id
            ]);
            sendSSE('error', 'Firmware already compiled or invalid status: ' . ($firmware['status'] ?? 'unknown'));
            flush();
            return;
        }
        
        // Construire le chemin du fichier .ino en utilisant l'ID du firmware
        $ino_path = null;
        
        // Essayer d'abord le chemin exact depuis la base de données
        $test_paths = [
            $firmware['file_path'],
            __DIR__ . '/' . $firmware['file_path'],
        ];
        
        // Si le chemin contient hardware/firmware/, essayer aussi sans préfixe
        if (preg_match('#^hardware/firmware/#', $firmware['file_path'])) {
            $relative_path = preg_replace('#^hardware/firmware/#', '', $firmware['file_path']);
            $test_paths[] = __DIR__ . '/hardware/firmware/' . $relative_path;
        }
        
        // Tester chaque chemin
        foreach ($test_paths as $test_path) {
            if (file_exists($test_path) && preg_match('/\.ino$/', $test_path)) {
                $ino_path = $test_path;
                break;
            }
        }
        
        // Si le fichier n'est pas trouvé avec le chemin exact, chercher par ID
        if (!$ino_path || !file_exists($ino_path)) {
            $version_dir = getVersionDir($firmware['version']);
            $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
            
            if (is_dir($ino_dir)) {
                // Chercher le fichier avec l'ID dans le nom (pattern le plus fiable)
                $pattern_with_id = 'fw_ott_v' . $firmware['version'] . '_id' . $firmware_id . '.ino';
                $ino_path_with_id = $ino_dir . $pattern_with_id;
                
                if (file_exists($ino_path_with_id)) {
                    $ino_path = $ino_path_with_id;
                } else {
                    // Fallback : chercher tous les fichiers .ino pour cette version (pour compatibilité avec anciens fichiers)
                    $pattern = 'fw_ott_v' . $firmware['version'] . '_*.ino';
                    $ino_files = glob($ino_dir . $pattern);
                    if (!empty($ino_files)) {
                        // Trier par date de modification (le plus récent en premier)
                        usort($ino_files, function($a, $b) {
                            return filemtime($b) - filemtime($a);
                        });
                        $ino_path = $ino_files[0];
                    }
                }
            }
        }
        
        if (!$ino_path || !file_exists($ino_path)) {
            // Marquer le firmware comme erreur dans la base de données
            try {
                $errorMsg = 'Fichier .ino introuvable: ' . $firmware['file_path'];
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET status = 'error', error_message = :error_msg
                    WHERE id = :id
                ")->execute([
                    'error_msg' => $errorMsg,
                    'id' => $firmware_id
                ]);
            } catch(PDOException $dbErr) {
                error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
            }
            sendSSE('error', 'Fichier .ino introuvable: ' . $firmware['file_path']);
            sendSSE('log', 'error', 'Version: ' . $firmware['version'] . ', ID: ' . $firmware_id);
            sendSSE('log', 'error', 'Dossier recherché: hardware/firmware/' . getVersionDir($firmware['version']) . '/');
            sendSSE('log', 'error', 'Pattern recherché: fw_ott_v' . $firmware['version'] . '_id' . $firmware_id . '.ino');
            sendSSE('log', 'error', 'Vérifiez que le fichier existe dans hardware/firmware/');
            flush();
            return;
        }
        
        sendSSE('log', 'info', 'Démarrage de la compilation...');
        sendSSE('progress', 10);
        flush();
        
        // Vérifier si arduino-cli est disponible
        // ⚠️ CRITIQUE: La compilation ne doit JAMAIS être simulée - soit OK, soit ÉCHEC
        $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
        $arduinoCli = null;
        
        // 1. Chercher dans bin/ du projet (priorité absolue)
        $localArduinoCli = __DIR__ . '/bin/arduino-cli' . ($isWindows ? '.exe' : '');
        $localArduinoCliAlt = __DIR__ . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'arduino-cli' . ($isWindows ? '.exe' : '');
        
        // Essayer les deux formats de chemin (normalisé et avec séparateurs)
        foreach ([$localArduinoCli, $localArduinoCliAlt] as $testPath) {
            if (file_exists($testPath) && is_readable($testPath)) {
                $arduinoCli = $testPath;
                sendSSE('log', 'info', '✅ arduino-cli trouvé dans bin/ du projet');
                break;
            }
        }
        
        // 2. Chercher dans ~/.local/bin/ (emplacement standard pour Render)
        if (empty($arduinoCli) && !$isWindows) {
            $homeDir = getenv('HOME');
            if (!empty($homeDir)) {
                $renderArduinoCli = $homeDir . '/.local/bin/arduino-cli';
                if (file_exists($renderArduinoCli) && is_readable($renderArduinoCli)) {
                    $arduinoCli = $renderArduinoCli;
                    sendSSE('log', 'info', '✅ arduino-cli trouvé dans ~/.local/bin/');
                }
            }
        }
        
        // 3. Si pas trouvé localement, chercher dans le PATH système
        if (empty($arduinoCli)) {
            if ($isWindows) {
                $pathCli = trim(shell_exec('where arduino-cli 2>nul || echo ""'));
            } else {
                $pathCli = trim(shell_exec('which arduino-cli 2>/dev/null || echo ""'));
            }
            
            if (!empty($pathCli) && file_exists($pathCli)) {
                $arduinoCli = $pathCli;
                sendSSE('log', 'info', '✅ arduino-cli trouvé dans le PATH système');
            }
        }
        
        // 3. Vérification finale - ÉCHEC si arduino-cli n'est pas disponible
        if (empty($arduinoCli) || !file_exists($arduinoCli)) {
            sendSSE('error', '❌ ÉCHEC: arduino-cli non trouvé. La compilation réelle est requise.');
            sendSSE('log', 'error', 'Pour activer la compilation, installez arduino-cli:');
            sendSSE('log', 'error', '  - Windows: .\\scripts\\download_arduino_cli.ps1');
            sendSSE('log', 'error', '  - Linux/Mac: ./scripts/download_arduino_cli.sh');
            sendSSE('log', 'error', '  - Ou placez arduino-cli dans bin/ du projet');
            sendSSE('log', 'error', 'Instructions: https://arduino.github.io/arduino-cli/latest/installation/');
            
            // Marquer le firmware comme erreur dans la base de données
            $pdo->prepare("
                UPDATE firmware_versions 
                SET status = 'error', error_message = 'arduino-cli non trouvé - compilation échouée'
                WHERE id = :id
            ")->execute(['id' => $firmware_id]);
            
            flush();
            return;
        } else {
            // Compilation réelle avec arduino-cli
            sendSSE('log', 'info', '✅ arduino-cli disponible - démarrage de la compilation réelle');
            sendSSE('progress', 20);
            
            // Créer un dossier temporaire pour la compilation
            $build_dir = sys_get_temp_dir() . '/ott_firmware_build_' . $firmware_id . '_' . time();
            mkdir($build_dir, 0755, true);
            
            sendSSE('log', 'info', 'Préparation de l\'environnement de compilation...');
            sendSSE('progress', 30);
            
            // Copier le fichier .ino dans le dossier de build
            $sketch_name = 'fw_ott_optimized';
            $sketch_dir = $build_dir . '/' . $sketch_name;
            mkdir($sketch_dir, 0755, true);
            copy($ino_path, $sketch_dir . '/' . $sketch_name . '.ino');
            
            // Copier les librairies externes (TinyGSM) dans le dossier de compilation
            // Arduino-cli cherche les librairies dans plusieurs emplacements :
            // 1. Le dossier 'libraries' à côté du sketch (pour cette compilation)
            // 2. Le dossier 'libraries' dans ARDUINO_DIRECTORIES_USER (persistant)
            $hardware_lib_dir = __DIR__ . '/hardware/lib';
            if (is_dir($hardware_lib_dir)) {
                $lib_dirs = glob($hardware_lib_dir . '/TinyGSM*', GLOB_ONLYDIR);
                if (!empty($lib_dirs)) {
                    // 1. Copier dans le dossier libraries à côté du sketch (pour cette compilation)
                    $libraries_dir = $sketch_dir . '/../libraries';
                    if (!is_dir($libraries_dir)) {
                        mkdir($libraries_dir, 0755, true);
                    }
                    
                    // 2. Copier aussi dans arduino-data/libraries (persistant, réutilisable)
                    $arduinoDataLibrariesDir = __DIR__ . '/arduino-data/libraries';
                    if (!is_dir($arduinoDataLibrariesDir)) {
                        mkdir($arduinoDataLibrariesDir, 0755, true);
                    }
                    
                    foreach ($lib_dirs as $lib_dir) {
                        $lib_name = basename($lib_dir);
                        
                        // Copier dans arduino-data/libraries (persistant, pour réutilisation) - une seule fois
                        $target_lib_dir_persistent = $arduinoDataLibrariesDir . '/' . $lib_name;
                        if (!is_dir($target_lib_dir_persistent)) {
                            copyRecursive($lib_dir, $target_lib_dir_persistent);
                            sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' installée dans arduino-data/libraries');
                        }
                        
                        // Créer un lien symbolique depuis le build vers la librairie persistante (plus rapide que copier)
                        // Si les liens symboliques ne fonctionnent pas, copier seulement si nécessaire
                        $target_lib_dir_build = $libraries_dir . '/' . $lib_name;
                        if (!is_dir($target_lib_dir_build) && !is_link($target_lib_dir_build)) {
                            // Essayer d'abord un lien symbolique (plus rapide)
                            if (!is_windows()) {
                                if (symlink($target_lib_dir_persistent, $target_lib_dir_build)) {
                                    sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' liée dans le build');
                                } else {
                                    // Fallback: copie si le lien symbolique échoue
                                    copyRecursive($lib_dir, $target_lib_dir_build);
                                    sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' copiée dans le build');
                                }
                            } else {
                                // Windows: copier directement (pas de liens symboliques fiables)
                                copyRecursive($lib_dir, $target_lib_dir_build);
                                sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' copiée dans le build');
                            }
                        }
                    }
                    flush();
                }
            }
            
            // Configurer un répertoire persistant pour arduino-cli (évite de retélécharger à chaque fois)
            $arduinoDataDir = __DIR__ . '/arduino-data';
            if (!is_dir($arduinoDataDir)) {
                mkdir($arduinoDataDir, 0755, true);
            }
            
            // Définir HOME et ARDUINO_DIRECTORIES_USER pour arduino-cli
            $env = [];
            if (empty(getenv('HOME'))) {
                $env['HOME'] = sys_get_temp_dir() . '/arduino-cli-home';
                if (!is_dir($env['HOME'])) {
                    mkdir($env['HOME'], 0755, true);
                }
            }
            // Utiliser un répertoire persistant pour les données arduino-cli
            $env['ARDUINO_DIRECTORIES_USER'] = $arduinoDataDir;
            
            $envStr = '';
            foreach ($env as $key => $value) {
                $envStr .= $key . '=' . escapeshellarg($value) . ' ';
            }
            
            sendSSE('log', 'info', 'Vérification du core ESP32...');
            sendSSE('progress', 40);
            
            // Vérifier si le core ESP32 est déjà installé via arduino-cli core list
            // C'est la méthode la plus fiable car elle vérifie la base de données d'arduino-cli
            // La commande 'core list' retourne les cores installés, pas seulement téléchargés
            exec($envStr . $arduinoCli . ' core list 2>&1', $coreListOutput, $coreListReturn);
            $coreListStr = implode("\n", $coreListOutput);
            // Vérifier si le core ESP32 apparaît dans la liste (format: esp32:esp32 ou esp-rv32)
            $esp32Installed = strpos($coreListStr, 'esp32:esp32') !== false || strpos($coreListStr, 'esp-rv32') !== false;
            
            if ($esp32Installed) {
                sendSSE('log', 'info', '✅ Core ESP32 déjà installé - prêt pour compilation');
                sendSSE('progress', 50);
            } else {
                sendSSE('log', 'info', 'Core ESP32 non installé, installation nécessaire...');
                sendSSE('log', 'info', '⏳ Cette étape peut prendre plusieurs minutes (téléchargement ~430MB, une seule fois)...');
                sendSSE('progress', 42);
                
                // Vérifier si l'index est récent (moins de 24h) avant de le mettre à jour
                $indexFile = $arduinoDataDir . '/package_index.json';
                $shouldUpdateIndex = true;
                if (file_exists($indexFile)) {
                    $indexAge = time() - filemtime($indexFile);
                    // Mettre à jour l'index seulement s'il a plus de 24h
                    if ($indexAge < 86400) {
                        $shouldUpdateIndex = false;
                        sendSSE('log', 'info', '✅ Index des cores récent (moins de 24h), pas besoin de mise à jour');
                    }
                }
                
                // Mettre à jour l'index seulement si nécessaire
                if ($shouldUpdateIndex) {
                    sendSSE('log', 'info', 'Mise à jour de l\'index des cores Arduino...');
                    exec($envStr . $arduinoCli . ' core update-index 2>&1', $updateIndexOutput, $updateIndexReturn);
                    if ($updateIndexReturn !== 0) {
                        sendSSE('log', 'warning', 'Avertissement lors de la mise à jour de l\'index');
                    }
                }
                
                sendSSE('log', 'info', 'Installation du core ESP32...');
                sendSSE('progress', 45);
                
                // Exécuter avec output en temps réel pour voir la progression
                $descriptorspec = [
                    0 => ["pipe", "r"],  // stdin
                    1 => ["pipe", "w"],  // stdout
                    2 => ["pipe", "w"]   // stderr
                ];
                
                $process = proc_open($envStr . $arduinoCli . ' core install esp32:esp32 2>&1', $descriptorspec, $pipes);
                
                if (is_resource($process)) {
                    // Lire la sortie ligne par ligne pour afficher la progression
                    $installOutput = [];
                    $stdout = $pipes[1];
                    $stderr = $pipes[2];
                    
                    // Configurer les streams en non-bloquant
                    stream_set_blocking($stdout, false);
                    stream_set_blocking($stderr, false);
                    
                    $startTime = time();
                    $lastOutputTime = $startTime;
                    $lastHeartbeatTime = $startTime;
                    
                    while (true) {
                        $status = proc_get_status($process);
                        
                        // Lire stdout
                        $line = fgets($stdout);
                        if ($line !== false) {
                            $line = trim($line);
                            if (!empty($line)) {
                                $installOutput[] = $line;
                                sendSSE('log', 'info', $line);
                                flush();
                                $lastOutputTime = time();
                            }
                        }
                        
                        // Lire stderr
                        $errLine = fgets($stderr);
                        if ($errLine !== false) {
                            $errLine = trim($errLine);
                            if (!empty($errLine)) {
                                $installOutput[] = $errLine;
                                sendSSE('log', 'info', $errLine);
                                flush();
                                $lastOutputTime = time();
                            }
                        }
                        
                        // Vérifier si le processus est terminé
                        if ($status['running'] === false) {
                            break;
                        }
                        
                        // Timeout de sécurité : si pas de sortie depuis 10 minutes, considérer comme bloqué
                        // (L'installation du core ESP32 peut prendre du temps)
                        if (time() - $lastOutputTime > 600) {
                            sendSSE('log', 'warning', '⚠️ Pas de sortie depuis 10 minutes, le processus semble bloqué');
                            sendSSE('error', 'Timeout: L\'installation du core ESP32 a pris trop de temps');
                            // Marquer le firmware comme erreur dans la base de données
                            try {
                                $pdo->prepare("
                                    UPDATE firmware_versions 
                                    SET status = 'error', error_message = 'Timeout lors de l\'installation du core ESP32'
                                    WHERE id = :id
                                ")->execute(['id' => $firmware_id]);
                            } catch(PDOException $dbErr) {
                                error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                            }
                            proc_terminate($process);
                            break;
                        }
                        
                        // Envoyer un heartbeat toutes les 10 secondes pour maintenir la connexion
                        $currentTime = time();
                        if ($currentTime - $lastHeartbeatTime >= 10) {
                            // Mettre à jour immédiatement pour éviter les multiples envois dans la même seconde
                            $lastHeartbeatTime = $currentTime;
                            sendSSE('log', 'info', '⏳ Installation en cours... (patientez, cela peut prendre plusieurs minutes)');
                            flush();
                        }
                        
                        // Attendre un peu avant de relire
                        usleep(100000); // 100ms
                    }
                    
                    // Fermer les pipes
                    fclose($pipes[0]);
                    fclose($pipes[1]);
                    fclose($pipes[2]);
                    
                    $return = proc_close($process);
                } else {
                    // Fallback sur exec si proc_open échoue
                    exec($envStr . $arduinoCli . ' core install esp32:esp32 2>&1', $installOutput, $return);
                    sendSSE('log', 'info', implode("\n", $installOutput));
                }
                
                if ($return !== 0) {
                    // Marquer le firmware comme erreur dans la base de données
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Erreur lors de l\'installation du core ESP32'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    sendSSE('error', 'Erreur lors de l\'installation du core ESP32');
                    flush();
                    return;
                }
                
                sendSSE('log', 'info', '✅ Core ESP32 installé avec succès');
            }
            
            sendSSE('log', 'info', 'Compilation du firmware...');
            sendSSE('progress', 60);
            flush();
            
            $fqbn = 'esp32:esp32:esp32';
            $compile_cmd = $envStr . $arduinoCli . ' compile --fqbn ' . $fqbn . ' --build-path ' . escapeshellarg($build_dir) . ' ' . escapeshellarg($sketch_dir) . ' 2>&1';
            
            // Exécuter avec output en temps réel pour voir la progression et maintenir la connexion SSE
            $descriptorspec = [
                0 => ["pipe", "r"],  // stdin
                1 => ["pipe", "w"],  // stdout
                2 => ["pipe", "w"]   // stderr
            ];
            
            $compile_process = proc_open($compile_cmd, $descriptorspec, $compile_pipes);
            
            if (is_resource($compile_process)) {
                $compile_stdout = $compile_pipes[1];
                $compile_stderr = $compile_pipes[2];
                
                // Configurer les streams en non-bloquant
                stream_set_blocking($compile_stdout, false);
                stream_set_blocking($compile_stderr, false);
                
                $compile_start_time = time();
                $compile_last_heartbeat = $compile_start_time;
                $compile_output_lines = [];
                
                while (true) {
                    $compile_status = proc_get_status($compile_process);
                    
                    // Lire stdout
                    $line = fgets($compile_stdout);
                    if ($line !== false) {
                        $line = trim($line);
                        if (!empty($line)) {
                            $compile_output_lines[] = $line;
                            sendSSE('log', 'info', $line);
                            flush();
                        }
                    }
                    
                    // Lire stderr
                    $errLine = fgets($compile_stderr);
                    if ($errLine !== false) {
                        $errLine = trim($errLine);
                        if (!empty($errLine)) {
                            $compile_output_lines[] = $errLine;
                            sendSSE('log', 'info', $errLine);
                            flush();
                        }
                    }
                    
                    // Vérifier si le processus est terminé
                    if ($compile_status['running'] === false) {
                        break;
                    }
                    
                    // Envoyer un heartbeat toutes les 10 secondes pour maintenir la connexion SSE
                    $current_time = time();
                    if ($current_time - $compile_last_heartbeat >= 10) {
                        $compile_last_heartbeat = $current_time;
                        sendSSE('log', 'info', '⏳ Compilation en cours...');
                        flush();
                    }
                    
                    // Attendre un peu avant de relire
                    usleep(100000); // 100ms
                }
                
                // Fermer les pipes
                fclose($compile_pipes[0]);
                fclose($compile_pipes[1]);
                fclose($compile_pipes[2]);
                
                $compile_return = proc_close($compile_process);
                $compile_output = $compile_output_lines;
            } else {
                // Fallback sur exec si proc_open échoue
                exec($compile_cmd, $compile_output, $compile_return);
                
                foreach ($compile_output as $line) {
                    sendSSE('log', 'info', $line);
                }
                flush();
            }
            
            if ($compile_return !== 0) {
                // Marquer le firmware comme erreur dans la base de données même si la connexion SSE est fermée
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = 'Erreur lors de la compilation'
                        WHERE id = :id
                    ")->execute(['id' => $firmware_id]);
                } catch(PDOException $dbErr) {
                    error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
                }
                sendSSE('error', 'Erreur lors de la compilation. Vérifiez les logs ci-dessus.');
                flush();
                // Nettoyer
                exec('rm -rf ' . escapeshellarg($build_dir));
                return;
            }
            
            sendSSE('progress', 80);
            sendSSE('log', 'info', 'Recherche du fichier .bin généré...');
            
            // Trouver le fichier .bin
            $bin_files = glob($build_dir . '/*.bin');
            if (empty($bin_files)) {
                $bin_files = glob($build_dir . '/**/*.bin');
            }
            
            if (empty($bin_files)) {
                // Marquer le firmware comme erreur dans la base de données
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = 'Fichier .bin introuvable après compilation'
                        WHERE id = :id
                    ")->execute(['id' => $firmware_id]);
                } catch(PDOException $dbErr) {
                    error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                }
                sendSSE('error', 'Fichier .bin introuvable après compilation');
                flush();
                exec('rm -rf ' . escapeshellarg($build_dir));
                return;
            }
            
            $compiled_bin = $bin_files[0];
            $version_dir = getVersionDir($firmware['version']);
            $bin_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
            if (!is_dir($bin_dir)) mkdir($bin_dir, 0755, true);
            $bin_filename = 'fw_ott_v' . $firmware['version'] . '.bin';
            $bin_path = $bin_dir . $bin_filename;
            
            if (!copy($compiled_bin, $bin_path)) {
                // Marquer le firmware comme erreur dans la base de données
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = 'Impossible de copier le fichier .bin compilé'
                        WHERE id = :id
                    ")->execute(['id' => $firmware_id]);
                } catch(PDOException $dbErr) {
                    error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                }
                sendSSE('error', 'Impossible de copier le fichier .bin compilé');
                flush();
                exec('rm -rf ' . escapeshellarg($build_dir));
                return;
            }
            
            sendSSE('progress', 95);
            sendSSE('log', 'info', 'Calcul des checksums...');
            
            $md5 = hash_file('md5', $bin_path);
            $checksum = hash_file('sha256', $bin_path);
            $file_size = filesize($bin_path);
            
            // Mettre à jour la base de données
            $version_dir = getVersionDir($firmware['version']);
            $pdo->prepare("
                UPDATE firmware_versions 
                SET file_path = :file_path, 
                    file_size = :file_size, 
                    checksum = :checksum,
                    status = 'compiled'
                WHERE id = :id
            ")->execute([
                'file_path' => 'hardware/firmware/' . $version_dir . '/' . $bin_filename,
                'file_size' => $file_size,
                'checksum' => $checksum,
                'id' => $firmware_id
            ]);
            
            // Nettoyer
            exec('rm -rf ' . escapeshellarg($build_dir));
            
            sendSSE('progress', 100);
            sendSSE('log', 'info', '✅ Compilation terminée avec succès !');
            sendSSE('success', 'Firmware v' . $firmware['version'] . ' compilé avec succès', $firmware['version']);
            
            // Fermer la connexion après un court délai pour permettre au client de recevoir les messages
            sleep(1);
        }
        
    } catch(Exception $e) {
        // Marquer le firmware comme erreur dans la base de données même si la connexion SSE est fermée
        try {
            $pdo->prepare("
                UPDATE firmware_versions 
                SET status = 'error', error_message = :error
                WHERE id = :id
            ")->execute([
                'error' => 'Erreur: ' . $e->getMessage(),
                'id' => $firmware_id
            ]);
        } catch(PDOException $dbErr) {
            error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
        }
        sendSSE('error', 'Erreur: ' . $e->getMessage());
        error_log('[handleCompileFirmware] Exception: ' . $e->getMessage());
        flush();
        sleep(1);
    }
    
    // S'assurer que la sortie est vidée
    flush();
}

function sendSSE($type, $message = '', $data = null) {
    $payload = null;
    
    if ($type === 'log') {
        $level = $message;
        $message = $data;
        $payload = ['type' => 'log', 'level' => $level, 'message' => $message];
    } else if ($type === 'progress') {
        $payload = ['type' => 'progress', 'progress' => $message];
    } else if ($type === 'success') {
        $payload = ['type' => 'success', 'message' => $message, 'version' => $data];
    } else if ($type === 'error') {
        $payload = ['type' => 'error', 'message' => $message];
    }
    
    if ($payload !== null) {
        echo "data: " . json_encode($payload) . "\n\n";
        flush();
    }
}

// ============================================================================
// HANDLERS - NOTIFICATIONS
// ============================================================================

function handleGetNotificationPreferences() {
    global $pdo;
    $user = requireAuth();
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user['id']]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            // Créer avec valeurs par défaut (toutes désactivées)
            $pdo->prepare("
                INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled) 
                VALUES (:user_id, FALSE, FALSE, FALSE)
            ")->execute(['user_id' => $user['id']]);
            $stmt->execute(['user_id' => $user['id']]);
            $prefs = $stmt->fetch();
        }
        
        echo json_encode(['success' => true, 'preferences' => $prefs]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleUpdateNotificationPreferences() {
    global $pdo;
    $user = requireAuth();
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $user_id = $user['id'];
        
        // Vérifier/créer les préférences (avec SMS activé par défaut)
        $checkStmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $checkStmt->execute(['user_id' => $user_id]);
        if (!$checkStmt->fetch()) {
            // Créer avec valeurs par défaut (toutes désactivées)
            $insertStmt = $pdo->prepare("
                INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled) 
                VALUES (:user_id, FALSE, FALSE, FALSE)
            ");
            $insertStmt->execute(['user_id' => $user_id]);
        }
        
        $updates = [];
        $params = ['user_id' => $user_id];
        
        $allowed = ['email_enabled', 'sms_enabled', 'push_enabled', 'phone_number',
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow',
                    'notify_new_patient', 'quiet_hours_start', 'quiet_hours_end'];
        
        foreach ($allowed as $field) {
            if (isset($input[$field])) {
                $value = $input[$field];
                
                // Détecter les champs booléens
                $isBooleanField = in_array($field, ['email_enabled', 'sms_enabled', 'push_enabled', 
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow', 'notify_new_patient']);
                
                if ($isBooleanField) {
                    // Convertir en booléen (gérer string "true"/"false", 0/1, chaîne vide, etc.)
                    $boolValue = false;
                    if (is_bool($value)) {
                        $boolValue = $value;
                    } elseif (is_string($value)) {
                        // Chaîne vide = false
                        if ($value === '') {
                            $boolValue = false;
                        } else {
                            $boolValue = in_array(strtolower(trim($value)), ['true', '1', 'yes', 'on']);
                        }
                    } elseif (is_numeric($value)) {
                        $boolValue = (int)$value !== 0;
                    }
                    // Pour PostgreSQL, utiliser TRUE/FALSE directement dans la requête
                    $updates[] = "$field = " . ($boolValue ? 'TRUE' : 'FALSE');
                } elseif ($value === null || $value === '') {
                    $updates[] = "$field = NULL";
                } else {
                    $updates[] = "$field = :$field";
                    $params[$field] = $value;
                }
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
            return;
        }
        
        $sql = "UPDATE user_notifications_preferences SET " . implode(', ', $updates) . " WHERE user_id = :user_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log('[handleUpdateNotificationPreferences] Database error: ' . $e->getMessage());
        error_log('[handleUpdateNotificationPreferences] SQL: ' . ($sql ?? 'N/A'));
        error_log('[handleUpdateNotificationPreferences] Params: ' . json_encode($params ?? []));
        error_log('[handleUpdateNotificationPreferences] Input: ' . json_encode($input ?? []));
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleTestNotification() {
    global $pdo;
    requireAuth();
    
    $user = getCurrentUser();
    $input = json_decode(file_get_contents('php://input'), true);
    $type = $input['type'] ?? 'email';
    
    try {
        // Récupérer les préférences de l'utilisateur
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user['id']]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            echo json_encode(['success' => false, 'error' => 'Préférences non trouvées']);
            return;
        }
        
        $testMessage = "Ceci est un message de test depuis le dashboard OTT.";
        $testSubject = "Test notification OTT";
        
        if ($type === 'email') {
            if (!$prefs['email_enabled'] || !$user['email']) {
                echo json_encode(['success' => false, 'error' => 'Email non activé ou adresse manquante']);
                return;
            }
            $sent = sendEmail($user['email'], $testSubject, $testMessage);
            $result = $sent 
                ? ['success' => true, 'message' => 'Email test envoyé avec succès']
                : ['success' => false, 'error' => 'Erreur lors de l\'envoi de l\'email'];
        } elseif ($type === 'sms') {
            if (!$prefs['sms_enabled'] || !$prefs['phone_number']) {
                echo json_encode(['success' => false, 'error' => 'SMS non activé ou numéro manquant']);
                return;
            }
            $sent = sendSMS($prefs['phone_number'], $testMessage);
            $result = $sent 
                ? ['success' => true, 'message' => 'SMS test envoyé avec succès']
                : ['success' => false, 'error' => 'Erreur lors de l\'envoi du SMS'];
        } else {
            $result = ['success' => false, 'error' => 'Type invalide'];
        }
        
        echo json_encode($result);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleGetNotificationsQueue() {
    global $pdo;
    requirePermission('settings.view');
    
    try {
        $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 50;
        
        $stmt = $pdo->prepare("
            SELECT nq.*, u.email, u.first_name, u.last_name, p.first_name as patient_first_name, p.last_name as patient_last_name
            FROM notifications_queue nq
            LEFT JOIN users u ON nq.user_id = u.id AND u.deleted_at IS NULL
            LEFT JOIN patients p ON nq.patient_id = p.id AND p.deleted_at IS NULL
            ORDER BY nq.created_at DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        echo json_encode(['success' => true, 'queue' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleProcessNotificationsQueue() {
    global $pdo;
    requireAdmin(); // Seuls les admins peuvent déclencher le traitement manuellement
    
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $limit = isset($input['limit']) ? min(intval($input['limit']), 100) : 50;
        $result = processNotificationsQueue($pdo, $limit);
        echo json_encode(['success' => true, 'result' => $result]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleGetUserNotifications($user_id) {
    global $pdo;
    requirePermission('users.view');
    
    try {
        // Vérifier si la table user_notifications_preferences existe
        $hasNotificationsTable = false;
        try {
            // Utiliser helper pour vérifier la table
            $hasNotificationsTable = tableExists('user_notifications_preferences');
        } catch(PDOException $e) {
            $hasNotificationsTable = false;
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleGetUserNotifications] Table check failed: ' . $e->getMessage());
            }
        }
        
        if (!$hasNotificationsTable) {
            // Table n'existe pas encore, retourner des valeurs par défaut
            $defaultPrefs = [
                'user_id' => $user_id,
                'email_enabled' => false,
                'sms_enabled' => false,
                'push_enabled' => false,
                'phone_number' => null,
                'notify_battery_low' => false,
                'notify_device_offline' => false,
                'notify_abnormal_flow' => false,
                'notify_new_patient' => false,
                'quiet_hours_start' => null,
                'quiet_hours_end' => null,
                'created_at' => null,
                'updated_at' => null
            ];
            echo json_encode(['success' => true, 'preferences' => $defaultPrefs]);
            return;
        }
        
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user_id]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            // Créer des préférences par défaut avec valeurs explicites du schéma
            try {
                $pdo->prepare("
                    INSERT INTO user_notifications_preferences 
                    (user_id, email_enabled, sms_enabled, push_enabled, 
                     notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_new_patient) 
                    VALUES (:user_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
                ")->execute(['user_id' => $user_id]);
                $stmt->execute(['user_id' => $user_id]);
                $prefs = $stmt->fetch();
            } catch(PDOException $e) {
                // Si l'insertion échoue (par exemple user n'existe pas), retourner des valeurs par défaut
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[handleGetUserNotifications] Insert failed: ' . $e->getMessage());
                }
                $defaultPrefs = [
                    'user_id' => $user_id,
                    'email_enabled' => false,
                    'sms_enabled' => false,
                    'push_enabled' => false,
                    'phone_number' => null,
                    'notify_battery_low' => false,
                    'notify_device_offline' => false,
                    'notify_abnormal_flow' => false,
                    'notify_new_patient' => false,
                    'quiet_hours_start' => null,
                    'quiet_hours_end' => null,
                    'created_at' => null,
                    'updated_at' => null
                ];
                echo json_encode(['success' => true, 'preferences' => $defaultPrefs]);
                return;
            }
        }
        
        echo json_encode(['success' => true, 'preferences' => $prefs]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetUserNotifications] Database error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleUpdateUserNotifications($user_id) {
    global $pdo;
    requirePermission('users.edit');
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        // Vérifier que l'utilisateur existe
        $stmt = $pdo->prepare("SELECT id FROM users WHERE id = :user_id");
        $stmt->execute(['user_id' => $user_id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'User not found']);
            return;
        }
        
        // Vérifier si la table existe (unifié avec handleUpdatePatientNotifications)
        $hasNotificationsTable = false;
        try {
            $checkStmt = $pdo->query("
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'user_notifications_preferences'
                )
            ");
            $result = $checkStmt->fetchColumn();
            $hasNotificationsTable = ($result === true || $result === 't' || $result === 1 || $result === '1');
        } catch(PDOException $e) {
            $hasNotificationsTable = false;
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleUpdateUserNotifications] Table check failed: ' . $e->getMessage());
            }
        }
        
        if (!$hasNotificationsTable) {
            http_response_code(503);
            echo json_encode(['success' => false, 'error' => 'Notifications table not available']);
            return;
        }
        
        // Vérifier/créer les préférences avec toutes les valeurs par défaut (unifié)
        $checkStmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $checkStmt->execute(['user_id' => $user_id]);
        if (!$checkStmt->fetch()) {
            // Créer avec valeurs par défaut (toutes désactivées, unifié avec handleCreateUser)
            $insertStmt = $pdo->prepare("
                INSERT INTO user_notifications_preferences 
                (user_id, email_enabled, sms_enabled, push_enabled, 
                 notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_new_patient) 
                VALUES (:user_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
            ");
            $insertStmt->execute(['user_id' => $user_id]);
        }
        
        $updates = [];
        $params = ['user_id' => $user_id];
        
        $allowed = ['email_enabled', 'sms_enabled', 'push_enabled', 'phone_number',
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow',
                    'notify_new_patient', 'quiet_hours_start', 'quiet_hours_end'];
        
        foreach ($allowed as $field) {
            if (isset($input[$field])) {
                $value = $input[$field];
                
                // Détecter les champs booléens
                $isBooleanField = in_array($field, ['email_enabled', 'sms_enabled', 'push_enabled', 
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow', 'notify_new_patient']);
                
                if ($isBooleanField) {
                    // Convertir en booléen (gérer string "true"/"false", 0/1, chaîne vide, etc.)
                    $boolValue = false;
                    if (is_bool($value)) {
                        $boolValue = $value;
                    } elseif (is_string($value)) {
                        // Chaîne vide = false
                        if ($value === '') {
                            $boolValue = false;
                        } else {
                            $boolValue = in_array(strtolower(trim($value)), ['true', '1', 'yes', 'on']);
                        }
                    } elseif (is_numeric($value)) {
                        $boolValue = (int)$value !== 0;
                    }
                    // Pour PostgreSQL, utiliser TRUE/FALSE directement dans la requête
                    $updates[] = "$field = " . ($boolValue ? 'TRUE' : 'FALSE');
                } elseif ($value === null || $value === '') {
                    $updates[] = "$field = NULL";
                } else {
                    $updates[] = "$field = :$field";
                    $params[$field] = $value;
                }
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
            return;
        }
        
        // Construire la requête SQL
        $sql = "UPDATE user_notifications_preferences SET " . implode(', ', $updates) . " WHERE user_id = :user_id";
        
        // Préparer et exécuter la requête
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log('[handleUpdateUserNotifications] Database error: ' . $e->getMessage());
        error_log('[handleUpdateUserNotifications] SQL: ' . ($sql ?? 'N/A'));
        error_log('[handleUpdateUserNotifications] Params: ' . json_encode($params ?? []));
        error_log('[handleUpdateUserNotifications] Input: ' . json_encode($input ?? []));
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetPatientNotifications($patient_id) {
    global $pdo;
    requirePermission('patients.view');
    
    try {
        // Vérifier si la table existe (utilise helper)
        if (!tableExists('patient_notifications_preferences')) {
            // Table n'existe pas encore, retourner des valeurs par défaut
            $defaultPrefs = [
                'patient_id' => $patient_id,
                'email_enabled' => false,
                'sms_enabled' => false,
                'push_enabled' => false,
                'notify_battery_low' => false,
                'notify_device_offline' => false,
                'notify_abnormal_flow' => false,
                'notify_alert_critical' => false,
                'quiet_hours_start' => null,
                'quiet_hours_end' => null,
                'created_at' => null,
                'updated_at' => null
            ];
            echo json_encode(['success' => true, 'preferences' => $defaultPrefs]);
            return;
        }
        
        $stmt = $pdo->prepare("SELECT * FROM patient_notifications_preferences WHERE patient_id = :patient_id");
        $stmt->execute(['patient_id' => $patient_id]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            // Créer des préférences par défaut avec valeurs explicites du schéma
            try {
                $pdo->prepare("
                    INSERT INTO patient_notifications_preferences 
                    (patient_id, email_enabled, sms_enabled, push_enabled, 
                     notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_alert_critical) 
                    VALUES (:patient_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
                ")->execute(['patient_id' => $patient_id]);
                $stmt->execute(['patient_id' => $patient_id]);
                $prefs = $stmt->fetch();
            } catch(PDOException $e) {
                // Si l'insertion échoue (par exemple patient n'existe pas), retourner des valeurs par défaut
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[handleGetPatientNotifications] Insert failed: ' . $e->getMessage());
                }
                $defaultPrefs = [
                    'patient_id' => $patient_id,
                    'email_enabled' => false,
                    'sms_enabled' => false,
                    'push_enabled' => false,
                    'notify_battery_low' => false,
                    'notify_device_offline' => false,
                    'notify_abnormal_flow' => false,
                    'notify_alert_critical' => false,
                    'quiet_hours_start' => null,
                    'quiet_hours_end' => null,
                    'created_at' => null,
                    'updated_at' => null
                ];
                echo json_encode(['success' => true, 'preferences' => $defaultPrefs]);
                return;
            }
        }
        
        echo json_encode(['success' => true, 'preferences' => $prefs]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetPatientNotifications] Database error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleUpdatePatientNotifications($patient_id) {
    global $pdo;
    requirePermission('patients.edit');
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        // Vérifier que le patient existe
        $stmt = $pdo->prepare("SELECT id FROM patients WHERE id = :patient_id");
        $stmt->execute(['patient_id' => $patient_id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Patient not found']);
            return;
        }
        
        // Vérifier si la table existe (utilise helper)
        if (!tableExists('patient_notifications_preferences')) {
            http_response_code(503);
            echo json_encode(['success' => false, 'error' => 'Notifications table not available']);
            return;
        }
        
        // Vérifier/créer les préférences avec toutes les valeurs par défaut (unifié)
        $checkStmt = $pdo->prepare("SELECT * FROM patient_notifications_preferences WHERE patient_id = :patient_id");
        $checkStmt->execute(['patient_id' => $patient_id]);
        if (!$checkStmt->fetch()) {
            // Créer avec valeurs par défaut (toutes désactivées, unifié avec handleCreatePatient)
            $insertStmt = $pdo->prepare("
                INSERT INTO patient_notifications_preferences 
                (patient_id, email_enabled, sms_enabled, push_enabled, 
                 notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_alert_critical) 
                VALUES (:patient_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
            ");
            $insertStmt->execute(['patient_id' => $patient_id]);
        }
        
        $updates = [];
        $params = ['patient_id' => $patient_id];
        
        $allowed = ['email_enabled', 'sms_enabled', 'push_enabled', 'phone_number',
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow',
                    'notify_alert_critical', 'quiet_hours_start', 'quiet_hours_end'];
        
        foreach ($allowed as $field) {
            if (isset($input[$field])) {
                $value = $input[$field];
                
                // Détecter les champs booléens
                $isBooleanField = in_array($field, ['email_enabled', 'sms_enabled', 'push_enabled', 
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow', 'notify_alert_critical']);
                
                if ($isBooleanField) {
                    // Convertir en booléen (gérer string "true"/"false", 0/1, chaîne vide, etc.)
                    $boolValue = false;
                    if (is_bool($value)) {
                        $boolValue = $value;
                    } elseif (is_string($value)) {
                        // Chaîne vide = false
                        if ($value === '') {
                            $boolValue = false;
                        } else {
                            $boolValue = in_array(strtolower(trim($value)), ['true', '1', 'yes', 'on']);
                        }
                    } elseif (is_numeric($value)) {
                        $boolValue = (int)$value !== 0;
                    }
                    // Pour PostgreSQL, utiliser TRUE/FALSE directement dans la requête
                    $updates[] = "$field = " . ($boolValue ? 'TRUE' : 'FALSE');
                } elseif ($value === null || $value === '') {
                    $updates[] = "$field = NULL";
                } else {
                    $updates[] = "$field = :$field";
                    $params[$field] = $value;
                }
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
            return;
        }
        
        $sql = "UPDATE patient_notifications_preferences SET " . implode(', ', $updates) . " WHERE patient_id = :patient_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log('[handleUpdatePatientNotifications] Database error: ' . $e->getMessage());
        error_log('[handleUpdatePatientNotifications] SQL: ' . ($sql ?? 'N/A'));
        error_log('[handleUpdatePatientNotifications] Params: ' . json_encode($params ?? []));
        error_log('[handleUpdatePatientNotifications] Input: ' . json_encode($input ?? []));
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

// ============================================================================
// HANDLERS - AUDIT
// ============================================================================

function handleGetAuditLogs() {
    global $pdo;
    requirePermission('audit.view');
    
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $user_id = isset($_GET['user_id']) ? intval($_GET['user_id']) : null;
    $action = isset($_GET['action']) ? $_GET['action'] : null;
    
    try {
        $sql = "
            SELECT al.*, u.email, u.first_name, u.last_name
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id AND u.deleted_at IS NULL
            WHERE 1=1
        ";
        
        $params = [];
        if ($user_id) {
            $sql .= " AND al.user_id = :user_id";
            $params['user_id'] = $user_id;
        }
        if ($action) {
            $sql .= " AND al.action LIKE :action";
            $params['action'] = '%' . $action . '%';
        }
        
        $sql .= " ORDER BY al.created_at DESC LIMIT :limit";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        echo json_encode(['success' => true, 'logs' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleClearAuditLogs() {
    global $pdo;
    requireAdmin(); // Seuls les admins peuvent supprimer les logs
    
    try {
        $stmt = $pdo->prepare("TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE");
        $stmt->execute();
        
        auditLog('audit.cleared', 'system', null, null, ['cleared_by' => getCurrentUser()['id']]);
        
        echo json_encode(['success' => true, 'message' => 'Journal d\'audit réinitialisé']);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

// ============================================================================
// NOTIFICATIONS - ENVOI ET QUEUE
// ============================================================================

/**
 * Ajoute une notification à la queue
 */
function queueNotification($pdo, $user_id, $patient_id, $type, $subject, $message, $priority = 'medium', $data = null, $send_after = null) {
    try {
        // Vérifier qu'au moins user_id ou patient_id est défini
        if (!$user_id && !$patient_id) {
            return false;
        }
        
        $stmt = $pdo->prepare("
            INSERT INTO notifications_queue (user_id, patient_id, type, priority, subject, message, data, send_after, status)
            VALUES (:user_id, :patient_id, :type, :priority, :subject, :message, :data, :send_after, 'pending')
        ");
        
        $stmt->execute([
            'user_id' => $user_id,
            'patient_id' => $patient_id,
            'type' => $type,
            'priority' => $priority,
            'subject' => $subject,
            'message' => $message,
            'data' => $data ? json_encode($data) : null,
            'send_after' => $send_after ? date('Y-m-d H:i:s', strtotime($send_after)) : date('Y-m-d H:i:s')
        ]);
        
        return $pdo->lastInsertId();
    } catch(PDOException $e) {
        error_log("Erreur queueNotification: " . $e->getMessage());
        return false;
    }
}

/**
 * Envoie un email via SendGrid
 */
function sendEmail($to, $subject, $message, $html = null) {
    if (empty(SENDGRID_API_KEY) || empty(SENDGRID_FROM_EMAIL)) {
        error_log("SendGrid non configuré: API_KEY ou FROM_EMAIL manquant");
        return false;
    }
    
    $url = 'https://api.sendgrid.com/v3/mail/send';
    
    $payload = [
        'personalizations' => [
            [
                'to' => [['email' => $to]],
                'subject' => $subject
            ]
        ],
        'from' => ['email' => SENDGRID_FROM_EMAIL],
        'content' => [
            [
                'type' => $html ? 'text/html' : 'text/plain',
                'value' => $html ?: $message
            ]
        ]
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . SENDGRID_API_KEY,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        error_log("Erreur cURL SendGrid: " . $error);
        return false;
    }
    
    if ($httpCode >= 200 && $httpCode < 300) {
        return true;
    } else {
        error_log("Erreur SendGrid HTTP $httpCode: " . $response);
        return false;
    }
}

/**
 * Envoie un SMS via Twilio
 */
function sendSMS($to, $message) {
    if (empty(TWILIO_ACCOUNT_SID) || empty(TWILIO_AUTH_TOKEN) || empty(TWILIO_FROM_NUMBER)) {
        error_log("Twilio non configuré: ACCOUNT_SID, AUTH_TOKEN ou FROM_NUMBER manquant");
        return false;
    }
    
    // Normaliser le numéro (ajouter + si absent)
    if (strpos($to, '+') !== 0) {
        // Si commence par 0, remplacer par +33 (France)
        if (strpos($to, '0') === 0) {
            $to = '+33' . substr($to, 1);
        } else {
            $to = '+' . $to;
        }
    }
    
    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . TWILIO_ACCOUNT_SID . '/Messages.json';
    
    $data = [
        'From' => TWILIO_FROM_NUMBER,
        'To' => $to,
        'Body' => $message
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_USERPWD, TWILIO_ACCOUNT_SID . ':' . TWILIO_AUTH_TOKEN);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        error_log("Erreur cURL Twilio: " . $error);
        return false;
    }
    
    if ($httpCode >= 200 && $httpCode < 300) {
        $result = json_decode($response, true);
        if (isset($result['sid'])) {
            return true;
        }
    }
    
    error_log("Erreur Twilio HTTP $httpCode: " . $response);
    return false;
}

/**
 * Déclenche les notifications pour une alerte
 */
function triggerAlertNotifications($pdo, $device_id, $alert_type, $severity, $message) {
    try {
        // Récupérer les informations du dispositif et du patient
        $stmt = $pdo->prepare("
            SELECT d.*, p.id as patient_id, p.first_name as patient_first_name, p.last_name as patient_last_name, 
                   p.email as patient_email, p.phone as patient_phone
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id
            WHERE d.id = :device_id
        ");
        $stmt->execute(['device_id' => $device_id]);
        $device = $stmt->fetch();
        
        if (!$device) {
            return;
        }
        
        $deviceName = $device['device_name'] ?: $device['sim_iccid'];
        $subject = "Alerte: $deviceName - " . ucfirst(str_replace('_', ' ', $alert_type));
        $priority = ($severity === 'critical' || $severity === 'high') ? 'high' : 'medium';
        
        // Notifications pour le patient (si assigné)
        if ($device['patient_id']) {
            // Récupérer les préférences du patient
            $prefsStmt = $pdo->prepare("SELECT * FROM patient_notifications_preferences WHERE patient_id = :patient_id");
            $prefsStmt->execute(['patient_id' => $device['patient_id']]);
            $patientPrefs = $prefsStmt->fetch();
            
            // Si pas de préférences, créer avec valeurs par défaut
            if (!$patientPrefs) {
                $pdo->prepare("
                    INSERT INTO patient_notifications_preferences (patient_id, email_enabled, sms_enabled, push_enabled, notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_alert_critical)
                    VALUES (:patient_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
                ")->execute(['patient_id' => $device['patient_id']]);
                $patientPrefs = ['email_enabled' => false, 'sms_enabled' => false, 'push_enabled' => false, 'notify_battery_low' => false, 'notify_device_offline' => false, 'notify_abnormal_flow' => false, 'notify_alert_critical' => false];
            }
            
            // Vérifier si cette alerte doit être notifiée au patient
            $shouldNotify = false;
            if ($alert_type === 'low_battery' && ($patientPrefs['notify_battery_low'] ?? false)) {
                $shouldNotify = true;
            } elseif ($alert_type === 'device_offline' && ($patientPrefs['notify_device_offline'] ?? false)) {
                $shouldNotify = true;
            } elseif ($alert_type === 'abnormal_flow' && ($patientPrefs['notify_abnormal_flow'] ?? false)) {
                $shouldNotify = true;
            } elseif ($severity === 'critical' && ($patientPrefs['notify_alert_critical'] ?? false)) {
                $shouldNotify = true;
            }
            
            if ($shouldNotify) {
                $patientMessage = "Alerte sur votre dispositif $deviceName:\n\n$message\n\nSévérité: $severity";
                
                // Email patient
                if ($patientPrefs['email_enabled'] && $device['patient_email']) {
                    queueNotification($pdo, null, $device['patient_id'], 'email', $subject, $patientMessage, $priority, [
                        'device_id' => $device_id,
                        'alert_type' => $alert_type,
                        'severity' => $severity
                    ]);
                }
                
                // SMS patient
                if ($patientPrefs['sms_enabled'] && $device['patient_phone']) {
                    queueNotification($pdo, null, $device['patient_id'], 'sms', $subject, $patientMessage, $priority, [
                        'device_id' => $device_id,
                        'alert_type' => $alert_type,
                        'severity' => $severity
                    ]);
                }
            }
        }
        
        // Notifications pour les utilisateurs (médecins, techniciens, admins)
        // Récupérer tous les utilisateurs actifs avec leurs préférences
        // Vérifier si la colonne phone existe (utilise helper)
        $hasPhoneColumn = columnExists('users', 'phone');
        
        if ($hasPhoneColumn) {
            $usersStmt = $pdo->prepare("
                SELECT u.id, u.email, u.phone, unp.*
                FROM users u
                LEFT JOIN user_notifications_preferences unp ON u.id = unp.user_id
                WHERE u.is_active = TRUE AND u.deleted_at IS NULL
            ");
        } else {
            $usersStmt = $pdo->prepare("
                SELECT u.id, u.email, NULL AS phone, unp.*
                FROM users u
                LEFT JOIN user_notifications_preferences unp ON u.id = unp.user_id
                WHERE u.is_active = TRUE AND u.deleted_at IS NULL
            ");
        }
        $usersStmt->execute();
        $users = $usersStmt->fetchAll();
        
        foreach ($users as $user) {
            // Si pas de préférences, utiliser valeurs par défaut
            if (!$user['email_enabled'] && !$user['sms_enabled']) {
                continue; // Utilisateur sans notifications activées
            }
            
            // Vérifier les préférences spécifiques
            $shouldNotifyUser = false;
            if ($alert_type === 'low_battery' && ($user['notify_battery_low'] ?? false)) {
                $shouldNotifyUser = true;
            } elseif ($alert_type === 'device_offline' && ($user['notify_device_offline'] ?? false)) {
                $shouldNotifyUser = true;
            } elseif ($alert_type === 'abnormal_flow' && ($user['notify_abnormal_flow'] ?? false)) {
                $shouldNotifyUser = true;
            } elseif ($severity === 'critical') {
                $shouldNotifyUser = true; // Toujours notifier les alertes critiques
            }
            
            if ($shouldNotifyUser) {
                $userMessage = "Alerte dispositif $deviceName:\n\n$message\n\nSévérité: $severity";
                if ($device['patient_first_name']) {
                    $userMessage .= "\n\nPatient: {$device['patient_first_name']} {$device['patient_last_name']}";
                }
                
                // Email utilisateur
                if ($user['email_enabled'] && $user['email']) {
                    queueNotification($pdo, $user['id'], null, 'email', $subject, $userMessage, $priority, [
                        'device_id' => $device_id,
                        'alert_type' => $alert_type,
                        'severity' => $severity
                    ]);
                }
                
                // SMS utilisateur
                if ($user['sms_enabled'] && $user['phone']) {
                    queueNotification($pdo, $user['id'], null, 'sms', $subject, $userMessage, $priority, [
                        'device_id' => $device_id,
                        'alert_type' => $alert_type,
                        'severity' => $severity
                    ]);
                }
            }
        }
    } catch(PDOException $e) {
        error_log("Erreur triggerAlertNotifications: " . $e->getMessage());
    }
}

/**
 * Traite la queue de notifications (à appeler via cron/worker)
 */
function processNotificationsQueue($pdo, $limit = 50) {
    try {
        // Récupérer les notifications en attente
        $stmt = $pdo->prepare("
            SELECT nq.*, u.email as user_email, u.phone as user_phone, 
                   p.email as patient_email, p.phone as patient_phone
            FROM notifications_queue nq
            LEFT JOIN users u ON nq.user_id = u.id AND u.deleted_at IS NULL
            LEFT JOIN patients p ON nq.patient_id = p.id AND p.deleted_at IS NULL
            WHERE nq.status = 'pending'
            AND nq.send_after <= NOW()
            AND nq.attempts < nq.max_attempts
            ORDER BY 
                CASE nq.priority 
                    WHEN 'critical' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'medium' THEN 3 
                    ELSE 4 
                END,
                nq.created_at ASC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $notifications = $stmt->fetchAll();
        
        $processed = 0;
        $success = 0;
        $failed = 0;
        
        foreach ($notifications as $notif) {
            $processed++;
            
            // Déterminer le destinataire
            $to = null;
            if ($notif['user_email'] || $notif['user_phone']) {
                $to = $notif['type'] === 'email' ? $notif['user_email'] : $notif['user_phone'];
            } elseif ($notif['patient_email'] || $notif['patient_phone']) {
                $to = $notif['type'] === 'email' ? $notif['patient_email'] : $notif['patient_phone'];
            }
            
            if (!$to) {
                // Pas de destinataire, marquer comme échoué
                $pdo->prepare("
                    UPDATE notifications_queue 
                    SET status = 'failed', error_message = 'No recipient found', attempts = attempts + 1
                    WHERE id = :id
                ")->execute(['id' => $notif['id']]);
                $failed++;
                continue;
            }
            
            // Envoyer selon le type
            $sent = false;
            $errorMsg = null;
            
            try {
                if ($notif['type'] === 'email') {
                    $sent = sendEmail($to, $notif['subject'] ?: 'Notification OTT', $notif['message']);
                } elseif ($notif['type'] === 'sms') {
                    $sent = sendSMS($to, $notif['message']);
                } elseif ($notif['type'] === 'push') {
                    // Push notifications: à implémenter avec PWA/service worker
                    // Pour l'instant, on marque comme envoyé (sera géré côté frontend)
                    $sent = true;
                }
                
                if ($sent) {
                    $pdo->prepare("
                        UPDATE notifications_queue 
                        SET status = 'sent', sent_at = NOW(), attempts = attempts + 1
                        WHERE id = :id
                    ")->execute(['id' => $notif['id']]);
                    $success++;
                } else {
                    throw new Exception("Envoi échoué");
                }
            } catch(Exception $e) {
                $errorMsg = $e->getMessage();
                $newAttempts = $notif['attempts'] + 1;
                
                if ($newAttempts >= $notif['max_attempts']) {
                    // Max tentatives atteint, marquer comme échoué
                    $pdo->prepare("
                        UPDATE notifications_queue 
                        SET status = 'failed', error_message = :error, attempts = :attempts
                        WHERE id = :id
                    ")->execute([
                        'id' => $notif['id'],
                        'error' => $errorMsg,
                        'attempts' => $newAttempts
                    ]);
                    $failed++;
                } else {
                    // Réessayer plus tard
                    $pdo->prepare("
                        UPDATE notifications_queue 
                        SET error_message = :error, attempts = :attempts, send_after = NOW() + INTERVAL '5 minutes'
                        WHERE id = :id
                    ")->execute([
                        'id' => $notif['id'],
                        'error' => $errorMsg,
                        'attempts' => $newAttempts
                    ]);
                }
            }
        }
        
        return [
            'processed' => $processed,
            'success' => $success,
            'failed' => $failed
        ];
    } catch(PDOException $e) {
        error_log("Erreur processNotificationsQueue: " . $e->getMessage());
        return ['processed' => 0, 'success' => 0, 'failed' => 0, 'error' => $e->getMessage()];
    }
}

?>

