<?php
/**
 * API Helpers - Fonctions utilitaires
 * Extracted from api.php during refactoring
 */

// ============================================================================
// HELPERS - IP & Geolocation
// ============================================================================

/**
 * Fonction helper pour obtenir la position depuis l'IP du client (pour dispositifs USB)
 */
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

/**
 * Fonction helper pour obtenir l'IP réelle du client
 */
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
 * Trouve le fichier .ino d'un firmware par son ID unique
 * 
 * @param int $firmware_id ID unique du firmware
 * @param array $firmware Données du firmware depuis la DB (doit contenir 'file_path' et 'version')
 * @return string|null Chemin absolu du fichier .ino trouvé, ou null si introuvable
 */
/**
 * Trouve le fichier .ino d'un firmware - VERSION SIMPLIFIÉE
 * 
 * Principe: Le file_path en DB est la source de vérité absolue.
 * Si le fichier n'existe pas à ce chemin, il n'a jamais été uploadé correctement.
 * 
 * @param int $firmware_id ID unique du firmware
 * @param array $firmware Données du firmware depuis la DB (doit contenir 'file_path')
 * @return string|null Chemin absolu du fichier .ino trouvé, ou null si introuvable
 */
function findFirmwareInoFile($firmware_id, $firmware) {
    global $pdo;
    
    // NOUVEAU: Priorité 1 - Vérifier si le fichier est stocké en DB (BYTEA)
    if (!empty($firmware['ino_content'])) {
        // Créer un fichier temporaire depuis la DB
        $temp_dir = sys_get_temp_dir();
        $temp_file = $temp_dir . '/ott_firmware_' . $firmware_id . '_' . time() . '.ino';
        
        // PDO retourne les BYTEA comme chaînes binaires brutes (déjà décodées automatiquement)
        // Pas besoin de pg_unescape_bytea() avec PDO
        $decoded_content = $firmware['ino_content'];
        
        // Convertir en chaîne si c'est une ressource (stream)
        if (is_resource($decoded_content)) {
            $decoded_content = stream_get_contents($decoded_content);
        }
        
        // Vérifier que le contenu est valide
        if (!is_string($decoded_content)) {
            error_log('[findFirmwareInoFile] ❌ ino_content n\'est pas une chaîne (type: ' . gettype($firmware['ino_content']) . ')');
            return null;
        }
        
        if (file_put_contents($temp_file, $decoded_content) !== false) {
            error_log('[findFirmwareInoFile] ✅ Fichier trouvé en DB (BYTEA), créé temporaire: ' . $temp_file . ' (taille: ' . strlen($decoded_content) . ' bytes)');
            return $temp_file;
        } else {
            error_log('[findFirmwareInoFile] ⚠️ Impossible de créer fichier temporaire depuis DB');
        }
    }
    
    // Fallback: Chercher dans le système de fichiers (compatibilité)
    if (empty($firmware['file_path'])) {
        error_log('[findFirmwareInoFile] ❌ file_path vide en DB pour firmware_id=' . $firmware_id);
        return null;
    }
    
    // Chemin absolu standard depuis la racine du projet
    $root_dir = getProjectRoot();
    $absolute_path = $root_dir . '/' . $firmware['file_path'];
    
    if (file_exists($absolute_path) && is_file($absolute_path) && preg_match('/\.ino$/', $absolute_path)) {
        error_log('[findFirmwareInoFile] ✅ Fichier trouvé sur disque: ' . $absolute_path);
        return $absolute_path;
    }
    
    // Si le fichier n'existe pas, c'est qu'il n'a jamais été uploadé correctement
    // On vérifie juste si le dossier parent existe pour le diagnostic
    $parent_dir = dirname($absolute_path);
    $dir_exists = is_dir($parent_dir);
    
    error_log('[findFirmwareInoFile] ❌ Fichier introuvable: ' . $firmware['file_path']);
    error_log('[findFirmwareInoFile]    Chemin absolu testé: ' . $absolute_path);
    error_log('[findFirmwareInoFile]    Dossier parent existe: ' . ($dir_exists ? 'OUI' : 'NON'));
    error_log('[findFirmwareInoFile]    Stocké en DB: ' . (!empty($firmware['ino_content']) ? 'OUI' : 'NON'));
    
    if ($dir_exists) {
        // Lister les fichiers dans le dossier pour diagnostic
        $files_in_dir = glob($parent_dir . '/*.ino');
        error_log('[findFirmwareInoFile]    Fichiers .ino dans le dossier: ' . count($files_in_dir));
        if (count($files_in_dir) > 0) {
            $file_list = array_map('basename', array_slice($files_in_dir, 0, 5));
            error_log('[findFirmwareInoFile]    Liste: ' . implode(', ', $file_list));
        }
    }
    
    return null;
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
