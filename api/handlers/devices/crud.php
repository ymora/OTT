<?php
/**
 * API Handlers - Devices CRUD
 * Gestion CRUD de base des dispositifs
 */

require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/../device_serial_generator.php';

/**
 * GET /api.php/devices
 * Liste les dispositifs avec pagination et cache
 */
function handleGetDevices() {
    global $pdo;
    
    // Nettoyer le buffer de sortie AVANT tout header
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    // Définir le Content-Type JSON AVANT tout autre output
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    
    // Permettre accès sans auth pour dispositifs IoT (rétrocompatibilité)
    // OU avec auth JWT pour dashboard
    try {
        $user = getCurrentUser();
    } catch (Exception $e) {
        // Si getCurrentUser() échoue, continuer sans user (rétrocompatibilité)
        $user = null;
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleGetDevices] ⚠️ getCurrentUser() failed: ' . $e->getMessage());
        }
    }
    
    // Paramètre pour inclure les devices archivés (soft-deleted)
    $includeDeleted = isset($_GET['include_deleted']) && $_GET['include_deleted'] === 'true';
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    // Cache: générer une clé basée sur les paramètres
    $cacheKey = SimpleCache::key('devices', [
        'limit' => $limit,
        'offset' => $offset,
        'include_deleted' => $includeDeleted,
        'user_id' => $user ? $user['id'] : null
    ]);
    
    // Essayer de récupérer depuis le cache
    $cached = SimpleCache::get($cacheKey);
    if ($cached !== null) {
        echo json_encode($cached);
        return;
    }
    
    try {
        // Condition WHERE selon le paramètre include_deleted
        $whereClause = $includeDeleted ? "d.deleted_at IS NOT NULL" : "d.deleted_at IS NULL";
        
        // Compter le total
        $countStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM devices d
            WHERE $whereClause
        ");
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
        // Requête simplifiée et robuste - éviter duplication firmware_version
        // Ajouter le nombre de mesures par dispositif
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
                d.last_flowrate,
                d.last_rssi,
                d.latitude,
                d.longitude,
                d.created_at,
                d.updated_at,
                d.deleted_at,
                p.first_name, 
                p.last_name,
                COALESCE(d.firmware_version, dc.firmware_version) as firmware_version,
                COALESCE(dc.ota_pending, FALSE) as ota_pending,
                COALESCE(dc.gps_enabled, FALSE) as gps_enabled,
                (SELECT COUNT(*) FROM measurements m WHERE m.device_id = d.id) as measurement_count
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            LEFT JOIN device_configurations dc ON d.id = dc.device_id
            WHERE $whereClause
            ORDER BY " . ($includeDeleted ? "d.deleted_at DESC" : "d.last_seen DESC NULLS LAST, d.created_at DESC") . "
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $devices = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $totalPages = ceil($total / $limit);
        
        $response = [
            'success' => true, 
            'devices' => $devices,
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'page' => $page,
                'total_pages' => $totalPages,
                'has_next' => $offset + $limit < $total,
                'has_prev' => $offset > 0
            ]
        ];
        
        // Mettre en cache (TTL: 30 secondes pour les listes)
        SimpleCache::set($cacheKey, $response, 30);
        
        echo json_encode($response);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetDevices] ❌ Erreur DB: ' . $e->getMessage());
        error_log('[handleGetDevices] Stack trace: ' . $e->getTraceAsString());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Internal server error';
        error_log('[handleGetDevices] ❌ Erreur inattendue: ' . $e->getMessage());
        error_log('[handleGetDevices] Stack trace: ' . $e->getTraceAsString());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

/**
 * POST /api.php/devices (ou POST /api.php/devices/register)
 * Créer ou restaurer un dispositif (UPSERT automatique)
 * Si l'ICCID existe déjà (même supprimé) : restaure et met à jour
 * Si l'ICCID n'existe pas : crée
 */
