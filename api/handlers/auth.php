<?php
/**
 * API Handlers - Authentication & Users
 * Extracted from api.php during refactoring
 */

// ============================================================================
// HANDLERS - AUTHENTICATION
// ============================================================================

/**
 * Vérifie le rate limiting pour les tentatives de connexion
 * @param string $email Email de l'utilisateur
 * @param int $maxAttempts Nombre maximum de tentatives
 * @param int $windowMinutes Fenêtre de temps en minutes
 * @return bool true si autorisé, false si bloqué
 */
function checkRateLimit($email, $maxAttempts = 5, $windowMinutes = 5) {
    $lockFile = sys_get_temp_dir() . '/ott_login_' . md5($email) . '.lock';
    $attempts = [];
    
    if (file_exists($lockFile)) {
        $data = file_get_contents($lockFile);
        if ($data !== false) {
            $attempts = json_decode($data, true) ?: [];
        }
        // Nettoyer les tentatives anciennes (hors de la fenêtre de temps)
        $now = time();
        $windowSeconds = $windowMinutes * 60;
        $attempts = array_filter($attempts, function($timestamp) use ($now, $windowSeconds) {
            return ($now - $timestamp) < $windowSeconds;
        });
    }
    
    // Vérifier si le nombre de tentatives dépasse la limite
    if (count($attempts) >= $maxAttempts) {
        return false; // Trop de tentatives
    }
    
    // Enregistrer cette tentative
    $attempts[] = time();
    file_put_contents($lockFile, json_encode($attempts));
    
    return true;
}

