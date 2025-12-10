<?php
/**
 * API Handlers - Notifications
 * Extracted from api.php during refactoring
 */

function handleGetNotificationPreferences() {
    global $pdo;
    $user = requireAuth();
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user['id']]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            // Créer avec valeurs par défaut (toutes désactivées)
            $insertStmt = $pdo->prepare("
                INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled) 
                VALUES (:user_id, FALSE, FALSE, FALSE)
            ");
            $insertStmt->execute(['user_id' => $user['id']]);
            
            // Réexécuter le SELECT pour récupérer les préférences créées
            $stmt->execute(['user_id' => $user['id']]);
            $prefs = $stmt->fetch();
        }
        
        ob_end_clean();
        echo json_encode(['success' => true, 'preferences' => $prefs]);
    } catch(PDOException $e) {
        ob_end_clean();
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
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 50;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    try {
        // Compter le total
        $countStmt = $pdo->query("SELECT COUNT(*) FROM notifications_queue");
        $total = intval($countStmt->fetchColumn());
        
        $stmt = $pdo->prepare("
            SELECT nq.*, u.email, u.first_name, u.last_name, p.first_name as patient_first_name, p.last_name as patient_last_name
            FROM notifications_queue nq
            LEFT JOIN users u ON nq.user_id = u.id AND u.deleted_at IS NULL
            LEFT JOIN patients p ON nq.patient_id = p.id AND p.deleted_at IS NULL
            ORDER BY nq.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $totalPages = ceil($total / $limit);
        echo json_encode([
            'success' => true, 
            'queue' => $stmt->fetchAll(),
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'page' => $page,
                'total_pages' => $totalPages,
                'has_next' => ($offset + $limit) < $total,
                'has_prev' => $offset > 0
            ]
        ]);
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
            // Utiliser prepare() au lieu de query() pour la sécurité
            // Note: Cette requête est statique (pas de paramètres utilisateur), mais on utilise prepare() par précaution
            $checkStmt = $pdo->prepare("
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
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    $user_id = isset($_GET['user_id']) ? intval($_GET['user_id']) : null;
    $action = isset($_GET['action']) ? $_GET['action'] : null;
    
    try {
        // Compter le total
        $countSql = "
            SELECT COUNT(*)
            FROM audit_logs al
            WHERE 1=1
        ";
        $countParams = [];
        if ($user_id) {
            $countSql .= " AND al.user_id = :user_id";
            $countParams['user_id'] = $user_id;
        }
        if ($action) {
            $countSql .= " AND al.action LIKE :action";
            $countParams['action'] = '%' . $action . '%';
        }
        $countStmt = $pdo->prepare($countSql);
        foreach ($countParams as $key => $value) {
            $countStmt->bindValue(':' . $key, $value);
        }
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
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
        
        $sql .= " ORDER BY al.created_at DESC LIMIT :limit OFFSET :offset";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $totalPages = ceil($total / $limit);
        echo json_encode([
            'success' => true, 
            'logs' => $stmt->fetchAll(),
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'page' => $page,
                'total_pages' => $totalPages,
                'has_next' => ($offset + $limit) < $total,
                'has_prev' => $offset > 0
            ]
        ]);
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
                    WHEN 'low' THEN 4 
                    ELSE 5 
                END,
                nq.created_at ASC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        $notifications = $stmt->fetchAll();
        $processed = 0;
        $sent = 0;
        $failed = 0;
        
        foreach ($notifications as $notification) {
            $processed++;
            
            try {
                $success = false;
                
                if ($notification['type'] === 'email') {
                    $email = $notification['user_email'] ?? $notification['patient_email'];
                    if ($email) {
                        $success = sendEmail($email, $notification['subject'], $notification['message']);
                    }
                } elseif ($notification['type'] === 'sms') {
                    $phone = $notification['user_phone'] ?? $notification['patient_phone'];
                    if ($phone) {
                        $success = sendSMS($phone, $notification['message']);
                    }
                }
                
                if ($success) {
                    $sent++;
                    $pdo->prepare("
                        UPDATE notifications_queue 
                        SET status = 'sent', sent_at = NOW(), attempts = attempts + 1
                        WHERE id = :id
                    ")->execute(['id' => $notification['id']]);
                } else {
                    $failed++;
                    $attempts = $notification['attempts'] + 1;
                    $status = ($attempts >= $notification['max_attempts']) ? 'failed' : 'pending';
                    $pdo->prepare("
                        UPDATE notifications_queue 
                        SET status = :status, attempts = :attempts, error_message = :error
                        WHERE id = :id
                    ")->execute([
                        'status' => $status,
                        'attempts' => $attempts,
                        'error' => 'Échec envoi ' . $notification['type'],
                        'id' => $notification['id']
                    ]);
                }
            } catch(Exception $e) {
                $failed++;
                error_log("Erreur processNotificationsQueue: " . $e->getMessage());
                $pdo->prepare("
                    UPDATE notifications_queue 
                    SET attempts = attempts + 1, error_message = :error
                    WHERE id = :id
                ")->execute([
                    'error' => $e->getMessage(),
                    'id' => $notification['id']
                ]);
            }
        }
        
        return [
            'processed' => $processed,
            'sent' => $sent,
            'failed' => $failed
        ];
    } catch(PDOException $e) {
        error_log("Erreur processNotificationsQueue: " . $e->getMessage());
        return [
            'processed' => 0,
            'sent' => 0,
            'failed' => 0,
            'error' => $e->getMessage()
        ];
    }
}