function handleRestoreOrCreateDevice() {
    global $pdo;
    requirePermission('devices.edit');
    
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $sim_iccid = trim($input['sim_iccid'] ?? '');
    
    if (empty($sim_iccid)) {
        handleCreateDevice();
        return;
    }
    
    try {
        // Générer automatiquement le numéro de série OTT si non fourni ou temporaire
        $device_serial_input = $input['device_serial'] ?? null;
        $needsSerialUpdate = false;
        $finalDeviceSerial = null;
        
        if (empty($device_serial_input) || isTemporarySerial($device_serial_input)) {
            $finalDeviceSerial = generateNextOttSerial($pdo);
            $needsSerialUpdate = true;
        } else {
            $finalDeviceSerial = $device_serial_input;
        }
        
        // Générer device_name : par défaut identique au serial
        $device_name_input = $input['device_name'] ?? null;
        $finalDeviceName = $device_name_input ?: $finalDeviceSerial;
        
        // UPSERT PostgreSQL : essayer d'insérer, sinon mettre à jour
        // Note: device_serial conservé SAUF si ancien format (ex: OTT-PIERRE-001)
        $stmt = $pdo->prepare("
            INSERT INTO devices (
                sim_iccid, device_serial, device_name, patient_id, 
                status, firmware_version, installation_date, first_use_date, last_seen
            ) VALUES (
                :sim_iccid, :device_serial, :device_name, :patient_id,
                :status, :firmware_version, :installation_date, :first_use_date, :last_seen
            )
            ON CONFLICT (sim_iccid) DO UPDATE SET
                device_name = COALESCE(EXCLUDED.device_name, devices.device_name),
                device_serial = CASE 
                    WHEN devices.device_serial ~ '^OTT-[0-9]{2}-[0-9]{3}$' THEN devices.device_serial
                    ELSE EXCLUDED.device_serial
                END,
                firmware_version = COALESCE(EXCLUDED.firmware_version, devices.firmware_version),
                status = EXCLUDED.status,
                last_seen = EXCLUDED.last_seen,
                deleted_at = NULL,
                updated_at = NOW()
            RETURNING *, (xmax = 0) AS was_insert
        ");
        
        $stmt->execute([
            'sim_iccid' => $sim_iccid,
            'device_serial' => $finalDeviceSerial,
            'device_name' => $finalDeviceName,
            'patient_id' => $input['patient_id'] ?? null,
            'status' => $input['status'] ?? 'active',
            'firmware_version' => $input['firmware_version'] ?? null,
            'installation_date' => $input['installation_date'] ?? null,
            'first_use_date' => $input['first_use_date'] ?? null,
            'last_seen' => $input['last_seen'] ?? date('Y-m-d H:i:s')
        ]);
        
        $device = $stmt->fetch(PDO::FETCH_ASSOC);
        $wasInsert = $device['was_insert'];
        unset($device['was_insert']);
        
        // Créer la configuration si c'est une insertion
        if ($wasInsert) {
            $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id)")
                ->execute(['device_id' => $device['id']]);
        }
        
        // Si le serial était temporaire, créer une commande UPDATE_CONFIG pour mettre à jour le firmware
        if ($needsSerialUpdate && $wasInsert) {
            $updateConfigPayload = json_encode([
                'serial' => $finalDeviceSerial,
                'iccid' => $sim_iccid
            ]);
            
            $cmdStmt = $pdo->prepare("
                INSERT INTO device_commands (device_id, command, payload, status, created_at)
                VALUES (:device_id, 'UPDATE_CONFIG', :payload::jsonb, 'pending', NOW())
            ");
            $cmdStmt->execute([
                'device_id' => $device['id'],
                'payload' => $updateConfigPayload
            ]);
            
            error_log("[Device Registration] Serial temporaire détecté, commande UPDATE_CONFIG créée pour dispositif {$device['id']} → {$finalDeviceSerial}");
        }
        
        auditLog($wasInsert ? 'device.created' : 'device.restored', 'device', $device['id'], null, $device);
        
        // Invalider le cache des devices
        SimpleCache::clear();
        
        http_response_code($wasInsert ? 201 : 200);
        echo json_encode([
            'success' => true,
            'message' => $wasInsert ? 'Dispositif créé avec succès' : 'Dispositif restauré avec succès',
            'device' => $device,
            'was_created' => $wasInsert,
            'was_restored' => !$wasInsert,
            'serial_updated' => $needsSerialUpdate
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
    }
}

/**
 * POST /api.php/devices (création simple)
 */
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
            INSERT INTO devices (sim_iccid, device_serial, device_name, patient_id, status, firmware_version, installation_date, first_use_date)
            VALUES (:sim_iccid, :device_serial, :device_name, :patient_id, :status, :firmware_version, :installation_date, :first_use_date)
            RETURNING *
        ");
        $stmt->execute([
            'sim_iccid' => $sim_iccid,
            'device_serial' => $device_serial ?: null,
            'device_name' => $device_name ?: null,
            'patient_id' => $patientParam,
            'status' => $input['status'] ?? 'inactive',
            'firmware_version' => $input['firmware_version'] ?? null,
            'installation_date' => $input['installation_date'] ?? null,
            'first_use_date' => $input['first_use_date'] ?? null,
        ]);
        $device = $stmt->fetch();

        $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id)")
            ->execute(['device_id' => $device['id']]);

        auditLog('device.created', 'device', $device['id'], null, $device);
        
        // Invalider le cache des devices après création
        SimpleCache::clear();
        
        echo json_encode(['success' => true, 'device' => $device]);
    } catch(PDOException $e) {
        if ($e->getCode() === '23505') {
            http_response_code(409);
            error_log('[handleCreateDevice] ⚠️ Conflit ICCID: ' . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'SIM ICCID déjà utilisé']);
        } else {
            http_response_code(500);
            $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
            error_log('[handleCreateDevice] ❌ Erreur DB: ' . $e->getMessage());
            error_log('[handleCreateDevice] Code erreur: ' . $e->getCode());
            error_log('[handleCreateDevice] Stack trace: ' . $e->getTraceAsString());
            echo json_encode(['success' => false, 'error' => $errorMsg]);
        }
    }
}

