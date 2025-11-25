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
    if (isset($input['latitude']) && isset($input['longitude'])) {
        $latitude = floatval($input['latitude']);
        $longitude = floatval($input['longitude']);
    }
    
    // Pour dispositifs USB (pas d'ICCID), obtenir position depuis IP
    if (empty($iccid) || $iccid === 'USB' || $iccid === 'TEMP-USB') {
        $clientIp = getClientIp();
        if ($clientIp) {
            $location = getLocationFromIp($clientIp);
            if ($location) {
                $latitude = $location['latitude'];
                $longitude = $location['longitude'];
            }
        }
    }
    
    try {
        // Trouver ou créer le dispositif
        $device = null;
        if (!empty($iccid) && $iccid !== 'USB' && $iccid !== 'TEMP-USB') {
            $deviceStmt = $pdo->prepare("SELECT * FROM devices WHERE sim_iccid = :iccid AND deleted_at IS NULL");
            $deviceStmt->execute(['iccid' => $iccid]);
            $device = $deviceStmt->fetch();
        }
        
        // Si pas de dispositif trouvé, créer un dispositif temporaire (pour USB)
        if (!$device && (empty($iccid) || $iccid === 'USB' || $iccid === 'TEMP-USB')) {
            $tempIccid = 'TEMP-USB-' . uniqid();
            $insertStmt = $pdo->prepare("
                INSERT INTO devices (sim_iccid, device_name, status, latitude, longitude)
                VALUES (:sim_iccid, :device_name, 'active', :latitude, :longitude)
                RETURNING *
            ");
            $insertStmt->execute([
                'sim_iccid' => $tempIccid,
                'device_name' => 'USB Device ' . date('Y-m-d H:i:s'),
                'latitude' => $latitude,
                'longitude' => $longitude
            ]);
            $device = $insertStmt->fetch();
        }
        
        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Device not found']);
            return;
        }
        
        // Insérer la mesure
        $measureStmt = $pdo->prepare("
            INSERT INTO measurements (device_id, flowrate, battery, rssi, firmware_version, timestamp, status, latitude, longitude)
            VALUES (:device_id, :flowrate, :battery, :rssi, :firmware_version, COALESCE(:timestamp, NOW()), :status, :latitude, :longitude)
            RETURNING *
        ");
        $measureStmt->execute([
            'device_id' => $device['id'],
            'flowrate' => floatval($flowrate),
            'battery' => intval($battery),
            'rssi' => $rssi !== null ? intval($rssi) : null,
            'firmware_version' => $firmware_version,
            'timestamp' => $timestamp,
            'status' => $status,
            'latitude' => $latitude,
            'longitude' => $longitude
        ]);
        $measurement = $measureStmt->fetch();
        
        // Mettre à jour last_seen et last_battery du dispositif
        $updateStmt = $pdo->prepare("
            UPDATE devices 
            SET last_seen = NOW(), 
                last_battery = :battery,
                latitude = COALESCE(:latitude, latitude),
                longitude = COALESCE(:longitude, longitude)
            WHERE id = :device_id
        ");
        $updateStmt->execute([
            'device_id' => $device['id'],
            'battery' => intval($battery),
            'latitude' => $latitude,
            'longitude' => $longitude
        ]);
        
        auditLog('measurement.created', 'measurement', $device['id'], null, $measurement);
        echo json_encode(['success' => true, 'measurement' => $measurement]);
        
    } catch(PDOException $e) {
        error_log('[handlePostMeasurement] Database error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}
