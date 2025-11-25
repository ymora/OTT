<?php
/**
 * API Handlers - Authentication & Users
 * Extracted from api.php during refactoring
 */

// ============================================================================
// HANDLERS - AUTHENTICATION
// ============================================================================

function handleLogin() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';
    
    if (empty($email) || empty($password)) {
        ob_end_clean();
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
            ob_end_clean();
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
        
        ob_end_clean();
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

