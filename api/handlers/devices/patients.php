<?php
/**
 * API Handlers - Devices Patients
 * Gestion des patients associés aux dispositifs
 */

require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/../../helpers/entity_responses.php';

/**
 * GET /api.php/patients
 * Liste les patients avec pagination
 */
function handleGetPatients() {
    global $pdo;
    
    $includeDeleted = isset($_GET['include_deleted']) && $_GET['include_deleted'] === 'true';
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    
    try {
        // Nettoyer le buffer de sortie AVANT tout header
        if (ob_get_level() > 0) {
            ob_clean();
        }
        
        // Définir le Content-Type JSON AVANT tout autre output
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        // Définir la clause WHERE
        $whereClause = $includeDeleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
        
        $hasNotificationsTable = false;
        try {
            $hasNotificationsTable = tableExists('patient_notifications_preferences');
            
            // Vérifier et ajouter la colonne notify_alert_critical si elle n'existe pas
            if ($hasNotificationsTable) {
                try {
                    // SÉCURITÉ: Utiliser prepared statement même pour information_schema
                    $checkColumn = $pdo->prepare("
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = :table_name 
                        AND column_name = :column_name
                    ");
                    $checkColumn->execute([
                        ':table_name' => 'patient_notifications_preferences',
                        ':column_name' => 'notify_alert_critical'
                    ]);
                    if ($checkColumn->rowCount() === 0) {
                        // SÉCURITÉ: Utiliser prepared statement pour ALTER TABLE (nom de colonne fixe, pas de variable utilisateur)
                        // Note: ALTER TABLE ne supporte pas les placeholders pour les noms de colonnes, mais ici c'est un nom fixe
                        $pdo->exec("
                            ALTER TABLE patient_notifications_preferences 
                            ADD COLUMN IF NOT EXISTS notify_alert_critical BOOLEAN DEFAULT FALSE
                        ");
                        error_log('[handleGetPatients] ✅ Colonne notify_alert_critical ajoutée');
                    }
                } catch (PDOException $e) {
                    error_log('[handleGetPatients] ⚠️ Erreur ajout colonne notify_alert_critical: ' . $e->getMessage());
                }
            }
        } catch (Exception $e) {
            error_log('[handleGetPatients] ⚠️ Erreur vérification table notifications: ' . $e->getMessage());
        }
        
        // SÉCURITÉ: Utiliser des requêtes préparées avec paramètres
        $deletedCondition = $includeDeleted ? "IS NOT NULL" : "IS NULL";
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM patients WHERE deleted_at $deletedCondition");
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
        if ($hasNotificationsTable) {
            $stmt = $pdo->prepare("
                WITH device_stats AS (
                    SELECT 
                        patient_id,
                        COUNT(*) as device_count,
                        COUNT(CASE WHEN m.timestamp >= NOW() - INTERVAL '7 DAYS' THEN 1 END) as measurements_7d
                    FROM devices d
                    LEFT JOIN measurements m ON d.id = m.device_id
                    GROUP BY patient_id
                ),
                latest_devices AS (
                    SELECT DISTINCT ON (patient_id)
                        patient_id,
                        id AS device_id,
                        device_name,
                        sim_iccid,
                        last_seen
                    FROM devices
                    WHERE patient_id IS NOT NULL
                    ORDER BY patient_id, updated_at DESC NULLS LAST
                )
                SELECT 
                    p.*,
                    COALESCE(ds.device_count, 0) as device_count,
                    COALESCE(ds.measurements_7d, 0) as measurements_7d,
                    ld.device_id,
                    ld.device_name,
                    ld.sim_iccid,
                    ld.last_seen AS device_last_seen,
                    COALESCE(pnp.email_enabled, FALSE) as email_enabled,
                    COALESCE(pnp.sms_enabled, FALSE) as sms_enabled,
                    COALESCE(pnp.push_enabled, FALSE) as push_enabled,
                    COALESCE(pnp.notify_battery_low, FALSE) as notify_battery_low,
                    COALESCE(pnp.notify_device_offline, FALSE) as notify_device_offline,
                    COALESCE(pnp.notify_abnormal_flow, FALSE) as notify_abnormal_flow,
                    COALESCE(pnp.notify_alert_critical, FALSE) as notify_alert_critical
                FROM patients p
                LEFT JOIN patient_notifications_preferences pnp ON p.id = pnp.patient_id
                LEFT JOIN device_stats ds ON p.id = ds.patient_id
                LEFT JOIN latest_devices ld ON p.id = ld.patient_id
                WHERE p.$whereClause
                ORDER BY " . ($includeDeleted ? "p.deleted_at DESC" : "p.last_name, p.first_name") . "
                LIMIT :limit OFFSET :offset
            ");
        } else {
            $stmt = $pdo->prepare("
                WITH device_stats AS (
                    SELECT 
                        patient_id,
                        COUNT(*) as device_count,
                        COUNT(CASE WHEN m.timestamp >= NOW() - INTERVAL '7 DAYS' THEN 1 END) as measurements_7d
                    FROM devices d
                    LEFT JOIN measurements m ON d.id = m.device_id
                    GROUP BY patient_id
                ),
                latest_devices AS (
                    SELECT DISTINCT ON (patient_id)
                        patient_id,
                        id AS device_id,
                        device_name,
                        sim_iccid,
                        last_seen
                    FROM devices
                    WHERE patient_id IS NOT NULL
                    ORDER BY patient_id, updated_at DESC NULLS LAST
                )
                SELECT 
                    p.*,
                    COALESCE(ds.device_count, 0) as device_count,
                    COALESCE(ds.measurements_7d, 0) as measurements_7d,
                    ld.device_id,
                    ld.device_name,
                    ld.sim_iccid,
                    ld.last_seen AS device_last_seen,
                    FALSE as email_enabled,
                    FALSE as sms_enabled,
                    FALSE as push_enabled,
                    FALSE as notify_battery_low,
                    FALSE as notify_device_offline,
                    FALSE as notify_abnormal_flow,
                    FALSE as notify_alert_critical
                FROM patients p
                LEFT JOIN device_stats ds ON p.id = ds.patient_id
                LEFT JOIN latest_devices ld ON p.id = ld.patient_id
                WHERE p.$whereClause
                ORDER BY " . ($includeDeleted ? "p.deleted_at DESC" : "p.last_name, p.first_name") . "
                LIMIT :limit OFFSET :offset
            ");
        }
        
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $patients = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendSuccessResponse('patients', 'retrieved', [
            'patients' => $patients,
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'has_more' => ($offset + $limit) < $total
            ]
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetPatients] Database error: ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}

/**
 * GET /api.php/patients/:id
 * Récupérer un patient par ID
 */
function handleGetPatient($patient_id) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("
            SELECT p.*, 
                   COUNT(DISTINCT d.id) as device_count
            FROM patients p
            LEFT JOIN devices d ON d.patient_id = p.id AND d.deleted_at IS NULL
            WHERE p.id = ? AND p.deleted_at IS NULL
            GROUP BY p.id
        ");
        $stmt->execute([$patient_id]);
        $patient = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$patient) {
            sendErrorResponse('patients', 'not_found', [], 404);
            return;
        }
        
        sendSuccessResponse('patients', 'retrieved', ['patient' => $patient]);
    } catch(PDOException $e) {
        http_response_code(500);
        error_log('[handleGetPatient] ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}

/**
 * PATCH /api.php/patients/:id/archive
 * Archiver un patient (soft delete)
 */
function handleArchivePatient($patient_id) {
    global $pdo;
    requirePermission('patients.edit');
    
    try {
        $stmt = $pdo->prepare("UPDATE patients SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL");
        $stmt->execute([$patient_id]);
        
        if ($stmt->rowCount() === 0) {
            sendErrorResponse('patients', 'not_found', [], 404);
            return;
        }
        
        sendSuccessResponse('patients', 'archived');
    } catch(PDOException $e) {
        http_response_code(500);
        error_log('[handleArchivePatient] ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}

/**
 * POST /api.php/patients
 * Créer un patient
 */
function handleCreatePatient() {
    global $pdo;
    requirePermission('patients.edit');

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $first_name = trim($input['first_name'] ?? '');
    $last_name = trim($input['last_name'] ?? '');
    if (empty($first_name) || empty($last_name)) {
        http_response_code(422);
        sendErrorResponse('patients', 'validation_error', [], 422);
        return;
    }

    try {
        // DEBUG: Logger les valeurs reçues
        error_log('[handleCreatePatient] Input reçu: ' . json_encode($input));
        $dateOfBirth = $input['birth_date'] ?? $input['date_of_birth'] ?? null;
        error_log('[handleCreatePatient] date_of_birth mappé: ' . ($dateOfBirth ?? 'NULL'));
        
        $stmt = $pdo->prepare("
            INSERT INTO patients (first_name, last_name, date_of_birth, phone, email, city, postal_code, status)
            VALUES (:first_name, :last_name, :date_of_birth, :phone, :email, :city, :postal_code, :status)
            RETURNING *
        ");
        $params = [
            'first_name' => $first_name,
            'last_name' => $last_name,
            'date_of_birth' => $dateOfBirth,
            'phone' => $input['phone'] ?? null,
            'email' => $input['email'] ?? null,
            'city' => $input['city'] ?? null,
            'postal_code' => $input['postal_code'] ?? null,
            'status' => $input['status'] ?? 'active'
        ];
        error_log('[handleCreatePatient] Paramètres SQL: ' . json_encode($params));
        $stmt->execute($params);
        $patient = $stmt->fetch();
        
        try {
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
        }
        
        auditLog('patient.created', 'patient', $patient['id'], null, $patient);
        sendSuccessResponse('patients', 'created', ['patient' => $patient]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleCreatePatient] Database error: ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}

/**
 * PUT /api.php/patients/:id
 * Mettre à jour un patient
 */
function handleUpdatePatient($patient_id) {
    global $pdo;
    requirePermission('patients.edit');

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    try {
        $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);
        $patient = $stmt->fetch();

        if (!$patient) {
            sendErrorResponse('patients', 'not_found', [], 404);
            return;
        }

        $textFields = ['first_name','last_name','date_of_birth','phone','email','city','postal_code','address','notes','status'];
        $updates = [];
        $params = ['id' => $patient_id];

        foreach ($textFields as $field) {
            // Gérer le mapping birth_date -> date_of_birth pour compatibilité frontend
            $inputKey = ($field === 'date_of_birth' && array_key_exists('birth_date', $input)) ? 'birth_date' : $field;
            
            if (array_key_exists($inputKey, $input) || array_key_exists($field, $input)) {
                $updates[] = "$field = :$field";
                $value = $input[$inputKey] ?? $input[$field] ?? null;
                $params[$field] = ($value === '' || $value === null) ? null : $value;
            }
        }

        if (empty($updates)) {
            sendSuccessResponse('patients', 'updated', ['patient' => $patient]);
            return;
        }

        $pdo->prepare("
            UPDATE patients SET " . implode(', ', $updates) . ", updated_at = NOW()
            WHERE id = :id
        ")->execute($params);

        $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);
        $updated = $stmt->fetch();
        auditLog('patient.updated', 'patient', $patient_id, $patient, $updated);
        sendSuccessResponse('patients', 'updated', ['patient' => $updated]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleUpdatePatient] Database error: ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}

/**
 * DELETE /api.php/patients/:id
 * Archiver ou supprimer définitivement un patient
 */
function handleDeletePatient($patient_id) {
    global $pdo;
    requirePermission('patients.edit');
    
    $user = getCurrentUser();
    $isAdmin = $user && $user['role_name'] === 'admin';
    $forcePermanent = isset($_GET['permanent']) && $_GET['permanent'] === 'true';

    try {
        // SÉCURITÉ: Utiliser des paramètres nommés au lieu de concaténation SQL
        // Pour la suppression définitive, on peut supprimer même si déjà archivé
        // Pour l'archivage normal, on ne peut archiver que si pas déjà archivé
        if ($forcePermanent && $isAdmin) {
            // Suppression définitive : peut supprimer même si archivé
            $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        } else {
            // Archivage : seulement si pas déjà archivé
            $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id AND deleted_at IS NULL");
        }
        $stmt->execute(['id' => $patient_id]);
        $patient = $stmt->fetch();

        if (!$patient) {
            http_response_code(404);
            sendErrorResponse('patients', 'not_found', [], 404);
            return;
        }

        $deviceStmt = $pdo->prepare("SELECT id, sim_iccid, device_name FROM devices WHERE patient_id = :patient_id AND deleted_at IS NULL");
        $deviceStmt->execute(['patient_id' => $patient_id]);
        $assignedDevices = $deviceStmt->fetchAll();

        $wasAssigned = false;
        if (count($assignedDevices) > 0) {
            // 1. Désassigner tous les dispositifs
            $pdo->prepare("UPDATE devices SET patient_id = NULL WHERE patient_id = :patient_id")
                ->execute(['patient_id' => $patient_id]);
            $wasAssigned = true;
            
            // 2. Réinitialiser la configuration de tous les dispositifs désassignés (optimisé : une seule requête au lieu de N)
            $hasGpsColumn = columnExists('device_configurations', 'gps_enabled');
            $resetFields = ['sleep_minutes = NULL', 'measurement_duration_ms = NULL', 'send_every_n_wakeups = NULL', 'calibration_coefficients = NULL'];
            if ($hasGpsColumn) {
                $resetFields[] = 'gps_enabled = false';
            }
            
            // Optimisation N+1 : utiliser une seule requête UPDATE avec WHERE IN au lieu d'une boucle
            if (!empty($assignedDevices)) {
                $deviceIds = array_column($assignedDevices, 'id');
                $placeholders = implode(',', array_fill(0, count($deviceIds), '?'));
                
                try {
                    $pdo->prepare("
                        UPDATE device_configurations 
                        SET " . implode(', ', $resetFields) . "
                        WHERE device_id IN ($placeholders)
                    ")->execute($deviceIds);
                    
                    error_log("[handleDeletePatient] Configuration réinitialisée pour " . count($deviceIds) . " dispositif(s) après désassignation automatique");
                } catch(PDOException $e) {
                    // Ne pas bloquer l'archivage si la réinitialisation de la config échoue
                    error_log("[handleDeletePatient] ⚠️ Erreur réinitialisation config (non bloquant): " . $e->getMessage());
                }
                
                // Audit log pour chaque dispositif (nécessaire pour l'historique)
                foreach ($assignedDevices as $device) {
                    auditLog('device.unassigned_before_patient_delete', 'device', $device['id'], ['old_patient_id' => $patient_id], null);
                }
            }
        }

        if ($forcePermanent && $isAdmin) {
            try {
                $pdo->prepare("DELETE FROM patient_notifications_preferences WHERE patient_id = :patient_id")->execute(['patient_id' => $patient_id]);
            } catch(PDOException $e) {
                error_log('[handleDeletePatient] Could not delete notification preferences: ' . $e->getMessage());
            }

            $pdo->prepare("DELETE FROM patients WHERE id = :id")->execute(['id' => $patient_id]);

            auditLog('patient.permanently_deleted', 'patient', $patient_id, $patient, null);
        } else {
            try {
                $pdo->prepare("DELETE FROM patient_notifications_preferences WHERE patient_id = :patient_id")->execute(['patient_id' => $patient_id]);
            } catch(PDOException $e) {
                error_log('[handleDeletePatient] Could not delete notification preferences: ' . $e->getMessage());
            }

            $pdo->prepare("UPDATE patients SET deleted_at = NOW() WHERE id = :id")->execute(['id' => $patient_id]);

            auditLog('patient.deleted', 'patient', $patient_id, $patient, null);
        }

        $action = $permanent ? 'permanent_deleted' : 'archived';
        $context = ['devices_unassigned' => $wasAssigned ? count($assignedDevices) : 0];
        
        sendSuccessResponse('patients', $action, [
            'devices_unassigned' => $wasAssigned ? count($assignedDevices) : 0,
            'permanent' => $permanent
        ], $context);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeletePatient] ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}

/**
 * PATCH /api.php/patients/:id
 * Restaurer un patient archivé
 */
function handleRestorePatient($patient_id) {
    global $pdo;
    requirePermission('patients.edit');

    try {
        $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);
        $patient = $stmt->fetch();

        if (!$patient) {
            http_response_code(404);
            sendErrorResponse('patients', 'not_found', [], 404);
            return;
        }

        if (!$patient['deleted_at']) {
            http_response_code(400);
            sendErrorResponse('patients', 'not_archived', [], 400);
            return;
        }

        $stmt = $pdo->prepare("UPDATE patients SET deleted_at = NULL WHERE id = :id");
        $stmt->execute(['id' => $patient_id]);

        auditLog('patient.restored', 'patient', $patient_id, $patient, ['deleted_at' => null]);

        sendSuccessResponse('patients', 'restored');
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleRestorePatient] ' . $e->getMessage());
        sendErrorResponse('patients', 'database_error', [], 500);
    }
}