/**
 * POST /api.php/devices/test
 * Créer des dispositifs de test
 */
function handleCreateTestDevices() {
    global $pdo;
    requirePermission('devices.edit');
    
    try {
        $testDevices = [
            [
                'sim_iccid' => 'TEST-ICCID-001',
                'device_serial' => 'TEST-SERIAL-001',
                'device_name' => 'Dispositif Test 1',
                'firmware_version' => 'v3.0-rebuild',
                'status' => 'active'
            ],
            [
                'sim_iccid' => 'TEST-ICCID-002',
                'device_serial' => 'TEST-SERIAL-002',
                'device_name' => 'Dispositif Test 2',
                'firmware_version' => 'v3.0-rebuild',
                'status' => 'active'
            ]
        ];
        
        $created = [];
        $errors = [];
        
        foreach ($testDevices as $testDevice) {
            try {
                $checkStmt = $pdo->prepare("SELECT id FROM devices WHERE sim_iccid = :sim_iccid AND deleted_at IS NULL");
                $checkStmt->execute(['sim_iccid' => $testDevice['sim_iccid']]);
                if ($checkStmt->fetch()) {
                    $errors[] = "Dispositif {$testDevice['sim_iccid']} existe déjà";
                    continue;
                }
                
                $stmt = $pdo->prepare("
                    INSERT INTO devices (sim_iccid, device_serial, device_name, firmware_version, status, patient_id, installation_date, first_use_date)
                    VALUES (:sim_iccid, :device_serial, :device_name, :firmware_version, :status, NULL, NULL, NULL)
                    RETURNING *
                ");
                $stmt->execute([
                    'sim_iccid' => $testDevice['sim_iccid'],
                    'device_serial' => $testDevice['device_serial'],
                    'device_name' => $testDevice['device_name'],
                    'firmware_version' => $testDevice['firmware_version'],
                    'status' => $testDevice['status']
                ]);
                $device = $stmt->fetch();
                
                $pdo->prepare("INSERT INTO device_configurations (device_id) VALUES (:device_id) ON CONFLICT (device_id) DO NOTHING")
                    ->execute(['device_id' => $device['id']]);
                
                auditLog('device.created', 'device', $device['id'], null, $device);
                $created[] = $device;
            } catch(PDOException $e) {
                if ($e->getCode() === '23505') {
                    $errors[] = "Dispositif {$testDevice['sim_iccid']} existe déjà (contrainte unique)";
                } else {
                    $errors[] = "Erreur création {$testDevice['sim_iccid']}: " . $e->getMessage();
                }
            }
        }
        
        if (count($created) > 0) {
            echo json_encode([
                'success' => true,
                'message' => count($created) . ' dispositif(s) fictif(s) créé(s)',
                'devices' => $created,
                'errors' => count($errors) > 0 ? $errors : null
            ]);
        } else {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Aucun dispositif créé',
                'errors' => $errors
            ]);
        }
    } catch(Exception $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleCreateTestDevices] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

