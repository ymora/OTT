<?php
/**
 * API REST V2.0 - HAPPLYZ MEDICAL OTT
 * Version complète avec JWT, multi-users, OTA, notifications, audit
 */

require_once __DIR__ . '/bootstrap/database.php';

// Headers CORS (DOIT être en tout premier)
$defaultAllowedOrigins = [
    'https://ymora.github.io',
    'http://localhost:3000',
    'http://localhost:5173'
];

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
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-ICCID');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

// Debug mode activable via variable d'environnement
if (getenv('DEBUG_ERRORS') === 'true') {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
}

// Répondre immédiatement aux requêtes OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
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

define('JWT_SECRET', getenv('JWT_SECRET') ?: 'CHANGEZ_CE_SECRET_EN_PRODUCTION');
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
        $stmt = $pdo->query("SELECT * FROM users_with_roles ORDER BY id ASC LIMIT 1");
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
    
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? '';
    
    if (empty($authHeader)) return null;
    if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) return null;
    
    $jwt = $matches[1];
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

// ============================================================================
// ROUTER
// ============================================================================

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?? '/';
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';

// Support accès via /api.php/route (Render, Apache, etc.)
if (!empty($scriptName)) {
    $scriptBase = '/' . ltrim($scriptName, '/');
    if (strpos($path, $scriptBase) === 0) {
        $path = substr($path, strlen($scriptBase)) ?: '/';
    }
}

// Fallback générique si /api.php est en dur dans l'URL
if (strpos($path, '/api.php') === 0) {
    $path = substr($path, strlen('/api.php')) ?: '/';
}

$method = $_SERVER['REQUEST_METHOD'];

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

