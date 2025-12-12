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
 * Obtient le répertoire racine du projet
 * @return string Chemin absolu vers la racine du projet
 */
function getProjectRoot() {
    // __DIR__ dans api/helpers.php est api/
    // On remonte d'un niveau pour obtenir la racine du projet
    return dirname(__DIR__);
}

/**
 * Encode binary data for PostgreSQL BYTEA column
 * PDO with PostgreSQL requires BYTEA data to be encoded in hexadecimal format
 * 
 * @param string $binaryData Raw binary data
 * @return string|null Encoded data ready for BYTEA insertion (null if empty)
 */
function encodeByteaForPostgres($binaryData) {
    if (empty($binaryData)) {
        return null;
    }
    
    // Option 1: Use pg_escape_bytea() if pgsql extension is available
    if (function_exists('pg_escape_bytea')) {
        return pg_escape_bytea($binaryData);
    }
    
    // Option 2: Use hexadecimal format \x... (PostgreSQL native format)
    // This is the most reliable method with PDO
    return '\\x' . bin2hex($binaryData);
}

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
        
        // Vérifier que le contenu n'est pas vide
        if (strlen($decoded_content) === 0) {
            error_log('[findFirmwareInoFile] ❌ ino_content est vide en DB pour firmware_id=' . $firmware_id);
            return null;
        }
        
        if (file_put_contents($temp_file, $decoded_content) !== false) {
            // Vérifier que le fichier a bien été créé et n'est pas vide
            if (file_exists($temp_file) && filesize($temp_file) > 0) {
                error_log('[findFirmwareInoFile] ✅ Fichier trouvé en DB (BYTEA), créé temporaire: ' . $temp_file . ' (taille: ' . strlen($decoded_content) . ' bytes)');
                return $temp_file;
            } else {
                error_log('[findFirmwareInoFile] ⚠️ Fichier temporaire créé mais vide ou introuvable: ' . $temp_file);
                @unlink($temp_file); // Nettoyer
                return null;
            }
        } else {
            error_log('[findFirmwareInoFile] ⚠️ Impossible de créer fichier temporaire depuis DB: ' . $temp_file);
            error_log('[findFirmwareInoFile]    Erreur: ' . error_get_last()['message'] ?? 'Inconnue');
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
 * Détecte si le serveur tourne sous Windows
 */
function is_windows() {
    return strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
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

/**
 * Copie récursivement un répertoire avec keep-alive pour maintenir la connexion SSE
 * @param string $src Chemin source
 * @param string $dst Chemin destination
 * @param callable $keepAliveCallback Fonction à appeler périodiquement pour maintenir la connexion
 */
function copyRecursiveWithKeepAlive($src, $dst, $keepAliveCallback = null) {
    $dir = opendir($src);
    if (!$dir) {
        return false;
    }
    
    if (!is_dir($dst)) {
        mkdir($dst, 0755, true);
    }
    
    $fileCount = 0;
    $lastKeepAlive = time();
    
    while (($file = readdir($dir)) !== false) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        
        $srcPath = $src . '/' . $file;
        $dstPath = $dst . '/' . $file;
        
        if (is_dir($srcPath)) {
            copyRecursiveWithKeepAlive($srcPath, $dstPath, $keepAliveCallback);
        } else {
            copy($srcPath, $dstPath);
            $fileCount++;
            
            // Envoyer un keep-alive toutes les 2 secondes pendant la copie
            if ($keepAliveCallback && (time() - $lastKeepAlive) >= 2) {
                $keepAliveCallback();
                $lastKeepAlive = time();
            }
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

/**
 * Parse SQL en tenant compte des blocs dollar-quoted ($$ ... $$ ou $tag$ ... $tag$)
 * Utilise une approche simple : remplace temporairement les blocs dollar-quoted par des placeholders
 * @param string $sql SQL à parser
 * @return array Tableau d'instructions SQL
 */
function parseSqlStatements($sql) {
    // Approche simple : utiliser une boucle pour trouver et remplacer TOUS les blocs $$ ... $$
    // de manière itérative jusqu'à ce qu'il n'y en ait plus
    
    $placeholders = [];
    $placeholderIndex = 0;
    $protectedSql = $sql;
    $maxIterations = 100;
    $iteration = 0;
    
    // Boucle pour trouver tous les blocs $$ ... $$
    while ($iteration < $maxIterations) {
        // Chercher le premier bloc $$ ... $$
        $startPos = strpos($protectedSql, '$$');
        if ($startPos === false) {
            // Plus de blocs à trouver
            break;
        }
        
        // Trouver le $$ de fermeture correspondant (le prochain $$ après celui-ci)
        $endPos = strpos($protectedSql, '$$', $startPos + 2);
        if ($endPos === false) {
            // Bloc non fermé, sortir
            error_log("[parseSqlStatements] ⚠️ Bloc $$ non fermé à la position {$startPos}");
            break;
        }
        
        // Extraire le bloc complet (incluant les $$ de début et fin)
        $block = substr($protectedSql, $startPos, $endPos - $startPos + 2);
        
        // Créer un placeholder unique
        $placeholder = "___DOLLAR_QUOTE_{$placeholderIndex}___";
        $placeholders[$placeholder] = $block;
        
        // Remplacer le bloc par le placeholder
        $protectedSql = substr_replace($protectedSql, $placeholder, $startPos, $endPos - $startPos + 2);
        
        error_log("[parseSqlStatements] Bloc trouvé à la position {$startPos}, longueur: " . strlen($block) . " chars");
        error_log("[parseSqlStatements] Bloc preview: " . substr($block, 0, 150) . "...");
        error_log("[parseSqlStatements] Placeholder: {$placeholder}");
        
        $placeholderIndex++;
        $iteration++;
    }
    
    error_log("[parseSqlStatements] Nombre de blocs dollar-quoted trouvés: " . count($placeholders));
    
    // Vérifier qu'il ne reste plus de $$
    if (strpos($protectedSql, '$$') !== false) {
        error_log("[parseSqlStatements] ⚠️ ATTENTION: Des $$ sont encore présents dans le SQL protégé !");
        error_log("[parseSqlStatements] SQL protégé (preview): " . substr($protectedSql, 0, 500));
    }
    
    $result = $protectedSql;
    
    // Log pour debug
    error_log("[parseSqlStatements] Nombre de blocs dollar-quoted trouvés: " . count($placeholders));
    if (count($placeholders) > 0) {
        foreach ($placeholders as $ph => $block) {
            error_log("[parseSqlStatements] Placeholder {$ph} -> bloc de " . strlen($block) . " chars");
            error_log("[parseSqlStatements] Bloc preview: " . substr($block, 0, 100) . "...");
        }
    }
    
    // Étape 2: Diviser par point-virgule maintenant que les blocs sont protégés
    error_log("[parseSqlStatements] SQL protégé (preview): " . substr($result, 0, 300));
    $rawStatements = explode(';', $result);
    error_log("[parseSqlStatements] Nombre d'instructions après division: " . count($rawStatements));
    
    // Étape 3: Réassembler les parties qui contiennent des placeholders
    // Une instruction qui contient un placeholder peut être divisée en plusieurs parties
    $statements = [];
    $currentParts = [];
    
    foreach ($rawStatements as $index => $rawStmt) {
        $stmt = trim($rawStmt);
        
        if (empty($stmt)) {
            // Partie vide, finaliser l'instruction en cours si elle existe
            if (!empty($currentParts)) {
                $finalStmt = implode('; ', $currentParts) . ';';
                // Restaurer les placeholders
                foreach (array_reverse($placeholders, true) as $placeholder => $original) {
                    $finalStmt = str_replace($placeholder, $original, $finalStmt);
                }
                if (!preg_match('/^\s*--/', $finalStmt)) {
                    $statements[] = $finalStmt;
                }
                $currentParts = [];
            }
            continue;
        }
        
        // Vérifier si cette partie contient un placeholder
        $hasPlaceholder = false;
        foreach ($placeholders as $placeholder => $original) {
            if (strpos($stmt, $placeholder) !== false) {
                $hasPlaceholder = true;
                break;
            }
        }
        
        // Vérifier si cette partie contient un placeholder
        $hasPlaceholder = false;
        $placeholderInStmt = null;
        foreach ($placeholders as $placeholder => $original) {
            if (strpos($stmt, $placeholder) !== false) {
                $hasPlaceholder = true;
                $placeholderInStmt = $placeholder;
                break;
            }
        }
        
        if ($hasPlaceholder) {
            // Cette partie contient un placeholder, l'ajouter à l'instruction en cours
            $currentParts[] = $stmt;
            
            // Vérifier si cette partie termine l'instruction (contient "LANGUAGE" après le placeholder)
            // Le placeholder peut être suivi de retours à la ligne, espaces, puis LANGUAGE
            $isComplete = false;
            if ($placeholderInStmt) {
                // Chercher le placeholder suivi éventuellement de whitespace puis LANGUAGE
                // Utiliser [\s\S] pour matcher tous les caractères y compris les retours à la ligne
                if (preg_match('/' . preg_quote($placeholderInStmt, '/') . '[\s\S]*?LANGUAGE\s+\w+/i', $stmt)) {
                    $isComplete = true;
                }
            }
            
            if ($isComplete) {
                // L'instruction est complète, la finaliser
                $finalStmt = implode('; ', $currentParts) . ';';
                // Restaurer les placeholders
                foreach (array_reverse($placeholders, true) as $placeholder => $original) {
                    $finalStmt = str_replace($placeholder, $original, $finalStmt);
                }
                if (!preg_match('/^\s*--/', $finalStmt)) {
                    $statements[] = $finalStmt;
                }
                $currentParts = [];
            }
        } else {
            // Pas de placeholder dans cette partie
            // MAIS: Si on a une instruction en cours avec placeholder, vérifier si cette partie
            // complète l'instruction (commence par "LANGUAGE")
            if (!empty($currentParts)) {
                // Vérifier si cette partie commence par "LANGUAGE" (suite de l'instruction avec placeholder)
                // Peut commencer par des whitespace (retours à la ligne, espaces)
                if (preg_match('/^[\s\n\r]*LANGUAGE\s+\w+/i', $stmt)) {
                    // Cette partie complète l'instruction en cours, l'ajouter
                    $currentParts[] = $stmt;
                    $finalStmt = implode('; ', $currentParts) . ';';
                    // Restaurer les placeholders
                    foreach (array_reverse($placeholders, true) as $placeholder => $original) {
                        $finalStmt = str_replace($placeholder, $original, $finalStmt);
                    }
                    if (!preg_match('/^\s*--/', $finalStmt)) {
                        $statements[] = $finalStmt;
                    }
                    $currentParts = [];
                    continue;
                } else {
                    // Cette partie ne complète pas l'instruction, finaliser l'instruction en cours d'abord
                    $finalStmt = implode('; ', $currentParts) . ';';
                    // Restaurer les placeholders
                    foreach (array_reverse($placeholders, true) as $placeholder => $original) {
                        $finalStmt = str_replace($placeholder, $original, $finalStmt);
                    }
                    if (!preg_match('/^\s*--/', $finalStmt)) {
                        $statements[] = $finalStmt;
                    }
                    $currentParts = [];
                }
            }
            
            // Ajouter cette instruction normale (si elle n'est pas vide et n'est pas un commentaire)
            if (!preg_match('/^\s*--/', $stmt)) {
                $statements[] = $stmt . ';';
            }
        }
    }
    
    // Finaliser l'instruction en cours si elle existe
    if (!empty($currentParts)) {
        $finalStmt = implode('; ', $currentParts) . ';';
        // Restaurer les placeholders
        foreach (array_reverse($placeholders, true) as $placeholder => $original) {
            $finalStmt = str_replace($placeholder, $original, $finalStmt);
        }
        if (!preg_match('/^\s*--/', $finalStmt)) {
            $statements[] = $finalStmt;
        }
    }
    
    // Log pour debug (premières instructions seulement)
    foreach ($statements as $index => $stmt) {
        if ($index < 3) {
            $preview = substr($stmt, 0, 200);
            error_log("[parseSqlStatements] Instruction " . ($index + 1) . " (preview): {$preview}...");
            error_log("[parseSqlStatements] Instruction " . ($index + 1) . " longueur: " . strlen($stmt) . " chars");
            // Vérifier si l'instruction contient les éléments attendus
            if (strpos($stmt, 'CREATE OR REPLACE FUNCTION') !== false) {
                error_log("[parseSqlStatements] Instruction " . ($index + 1) . " contient 'RETURN NEW': " . (strpos($stmt, 'RETURN NEW') !== false ? 'OUI' : 'NON'));
                error_log("[parseSqlStatements] Instruction " . ($index + 1) . " contient 'END;': " . (strpos($stmt, 'END;') !== false ? 'OUI' : 'NON'));
                error_log("[parseSqlStatements] Instruction " . ($index + 1) . " contient 'LANGUAGE plpgsql': " . (strpos($stmt, 'LANGUAGE plpgsql') !== false ? 'OUI' : 'NON'));
            }
        }
    }
    
    error_log("[parseSqlStatements] Nombre d'instructions finales: " . count($statements));
    return $statements;
}

function runSqlFile(PDO $pdo, $filename) {
    $path = SQL_BASE_DIR . '/' . ltrim($filename, '/');
    
    error_log("[runSqlFile] Début exécution: {$filename}");
    error_log("[runSqlFile] Chemin complet: {$path}");
    
    if (!file_exists($path)) {
        $error = "SQL file not found: {$filename} (path: {$path})";
        error_log("[runSqlFile] ❌ ERREUR: {$error}");
        throw new RuntimeException($error);
    }
    
    $sql = file_get_contents($path);
    if ($sql === false) {
        $error = "Unable to read SQL file: {$filename}";
        error_log("[runSqlFile] ❌ ERREUR: {$error}");
        throw new RuntimeException($error);
    }
    
    $sqlSize = strlen($sql);
    error_log("[runSqlFile] Fichier lu: {$sqlSize} octets");
    
    // Parser le SQL en tenant compte des blocs dollar-quoted, commentaires et chaînes
    $statements = parseSqlStatements($sql);
    
    error_log("[runSqlFile] Nombre d'instructions SQL: " . count($statements));
    
    try {
        // Exécuter chaque instruction séparément pour un meilleur diagnostic
        foreach ($statements as $index => $statement) {
            if (empty(trim($statement))) continue;
            
            $stmtPreview = substr($statement, 0, 200);
            error_log("[runSqlFile] Exécution instruction " . ($index + 1) . "/" . count($statements));
            error_log("[runSqlFile] Longueur instruction: " . strlen($statement) . " caractères");
            error_log("[runSqlFile] Preview (200 premiers chars): {$stmtPreview}...");
            
            // Vérifier si l'instruction contient un placeholder non restauré
            if (strpos($statement, '___DOLLAR_QUOTE_') !== false) {
                error_log("[runSqlFile] ⚠️ ATTENTION: L'instruction contient un placeholder non restauré !");
                error_log("[runSqlFile] Instruction complète: " . substr($statement, 0, 1000));
            }
            
            try {
                $pdo->exec($statement);
                error_log("[runSqlFile] ✅ Instruction " . ($index + 1) . " exécutée avec succès");
            } catch (PDOException $e) {
                $errorCode = $e->getCode();
                $errorMessage = $e->getMessage();
                $errorInfo = $pdo->errorInfo();
                
                error_log("[runSqlFile] ❌ ERREUR SQL à l'instruction " . ($index + 1) . ":");
                error_log("[runSqlFile]   Code: {$errorCode}");
                error_log("[runSqlFile]   Message: {$errorMessage}");
                error_log("[runSqlFile]   PDO ErrorInfo: " . json_encode($errorInfo));
                error_log("[runSqlFile]   Instruction complète: " . substr($statement, 0, 1000));
                
                // Construire un message d'erreur détaillé avec l'instruction SQL complète
                $stmtPreview = strlen($statement) > 1000 ? substr($statement, 0, 1000) . "\n... (tronqué, " . strlen($statement) . " caractères au total)" : $statement;
                
                $detailedMessage = "SQL error at statement " . ($index + 1) . "/" . count($statements) . 
                    " in file {$filename}\n\n" .
                    "Error Code: {$errorCode}\n" .
                    "Error Message: {$errorMessage}\n";
                
                if (isset($errorInfo[2])) {
                    $detailedMessage .= "PDO Error: {$errorInfo[2]}\n";
                }
                
                $detailedMessage .= "\nStatement SQL:\n" . $stmtPreview;
                
                // Relancer avec plus de détails
                throw new RuntimeException(
                    $detailedMessage,
                    $errorCode,
                    $e
                );
            }
        }
        
        error_log("[runSqlFile] ✅ Migration '{$filename}' terminée avec succès");
    } catch (Exception $e) {
        error_log("[runSqlFile] ❌ ÉCHEC migration '{$filename}': " . $e->getMessage());
        error_log("[runSqlFile] Stack trace: " . $e->getTraceAsString());
        throw $e;
    }
}