/**
 * PUT /api.php/devices/:id
 * Mettre à jour un dispositif
 */
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

        $fields = ['status', 'installation_date', 'first_use_date', 'latitude', 'longitude', 'firmware_version'];
        $updates = [];
        $params = ['id' => $device_id];
        
        if (array_key_exists('last_seen', $input) && $input['last_seen']) {
            $updates[] = "last_seen = :last_seen";
            $params['last_seen'] = $input['last_seen'];
        }
        
        if (array_key_exists('last_battery', $input) && $input['last_battery'] !== null) {
            $updates[] = "last_battery = :last_battery";
            $params['last_battery'] = $input['last_battery'];
        }
        if (array_key_exists('last_flowrate', $input) && $input['last_flowrate'] !== null) {
            $updates[] = "last_flowrate = :last_flowrate";
            $params['last_flowrate'] = $input['last_flowrate'];
        }
        if (array_key_exists('last_rssi', $input) && $input['last_rssi'] !== null) {
            $updates[] = "last_rssi = :last_rssi";
            $params['last_rssi'] = $input['last_rssi'];
        }

        foreach ($fields as $field) {
            if (array_key_exists($field, $input)) {
                $updates[] = "$field = :$field";
                $params[$field] = $input[$field];
            }
        }

        $patientIdBeingUpdated = array_key_exists('patient_id', $input);
        if (array_key_exists('device_name', $input) && !$patientIdBeingUpdated) {
            $updates[] = "device_name = :device_name";
            $params['device_name'] = $input['device_name'];
        }

        if ($patientIdBeingUpdated) {
            if ($input['patient_id'] === null || $input['patient_id'] === '') {
                $updates[] = "patient_id = NULL";
                $updates[] = "device_name = :device_name_reset";
                // Utiliser device_serial s'il existe, sinon device_name actuel, sinon sim_iccid
                $params['device_name_reset'] = $device['device_serial'] 
                    ?? $device['device_name'] 
                    ?? $device['sim_iccid'] 
                    ?? 'Dispositif-' . $device_id;
            } else {
                $patientId = (int)$input['patient_id'];
                $patientCheck = $pdo->prepare("SELECT id, first_name, last_name FROM patients WHERE id = :id AND deleted_at IS NULL");
                $patientCheck->execute(['id' => $patientId]);
                $patient = $patientCheck->fetch();
                
                if (!$patient) {
                    http_response_code(422);
                    echo json_encode(['success' => false, 'error' => 'Patient not found']);
                    return;
                }
                
                $updates[] = "patient_id = :patient_id";
                $params['patient_id'] = $patientId;
                
                // Extraire l'année du serial ou utiliser l'année actuelle
                $deviceSerial = $device['device_serial'] ?? null;
                $year = ($deviceSerial && is_string($deviceSerial)) 
                    ? (extractYearFromSerial($deviceSerial) ?: date('y'))
                    : date('y');
                
                // Construire le nom du dispositif avec le nom du patient
                $firstName = trim($patient['first_name'] ?? '');
                $lastName = trim($patient['last_name'] ?? '');
                
                if (empty($firstName) && empty($lastName)) {
                    // Fallback si pas de nom
                    $newDeviceName = sprintf('OTT-%s-Patient-%d', $year, $patientId);
                } else {
                    $newDeviceName = sprintf('OTT-%s-%s %s', $year, $firstName, $lastName);
                }
                
                $updates[] = "device_name = :device_name_patient";
                $params['device_name_patient'] = $newDeviceName;
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
        SimpleCache::clear();
        
        echo json_encode(['success' => true, 'device' => $updated]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleUpdateDevice] ❌ Erreur DB: ' . $e->getMessage());
        error_log('[handleUpdateDevice] Stack trace: ' . $e->getTraceAsString());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Throwable $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur serveur interne';
        error_log('[handleUpdateDevice] ❌ Erreur: ' . $e->getMessage());
        error_log('[handleUpdateDevice] Type: ' . get_class($e));
        error_log('[handleUpdateDevice] Stack trace: ' . $e->getTraceAsString());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

/**
 * DELETE /api.php/devices/:id
 * Archiver ou supprimer définitivement un dispositif
 */
function handleDeleteDevice($device_id) {
    global $pdo;
    
    $user = getCurrentUser();
    $isAdmin = $user && $user['role_name'] === 'admin';
    $forcePermanent = isset($_GET['permanent']) && $_GET['permanent'] === 'true';
    
    if ($forcePermanent && $isAdmin) {
        requirePermission('devices.delete');
    } else {
        requirePermission('devices.edit');
    }
    
    try {
        $stmt = $pdo->prepare("
            SELECT d.*, p.first_name, p.last_name
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            WHERE d.id = :id AND d.deleted_at IS NULL
        ");
        $stmt->execute(['id' => $device_id]);
        $device = $stmt->fetch();
        
        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Dispositif introuvable']);
            return;
        }
        
        // Désassigner automatiquement le patient si le dispositif est assigné
        $wasAssigned = false;
        $patientInfo = null;
        if ($device['patient_id']) {
            $wasAssigned = true;
            $patientInfo = ['first_name' => $device['first_name'] ?? null, 'last_name' => $device['last_name'] ?? null];
            
            // 1. Désassigner le patient
            $pdo->prepare("UPDATE devices SET patient_id = NULL WHERE id = :id")
                ->execute(['id' => $device_id]);
            
            // 2. Réinitialiser la configuration du dispositif aux paramètres par défaut
            try {
                // Vérifier si gps_enabled existe en BDD (compatibilité migration)
                $hasGpsColumn = columnExists('device_configurations', 'gps_enabled');
                
                $resetFields = ['sleep_minutes = NULL', 'measurement_duration_ms = NULL', 'send_every_n_wakeups = NULL', 'calibration_coefficients = NULL'];
                if ($hasGpsColumn) {
                    $resetFields[] = 'gps_enabled = false';
                }
                
                $pdo->prepare("
                    UPDATE device_configurations 
                    SET " . implode(', ', $resetFields) . "
                    WHERE device_id = :device_id
                ")->execute(['device_id' => $device_id]);
                
                error_log("[handleDeleteDevice] Configuration réinitialisée pour dispositif $device_id après désassignation automatique");
            } catch(PDOException $e) {
                // Ne pas bloquer l'archivage si la réinitialisation de la config échoue
                error_log("[handleDeleteDevice] ⚠️ Erreur réinitialisation config (non bloquant): " . $e->getMessage());
            }
            
            // Logger la désassignation automatique
            auditLog('device.unassigned_before_archive', 'device', $device_id, ['old_patient_id' => $device['patient_id']], null);
        }
        
        if ($forcePermanent && $isAdmin) {
            $pdo->prepare("DELETE FROM device_events WHERE device_id = :id")->execute(['id' => $device_id]);
            $pdo->prepare("DELETE FROM device_configurations WHERE device_id = :id")->execute(['id' => $device_id]);
            $pdo->prepare("DELETE FROM device_commands WHERE device_id = :id")->execute(['id' => $device_id]);
            $pdo->prepare("DELETE FROM alerts WHERE device_id = :id")->execute(['id' => $device_id]);
            $pdo->prepare("DELETE FROM usb_logs WHERE device_identifier = :iccid OR device_identifier = :serial")
                ->execute(['iccid' => $device['sim_iccid'], 'serial' => $device['device_serial']]);
            $pdo->prepare("DELETE FROM devices WHERE id = :id")->execute(['id' => $device_id]);
            
            auditLog('device.permanently_deleted', 'device', $device_id, $device, null);
            $message = $wasAssigned 
                ? 'Dispositif supprimé définitivement (désassigné automatiquement du patient ' . ($patientInfo['first_name'] ?? '') . ' ' . ($patientInfo['last_name'] ?? '') . ' et config réinitialisée)'
                : 'Dispositif supprimé définitivement';
            $permanent = true;
        } else {
            $pdo->prepare("UPDATE devices SET deleted_at = NOW() WHERE id = :id")
                ->execute(['id' => $device_id]);
            
            auditLog('device.deleted', 'device', $device_id, $device, null);
            $message = $wasAssigned 
                ? 'Dispositif archivé avec succès (désassigné automatiquement du patient ' . ($patientInfo['first_name'] ?? '') . ' ' . ($patientInfo['last_name'] ?? '') . ' et config réinitialisée)'
                : 'Dispositif archivé avec succès';
            $permanent = false;
        }
        
        echo json_encode([
            'success' => true, 
            'message' => $message,
            'was_assigned' => $wasAssigned,
            'permanent' => $permanent
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeleteDevice] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

/**
 * PATCH /api.php/devices/:id
 * Restaurer un dispositif archivé
 */
function handleRestoreDevice($device_id) {
    global $pdo;
    requirePermission('devices.edit');

    try {
        $stmt = $pdo->prepare("SELECT * FROM devices WHERE id = :id");
        $stmt->execute(['id' => $device_id]);
        $device = $stmt->fetch();

        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Dispositif introuvable']);
            return;
        }

        if (!$device['deleted_at']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Le dispositif n\'est pas archivé']);
            return;
        }

        $stmt = $pdo->prepare("UPDATE devices SET deleted_at = NULL WHERE id = :id");
        $stmt->execute(['id' => $device_id]);

        auditLog('device.restored', 'device', $device_id, $device, ['deleted_at' => null]);

        echo json_encode([
            'success' => true,
            'message' => 'Dispositif restauré avec succès'
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleRestoreDevice] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