function handleLogin() {
    global $pdo;
    
    // S'assurer que le Content-Type est JSON et nettoyer le buffer
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        
        if (empty($email) || empty($password)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Email and password required'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
    
        // SÉCURITÉ: Rate limiting pour protéger contre les attaques par force brute
        if (!checkRateLimit($email, 5, 5)) {
            auditLog('user.login_rate_limited', 'user', null, null, ['email' => $email]);
            http_response_code(429);
            echo json_encode([
                'success' => false, 
                'error' => 'Too many login attempts. Please try again in 5 minutes.'
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        // Récupérer l'utilisateur directement depuis la table users pour avoir le password_hash
        // IMPORTANT: Forcer FETCH_ASSOC pour être sûr d'avoir un tableau associatif
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email");
        $stmt->setFetchMode(PDO::FETCH_ASSOC);
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();
        
        // Debug: Logger les informations pour diagnostiquer
        if (!$user) {
            error_log('[handleLogin] User not found: ' . $email);
            // DEBUG: Vérifier si l'utilisateur existe avec une requête différente
            $debugStmt = $pdo->prepare("SELECT COUNT(*) as count FROM users WHERE email = :email");
            $debugStmt->execute(['email' => $email]);
            $debugResult = $debugStmt->fetch(PDO::FETCH_ASSOC);
            error_log('[handleLogin] DEBUG - Count query result: ' . json_encode($debugResult));
            auditLog('user.login_failed', 'user', null, null, ['email' => $email]);
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        
        // DEBUG: Logger toutes les valeurs de l'utilisateur
        error_log('[handleLogin] DEBUG - User found: ' . json_encode([
            'id' => $user['id'] ?? 'MISSING',
            'email' => $user['email'] ?? 'MISSING',
            'is_active' => $user['is_active'] ?? 'MISSING',
            'is_active_type' => gettype($user['is_active'] ?? null),
            'is_active_bool' => (bool)($user['is_active'] ?? false),
            'deleted_at' => $user['deleted_at'] ?? 'MISSING',
            'deleted_at_type' => gettype($user['deleted_at'] ?? null),
            'password_hash_length' => strlen($user['password_hash'] ?? '')
        ]));
        
        // Vérifier les conditions après avoir trouvé l'utilisateur
        // PostgreSQL retourne 't'/'f' pour boolean, ou true/false selon la version
        $isActive = false;
        if (isset($user['is_active'])) {
            $isActiveValue = $user['is_active'];
            // Gérer les différents formats PostgreSQL
            if (is_bool($isActiveValue)) {
                $isActive = $isActiveValue;
            } elseif (is_string($isActiveValue)) {
                $isActive = in_array(strtolower($isActiveValue), ['t', 'true', '1', 'yes']);
            } elseif (is_numeric($isActiveValue)) {
                $isActive = (int)$isActiveValue !== 0;
            }
        }
        
        $isDeleted = false;
        if (isset($user['deleted_at'])) {
            $deletedAtValue = $user['deleted_at'];
            $isDeleted = ($deletedAtValue !== null && $deletedAtValue !== '');
        }
        
        if (!$isActive || $isDeleted) {
            error_log('[handleLogin] User found but inactive or deleted: ' . $email . ' - is_active: ' . ($isActive ? 'true' : 'false') . ' - deleted_at: ' . ($isDeleted ? 'not_null' : 'null'));
            auditLog('user.login_failed', 'user', null, null, ['email' => $email, 'reason' => 'inactive_or_deleted']);
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        
        $hash = $user['password_hash'] ?? '';
        $hashLength = strlen($hash);
        $verifyResult = password_verify($password, $hash);
        
        error_log('[handleLogin] Debug - Email: ' . $email . ', Hash length: ' . $hashLength . ', Verify result: ' . ($verifyResult ? 'true' : 'false'));
        
        if (!$verifyResult) {
            error_log('[handleLogin] Password verification failed for: ' . $email);
            error_log('[handleLogin] Hash preview: ' . substr($hash, 0, 30) . '...');
            auditLog('user.login_failed', 'user', null, null, ['email' => $email]);
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Invalid credentials'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        
        $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = :id")->execute(['id' => $user['id']]);
        
        // Récupérer les informations complètes depuis la vue pour le retour
        $userStmt = $pdo->prepare("SELECT * FROM users_with_roles WHERE id = :id");
        $userStmt->setFetchMode(PDO::FETCH_ASSOC);
        $userStmt->execute(['id' => $user['id']]);
        $userFull = $userStmt->fetch();
        
        if (!$userFull) {
            // Fallback si la vue ne fonctionne pas
            $roleStmt = $pdo->prepare("SELECT name FROM roles WHERE id = :role_id");
            $roleStmt->setFetchMode(PDO::FETCH_ASSOC);
            $roleStmt->execute(['role_id' => $user['role_id']]);
            $role = $roleStmt->fetch();
            $userFull = $user;
            $userFull['role_name'] = $role['name'] ?? 'unknown';
            $userFull['permissions'] = '';
        }
        
        try {
            $token = generateJWT([
                'user_id' => $userFull['id'],
                'email' => $userFull['email'],
                'role' => $userFull['role_name']
            ]);
        } catch(Exception $jwtError) {
            error_log('[handleLogin] JWT generation error: ' . $jwtError->getMessage());
            http_response_code(500);
            $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $jwtError->getMessage() : 'Token generation error';
            echo json_encode(['success' => false, 'error' => $errorMsg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        
        try {
            auditLog('user.login', 'user', $userFull['id']);
        } catch(Exception $auditError) {
            // Ne pas bloquer la connexion si l'audit échoue
            error_log('[handleLogin] Audit log error (non-blocking): ' . $auditError->getMessage());
        }
        
        unset($userFull['password_hash']);
        // Convertir permissions en tableau si c'est une string
        $permissionsStr = $userFull['permissions'] ?? '';
        $userFull['permissions'] = !empty($permissionsStr) ? explode(',', $permissionsStr) : [];
        
        echo json_encode(['success' => true, 'token' => $token, 'user' => $userFull], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
    } catch(PDOException $e) {
        error_log('[handleLogin] Database error: ' . $e->getMessage());
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        echo json_encode(['success' => false, 'error' => $errorMsg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch(Exception $e) {
        error_log('[handleLogin] Error: ' . $e->getMessage());
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Server error';
        echo json_encode(['success' => false, 'error' => $errorMsg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
    
    // Paramètre pour inclure les utilisateurs archivés (soft-deleted)
    $includeDeleted = isset($_GET['include_deleted']) && $_GET['include_deleted'] === 'true';
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    
    // Définir la clause WHERE
    $whereClause = $includeDeleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
    
    try {
        // SÉCURITÉ: Utiliser des paramètres nommés au lieu de concaténation SQL
        // Condition WHERE selon le paramètre include_deleted
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE deleted_at " . ($includeDeleted ? "IS NOT NULL" : "IS NULL"));
        $countStmt->execute();
        $total = $countStmt->fetchColumn();
        
        // Vérifier si la colonne phone existe (utilise helper)
        $hasPhoneColumn = columnExists('users', 'phone');
        
        // Requête unifiée : retourner phone si la colonne existe, sinon NULL
        if ($hasPhoneColumn) {
            $stmt = $pdo->prepare("
                SELECT 
                    u.id, u.email, u.first_name, u.last_name, u.phone, u.password_hash,
                    u.is_active, u.last_login, u.created_at, u.deleted_at,
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
                WHERE u.$whereClause
                GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.password_hash,
                         u.is_active, u.last_login, u.created_at, u.deleted_at, r.name, r.description,
                         unp.email_enabled, unp.sms_enabled, unp.push_enabled,
                         unp.notify_battery_low, unp.notify_device_offline, 
                         unp.notify_abnormal_flow, unp.notify_new_patient
                ORDER BY " . ($includeDeleted ? "u.deleted_at DESC" : "u.created_at DESC") . "
                LIMIT :limit OFFSET :offset
            ");
        } else {
            // Version sans colonne phone - retourner NULL AS phone
            $stmt = $pdo->prepare("
                SELECT 
                    u.id, u.email, u.first_name, u.last_name, NULL AS phone, u.password_hash,
                    u.is_active, u.last_login, u.created_at, u.deleted_at,
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
                WHERE u.$whereClause
                GROUP BY u.id, u.email, u.first_name, u.last_name, u.password_hash,
                         u.is_active, u.last_login, u.created_at, u.deleted_at, r.name, r.description,
                         unp.email_enabled, unp.sms_enabled, unp.push_enabled,
                         unp.notify_battery_low, unp.notify_device_offline, 
                         unp.notify_abnormal_flow, unp.notify_new_patient
                ORDER BY " . ($includeDeleted ? "u.deleted_at DESC" : "u.created_at DESC") . "
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
        // Vérifier d'abord les utilisateurs actifs
        $checkStmt = $pdo->prepare("SELECT id, deleted_at FROM users WHERE email = :email");
        $checkStmt->execute(['email' => trim($input['email'])]);
        $existingUser = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existingUser) {
            if ($existingUser['deleted_at'] === null) {
                // Utilisateur actif existe déjà
                http_response_code(409);
                echo json_encode([
                    'success' => false, 
                    'error' => 'Cet email est déjà utilisé par un autre utilisateur'
                ]);
                return;
            } else {
                // Utilisateur archivé existe : supprimer définitivement pour permettre la création
                error_log('[handleCreateUser] Utilisateur archivé trouvé (id: ' . $existingUser['id'] . '), suppression définitive avant création');
                
                // Supprimer les préférences de notifications
                try {
                    $pdo->prepare("DELETE FROM user_notifications_preferences WHERE user_id = :user_id")
                        ->execute(['user_id' => $existingUser['id']]);
                } catch(PDOException $e) {
                    error_log('[handleCreateUser] Could not delete notification preferences: ' . $e->getMessage());
                }
                
                // Mettre à jour les logs d'audit
                try {
                    $pdo->prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = :user_id")
                        ->execute(['user_id' => $existingUser['id']]);
                } catch(PDOException $e) {
                    error_log('[handleCreateUser] Could not update audit logs: ' . $e->getMessage());
                }
                
                // Supprimer définitivement l'utilisateur archivé
                $pdo->prepare("DELETE FROM users WHERE id = :id")
                    ->execute(['id' => $existingUser['id']]);
                
                error_log('[handleCreateUser] Utilisateur archivé supprimé définitivement (id: ' . $existingUser['id'] . ')');
            }
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
    
    $user = getCurrentUser();
    $isAdmin = $user && $user['role_name'] === 'admin';
    
    // Vérifier si c'est un archivage forcé (pour admins qui veulent archiver au lieu de supprimer)
    $forceArchive = isset($_GET['archive']) && $_GET['archive'] === 'true';
    $forcePermanent = isset($_GET['permanent']) && $_GET['permanent'] === 'true';
    
    try {
        // Pour la suppression définitive, on peut supprimer même si déjà archivé
        // Pour l'archivage normal, on ne peut archiver que si pas déjà archivé
        // SÉCURITÉ: Utiliser des paramètres nommés au lieu de concaténation SQL
        // Pour la suppression définitive, on peut supprimer même si déjà archivé
        // Pour l'archivage normal, on ne peut archiver que si pas déjà archivé
        if ($forcePermanent && $isAdmin) {
            // Suppression définitive : peut supprimer même si archivé
            $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        } else {
            // Archivage : seulement si pas déjà archivé
            $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id AND deleted_at IS NULL");
        }
        $stmt->execute(['id' => $user_id]);
        $userToDelete = $stmt->fetch();
        
        if (!$userToDelete) {
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
        
        // Si permanent=true est passé, supprimer définitivement (admins seulement)
        if ($forcePermanent && $isAdmin) {
            // SUPPRESSION DÉFINITIVE
            // Supprimer les données associées
            try {
                $pdo->prepare("DELETE FROM user_notifications_preferences WHERE user_id = :user_id")->execute(['user_id' => $user_id]);
            } catch(PDOException $e) {
                error_log('[handleDeleteUser] Could not delete notification preferences: ' . $e->getMessage());
            }
            
            // Mettre à jour les logs d'audit (garder l'historique avec user_id NULL)
            try {
                $pdo->prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = :user_id")->execute(['user_id' => $user_id]);
            } catch(PDOException $e) {
                error_log('[handleDeleteUser] Could not update audit logs: ' . $e->getMessage());
            }
            
            // Supprimer définitivement
            $pdo->prepare("DELETE FROM users WHERE id = :id")->execute(['id' => $user_id]);
            
            auditLog('user.permanently_deleted', 'user', $user_id, $userToDelete, null);
            $message = 'Utilisateur supprimé définitivement';
            $permanent = true;
        } else {
            // ARCHIVAGE (soft delete)
            // Supprimer les préférences de notifications
            try {
                $pdo->prepare("DELETE FROM user_notifications_preferences WHERE user_id = :user_id")->execute(['user_id' => $user_id]);
            } catch(PDOException $e) {
                error_log('[handleDeleteUser] Could not delete notification preferences: ' . $e->getMessage());
            }
            
            // Mettre à jour les logs d'audit pour mettre user_id à NULL (garder l'historique)
            try {
                $pdo->prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = :user_id")->execute(['user_id' => $user_id]);
            } catch(PDOException $e) {
                error_log('[handleDeleteUser] Could not update audit logs: ' . $e->getMessage());
            }
            
            // Soft delete
            $pdo->prepare("UPDATE users SET deleted_at = NOW() WHERE id = :id")->execute(['id' => $user_id]);
            
            auditLog('user.deleted', 'user', $user_id, $userToDelete, null);
            $message = 'Utilisateur archivé avec succès';
            $permanent = false;
        }
        
        echo json_encode([
            'success' => true, 
            'message' => $message,
            'permanent' => $permanent
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur de base de données';
        error_log('[handleDeleteUser] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleRestoreUser($user_id) {
    global $pdo;
    requirePermission('users.manage');

    try {
        // Vérifier que l'utilisateur existe et est archivé
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
        $stmt->execute(['id' => $user_id]);
        $user = $stmt->fetch();

        if (!$user) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Utilisateur introuvable']);
            return;
        }

        if (!$user['deleted_at']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'L\'utilisateur n\'est pas archivé']);
            return;
        }

        // Restaurer l'utilisateur (soft delete = NULL)
        $stmt = $pdo->prepare("UPDATE users SET deleted_at = NULL WHERE id = :id");
        $stmt->execute(['id' => $user_id]);

        auditLog('user.restored', 'user', $user_id, $user, ['deleted_at' => null]);

        echo json_encode([
            'success' => true,
            'message' => 'Utilisateur restauré avec succès'
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleRestoreUser] ' . $e->getMessage());
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