// Roles
} elseif(preg_match('#/roles$#', $path) && $method === 'GET') {
    handleGetRoles();
} elseif(preg_match('#/permissions$#', $path) && $method === 'GET') {
    handleGetPermissions();

// Devices (API V1 compatible + V2)
} elseif(preg_match('#/devices$#', $path) && $method === 'GET') {
    handleGetDevices();
} elseif(preg_match('#/devices/measurements$#', $path) && $method === 'POST') {
    handlePostMeasurement();
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceCommand($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'GET') {
    handleGetDeviceCommands($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands/pending$#', $path, $m) && $method === 'GET') {
    handleGetPendingCommands($m[1]);
} elseif(preg_match('#/devices/commands$#', $path) && $method === 'GET') {
    handleListAllCommands();
} elseif(preg_match('#/devices/commands/ack$#', $path) && $method === 'POST') {
    handleAcknowledgeCommand();
} elseif(preg_match('#/devices/logs$#', $path) && $method === 'POST') {
    handlePostLog();
} elseif(preg_match('#/logs$#', $path) && $method === 'GET') {
    handleGetLogs();
} elseif(preg_match('#/device/(\d+)$#', $path, $m) && $method === 'GET') {
    handleGetDeviceHistory($m[1]);

// OTA & Config
} elseif(preg_match('#/devices/(\d+)/config$#', $path, $m) && $method === 'GET') {
    handleGetDeviceConfig($m[1]);
} elseif(preg_match('#/devices/(\d+)/config$#', $path, $m) && $method === 'PUT') {
    handleUpdateDeviceConfig($m[1]);
} elseif(preg_match('#/devices/(\d+)/ota$#', $path, $m) && $method === 'POST') {
    handleTriggerOTA($m[1]);
} elseif(preg_match('#/firmwares$#', $path) && $method === 'GET') {
    handleGetFirmwares();
} elseif(preg_match('#/firmwares$#', $path) && $method === 'POST') {
    handleUploadFirmware();

// Notifications
} elseif(preg_match('#/notifications/preferences$#', $path) && $method === 'GET') {
    handleGetNotificationPreferences();
} elseif(preg_match('#/notifications/preferences$#', $path) && $method === 'PUT') {
    handleUpdateNotificationPreferences();
} elseif(preg_match('#/notifications/test$#', $path) && $method === 'POST') {
    handleTestNotification();
} elseif(preg_match('#/notifications/queue$#', $path) && $method === 'GET') {
    handleGetNotificationsQueue();

// Admin tools
} elseif(preg_match('#/admin/reset-demo$#', $path) && $method === 'POST') {
    handleResetDemo();

// Audit
} elseif(preg_match('#/audit$#', $path) && $method === 'GET') {
    handleGetAuditLogs();

// Alerts (V1 compatible)
} elseif(preg_match('#/alerts$#', $path) && $method === 'GET') {
    handleGetAlerts();
} elseif(preg_match('#/measurements/latest$#', $path) && $method === 'GET') {
    handleGetLatestMeasurements();

// Patients (V1 compatible)
} elseif(preg_match('#/patients$#', $path) && $method === 'GET') {
    handleGetPatients();

} else {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Endpoint not found']);
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
    
    try {
        $stmt = $pdo->query("SELECT * FROM users_with_roles ORDER BY created_at DESC");
        echo json_encode(['success' => true, 'users' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
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
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO users (email, password_hash, first_name, last_name, role_id)
            VALUES (:email, :password_hash, :first_name, :last_name, :role_id)
        ");
        $stmt->execute([
            'email' => $input['email'],
            'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT),
            'first_name' => $input['first_name'] ?? '',
            'last_name' => $input['last_name'] ?? '',
            'role_id' => $input['role_id'] ?? 4
        ]);
        
        $user_id = $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO user_notifications_preferences (user_id) VALUES (:user_id)")->execute(['user_id' => $user_id]);
        
        auditLog('user.created', 'user', $user_id, null, $input);
        echo json_encode(['success' => true, 'user_id' => $user_id]);
        
    } catch(PDOException $e) {
        http_response_code($e->getCode() == 23000 ? 409 : 500);
        echo json_encode(['success' => false, 'error' => $e->getCode() == 23000 ? 'Email exists' : 'Database error']);
    }
}

function handleUpdateUser($user_id) {
    global $pdo;
    requirePermission('users.manage');
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        $stmt->execute(['id' => $user_id]);
        $old_user = $stmt->fetch();
        
        if (!$old_user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'User not found']);
            return;
        }
        
        $updates = [];
        $params = ['id' => $user_id];
        
        foreach(['first_name', 'last_name', 'role_id', 'is_active'] as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
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
        
        auditLog('user.updated', 'user', $user_id, $old_user, $input);
        echo json_encode(['success' => true]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleDeleteUser($user_id) {
    global $pdo;
    requirePermission('users.manage');
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        $stmt->execute(['id' => $user_id]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'User not found']);
            return;
        }
        
        $pdo->prepare("DELETE FROM users WHERE id = :id")->execute(['id' => $user_id]);
        auditLog('user.deleted', 'user', $user_id, $user, null);
        echo json_encode(['success' => true]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

// ============================================================================
// HANDLERS - ROLES & PERMISSIONS
// ============================================================================

function handleGetRoles() {
    global $pdo;
    requireAuth();
    
    try {
        $stmt = $pdo->query("
            SELECT r.*, GROUP_CONCAT(p.code) as permissions
            FROM roles r
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            GROUP BY r.id
        ");
        echo json_encode(['success' => true, 'roles' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetPermissions() {
    global $pdo;
    requirePermission('users.roles');
    
    try {
        $stmt = $pdo->query("SELECT * FROM permissions ORDER BY category, code");
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
        $stmt = $pdo->query("
            SELECT d.*, p.first_name, p.last_name, dc.firmware_version, dc.ota_pending,
                   CASE 
                     WHEN d.installation_date IS NULL THEN NULL
                     ELSE EXTRACT(DAY FROM NOW() - d.installation_date)
                   END as days_with_current_patient,
                   CASE 
                     WHEN d.first_use_date IS NULL THEN NULL
                     ELSE EXTRACT(DAY FROM NOW() - d.first_use_date)
                   END as total_days_in_use,
                   (
                     SELECT SUM(
                       EXTRACT(EPOCH FROM (m.timestamp - LAG(m.timestamp) OVER (ORDER BY m.timestamp))) / 60.0
                     )
                     FROM measurements m
                     WHERE m.device_id = d.id AND m.flowrate > 0.5
                   ) as total_usage_hours
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id
            LEFT JOIN device_configurations dc ON d.id = dc.device_id
        ");
        echo json_encode(['success' => true, 'devices' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handlePostMeasurement() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['device_sim_iccid'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid data']);
        return;
    }
    
    $iccid = $input['device_sim_iccid'];
    $flowrate = $input['payload']['flowrate'] ?? $input['flowrate'] ?? 0;
    $battery = $input['payload']['battery'] ?? $input['battery'] ?? 0;
    $status = $input['status'] ?? 'TIMER';
    
    try {
        $stmt = $pdo->prepare("SELECT id FROM devices WHERE sim_iccid = :iccid");
        $stmt->execute(['iccid' => $iccid]);
        $device = $stmt->fetch();
        
        if (!$device) {
            $pdo->prepare("INSERT INTO devices (sim_iccid, last_seen, last_battery) VALUES (:iccid, NOW(), :battery)")
                ->execute(['iccid' => $iccid, 'battery' => $battery]);
            $device_id = $pdo->lastInsertId();
            $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id)")->execute(['device_id' => $device_id]);
        } else {
            $device_id = $device['id'];
            $pdo->prepare("UPDATE devices SET last_seen = NOW(), last_battery = :battery WHERE id = :id")
                ->execute(['battery' => $battery, 'id' => $device_id]);
        }
        
        $pdo->prepare("
            INSERT INTO measurements (device_id, timestamp, flowrate, battery, device_status)
            VALUES (:device_id, NOW(), :flowrate, :battery, :status)
        ")->execute([
            'device_id' => $device_id,
            'flowrate' => $flowrate,
            'battery' => $battery,
            'status' => $status
        ]);
        
        // Alertes
        if ($battery < 20) {
            createAlert($pdo, $device_id, 'low_battery', 'high', "Batterie faible: $battery%");
        }
        
        $commands = fetchPendingCommandsForDevice($device_id);
        echo json_encode([
            'success' => true,
            'device_id' => $device_id,
            'commands' => $commands
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function getDeviceByIccid($iccid) {
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM devices WHERE sim_iccid = :iccid");
    $stmt->execute(['iccid' => $iccid]);
    return $stmt->fetch();
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
        'sim_iccid' => $row['sim_iccid'] ?? null
    ];
}

function fetchPendingCommandsForDevice($device_id, $limit = 5) {
    global $pdo;
    expireDeviceCommands($device_id);
    
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
            SELECT dc.*, d.sim_iccid, d.device_name
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            WHERE dc.device_id = :device_id
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
            SELECT dc.*, d.sim_iccid, d.device_name
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            WHERE 1=1
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

    $startedAt = microtime(true);

    try {
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
    
    if (!$input || !isset($input['device_sim_iccid']) || !isset($input['event'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid data']);
        return;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT id FROM devices WHERE sim_iccid = :iccid");
        $stmt->execute(['iccid' => $input['device_sim_iccid']]);
        $device = $stmt->fetch();
        
        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Device not found']);
            return;
        }
        
        $pdo->prepare("
            INSERT INTO device_logs (device_id, timestamp, level, event_type, message, details)
            VALUES (:device_id, NOW(), :level, :event_type, :message, :details)
        ")->execute([
            'device_id' => $device['id'],
            'level' => $input['event']['level'] ?? 'INFO',
            'event_type' => $input['event']['type'] ?? 'unknown',
            'message' => $input['event']['message'] ?? '',
            'details' => isset($input['event']['details']) ? json_encode($input['event']['details']) : null
        ]);
        
        echo json_encode(['success' => true]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
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
            LEFT JOIN patients p ON d.patient_id = p.id
            WHERE 1=1
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
        $stmt = $pdo->query("
            SELECT m.*, d.sim_iccid, d.device_name
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            ORDER BY m.timestamp DESC
        ");
        echo json_encode(['success' => true, 'measurements' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetAlerts() {
    global $pdo;
    
    try {
        $stmt = $pdo->query("
            SELECT a.*, d.sim_iccid, d.device_name, p.first_name, p.last_name
            FROM alerts a
            JOIN devices d ON a.device_id = d.id
            LEFT JOIN patients p ON d.patient_id = p.id
            ORDER BY a.created_at DESC
        ");
        echo json_encode(['success' => true, 'alerts' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetPatients() {
    global $pdo;
    
    try {
        $stmt = $pdo->query("
            SELECT p.*, 
                   (SELECT COUNT(*) FROM devices WHERE patient_id = p.id) as device_count,
                   (SELECT COUNT(*) FROM measurements m JOIN devices d ON m.device_id = d.id WHERE d.patient_id = p.id AND m.timestamp >= NOW() - INTERVAL '7 DAYS') as measurements_7d
            FROM patients p
            ORDER BY p.last_name, p.first_name
        ");
        echo json_encode(['success' => true, 'patients' => $stmt->fetchAll()]);
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
            if (isset($input[$field])) {
                $updates[] = "$field = :$field";
                $params[$field] = is_array($input[$field]) ? json_encode($input[$field]) : $input[$field];
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
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleGetFirmwares() {
    global $pdo;
    requireAdmin();
    
    try {
        $stmt = $pdo->query("
            SELECT fv.*, u.email as uploaded_by_email, u.first_name, u.last_name
            FROM firmware_versions fv
            LEFT JOIN users u ON fv.uploaded_by = u.id
            ORDER BY fv.created_at DESC
        ");
        echo json_encode(['success' => true, 'firmwares' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
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
    
    if (empty($version) || pathinfo($file['name'], PATHINFO_EXTENSION) !== 'bin') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid version or file type']);
        return;
    }
    
    $upload_dir = __DIR__ . '/firmwares/';
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
    
    $file_path = 'firmwares/fw_ott_v' . $version . '.bin';
    $full_path = __DIR__ . '/' . $file_path;
    
    if (!move_uploaded_file($file['tmp_name'], $full_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save file']);
        return;
    }
    
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
        auditLog('firmware.uploaded', 'firmware', $firmware_id, null, ['version' => $version, 'file_size' => $file_size]);
        
        echo json_encode(['success' => true, 'firmware_id' => $firmware_id, 'checksum' => $checksum]);
        
    } catch(PDOException $e) {
        unlink($full_path);
        http_response_code($e->getCode() == 23000 ? 409 : 500);
        echo json_encode(['success' => false, 'error' => $e->getCode() == 23000 ? 'Version exists' : 'Database error']);
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
            $pdo->prepare("INSERT INTO user_notifications_preferences (user_id) VALUES (:user_id)")->execute(['user_id' => $user['id']]);
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
        $updates = [];
        $params = ['user_id' => $user['id']];
        
        $allowed = ['email_enabled', 'sms_enabled', 'push_enabled', 'phone_number',
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow',
                    'notify_new_patient', 'quiet_hours_start', 'quiet_hours_end'];
        
        foreach ($allowed as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
            return;
        }
        
        $stmt = $pdo->prepare("UPDATE user_notifications_preferences SET " . implode(', ', $updates) . " WHERE user_id = :user_id");
        $stmt->execute($params);
        
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleTestNotification() {
    requireAuth();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $type = $input['type'] ?? 'email';
    
    if ($type === 'email') {
        $result = ['success' => true, 'message' => 'Email test envoyé (SendGrid à configurer)'];
    } elseif ($type === 'sms') {
        $result = ['success' => true, 'message' => 'SMS test envoyé (Twilio à configurer)'];
    } else {
        $result = ['success' => false, 'error' => 'Invalid type'];
    }
    
    echo json_encode($result);
}

function handleGetNotificationsQueue() {
    global $pdo;
    requirePermission('settings.view');
    
    try {
        $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 50;
        
        $stmt = $pdo->prepare("
            SELECT nq.*, u.email, u.first_name, u.last_name
            FROM notifications_queue nq
            JOIN users u ON nq.user_id = u.id
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
            LEFT JOIN users u ON al.user_id = u.id
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

?>

