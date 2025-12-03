<?php
/**
 * API Handlers - Devices
 * Extracted from api.php during refactoring
 */

function handleGetDevices() {
    global $pdo;
    
    // Permettre accès sans auth pour dispositifs IoT (rétrocompatibilité)
    // OU avec auth JWT pour dashboard
    $user = getCurrentUser();
    
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
        'user_id' => $user ? $user['id'] : null
    ]);
    
    // Essayer de récupérer depuis le cache
    $cached = SimpleCache::get($cacheKey);
    if ($cached !== null) {
        echo json_encode($cached);
        return;
    }
    
    try {
        // Compter le total
        $countStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM devices d
            WHERE d.deleted_at IS NULL
        ");
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
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
                NULL as last_flowrate,
                NULL as last_rssi,
                d.latitude,
                d.longitude,
                d.created_at,
                d.updated_at,
                p.first_name, 
                p.last_name,
                COALESCE(d.firmware_version, dc.firmware_version) as firmware_version,
                COALESCE(dc.ota_pending, FALSE) as ota_pending
            FROM devices d
            LEFT JOIN patients p ON d.patient_id = p.id AND p.deleted_at IS NULL
            LEFT JOIN device_configurations dc ON d.id = dc.device_id
            WHERE d.deleted_at IS NULL
            ORDER BY d.last_seen DESC NULLS LAST, d.created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $devices = $stmt->fetchAll();
        
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
        // UPSERT PostgreSQL : essayer d'insérer, sinon mettre à jour
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
                device_serial = COALESCE(EXCLUDED.device_serial, devices.device_serial),
                firmware_version = COALESCE(EXCLUDED.firmware_version, devices.firmware_version),
                status = EXCLUDED.status,
                last_seen = EXCLUDED.last_seen,
                deleted_at = NULL,
                updated_at = NOW()
            RETURNING *, (xmax = 0) AS was_insert
        ");
        
        $stmt->execute([
            'sim_iccid' => $sim_iccid,
            'device_serial' => $input['device_serial'] ?? null,
            'device_name' => $input['device_name'] ?? null,
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
        
        auditLog($wasInsert ? 'device.created' : 'device.restored', 'device', $device['id'], null, $device);
        
        // Invalider le cache des devices
        SimpleCache::clear();
        
        http_response_code($wasInsert ? 201 : 200);
        echo json_encode([
            'success' => true,
            'message' => $wasInsert ? 'Dispositif créé avec succès' : 'Dispositif restauré avec succès',
            'device' => $device,
            'was_created' => $wasInsert,
            'was_restored' => !$wasInsert
        ]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Erreur serveur']);
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
                // Vérifier si le dispositif existe déjà
                $checkStmt = $pdo->prepare("SELECT id FROM devices WHERE sim_iccid = :sim_iccid AND deleted_at IS NULL");
                $checkStmt->execute(['sim_iccid' => $testDevice['sim_iccid']]);
                if ($checkStmt->fetch()) {
                    $errors[] = "Dispositif {$testDevice['sim_iccid']} existe déjà";
                    continue;
                }
                
                // Créer le dispositif
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
                
                // Créer la configuration par défaut
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
        
        // Permettre la mise à jour de last_battery, last_flowrate et last_rssi via PUT (pour mesures USB/OTA)
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
        
        // Si le dispositif est assigné, on le désassigne d'abord (soft delete)
        if ($device['patient_id']) {
            // Désassigner le patient avant suppression
            $pdo->prepare("UPDATE devices SET patient_id = NULL WHERE id = :id")
                ->execute(['id' => $device_id]);
        }
        
        // Soft delete : mettre deleted_at à NOW()
        $pdo->prepare("UPDATE devices SET deleted_at = NOW() WHERE id = :id")
            ->execute(['id' => $device_id]);
        
        // Enregistrer dans l'audit
        auditLog('device.deleted', 'device', $device_id, $device, null);
        
        $message = $device['patient_id'] 
            ? 'Dispositif supprimé avec succès (désassigné du patient ' . ($device['first_name'] ?? '') . ' ' . ($device['last_name'] ?? '') . ')'
            : 'Dispositif supprimé avec succès';
        
        echo json_encode([
            'success' => true, 
            'message' => $message,
            'was_assigned' => (bool)$device['patient_id']
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeleteDevice] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handlePostMeasurement() {
    global $pdo;
    
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
        return;
    }
    
    // Extraire les données (support format V1 et V2)
    $iccid = $input['iccid'] ?? $input['sim_iccid'] ?? $input['device_id'] ?? null;
    $flowrate = floatval($input['flowrate'] ?? $input['flow_rate'] ?? 0);
    $battery = intval($input['battery'] ?? $input['battery_level'] ?? 100);
    $rssi = intval($input['rssi'] ?? $input['signal_strength'] ?? 0);
    $status = $input['status'] ?? $input['device_status'] ?? 'active';
    $timestamp = $input['timestamp'] ?? null;
    $firmware_version = $input['firmware_version'] ?? $input['firmware'] ?? 'unknown';
    
    if (!$iccid) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'iccid or device_id required']);
        return;
    }
    
    // Extraire latitude/longitude (support format V1 et V2)
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
                
                // Mettre à jour last_flowrate et last_rssi si fournis
                if ($flowrate !== null && $flowrate !== 0) {
                    $updateFields[] = 'last_flowrate = :flowrate';
                    $updateParams['flowrate'] = $flowrate;
                }
                if ($rssi !== null && $rssi !== 0) {
                    $updateFields[] = 'last_rssi = :rssi';
                    $updateParams['rssi'] = $rssi;
                }
                
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
                
                // Mettre à jour la configuration si elle est fournie dans le format unifié
                if (isset($input['sleep_minutes']) || isset($input['measurement_duration_ms']) || isset($input['calibration_coefficients']) || isset($input['config'])) {
                    $configData = $input['config'] ?? $input;
                    $configUpdateFields = [];
                    $configUpdateParams = ['device_id' => $device_id];
                    
                    if (isset($configData['sleep_minutes']) && is_numeric($configData['sleep_minutes'])) {
                        $configUpdateFields[] = 'sleep_minutes = :sleep_minutes';
                        $configUpdateParams['sleep_minutes'] = intval($configData['sleep_minutes']);
                    }
                    
                    if (isset($configData['measurement_duration_ms']) && is_numeric($configData['measurement_duration_ms'])) {
                        $configUpdateFields[] = 'measurement_duration_ms = :measurement_duration_ms';
                        $configUpdateParams['measurement_duration_ms'] = intval($configData['measurement_duration_ms']);
                    }
                    
                    if (isset($configData['calibration_coefficients']) && is_array($configData['calibration_coefficients'])) {
                        $configUpdateFields[] = 'calibration_coefficients = :calibration_coefficients';
                        $configUpdateParams['calibration_coefficients'] = json_encode($configData['calibration_coefficients']);
                    }
                    
                    if (!empty($configUpdateFields)) {
                        // S'assurer que la configuration existe
                        $pdo->prepare("
                            INSERT INTO device_configurations (device_id, firmware_version)
                            VALUES (:device_id, :firmware_version)
                            ON CONFLICT (device_id) DO NOTHING
                        ")->execute(['device_id' => $device_id, 'firmware_version' => $firmware_version]);
                        
                        // Mettre à jour la configuration
                        $pdo->prepare("
                            UPDATE device_configurations 
                            SET " . implode(', ', $configUpdateFields) . "
                            WHERE device_id = :device_id
                        ")->execute($configUpdateParams);
                    }
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
                        $updateFields = ['last_seen = :timestamp', 'last_battery = :battery'];
                        
                        // Mettre à jour last_flowrate et last_rssi si fournis
                        if ($flowrate !== null && $flowrate !== 0) {
                            $updateFields[] = 'last_flowrate = :flowrate';
                            $updateParams['flowrate'] = $flowrate;
                        }
                        if ($rssi !== null && $rssi !== 0) {
                            $updateFields[] = 'last_rssi = :rssi';
                            $updateParams['rssi'] = $rssi;
                        }
                        
                        $pdo->prepare("UPDATE devices SET " . implode(', ', $updateFields) . " WHERE id = :id")
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

// Fonction deprecated supprimée - utiliser findDeviceByIdentifier() directement

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
                $firmware_full_path = __DIR__ . '/../../' . $firmware['file_path'];
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
    $device = findDeviceByIdentifier($iccid, false);
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
    
    $device = findDeviceByIdentifier($iccid, false);
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
    
    $device = findDeviceByIdentifier($iccid, false);
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
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    // Obtenir l'utilisateur courant pour le cache
    $currentUser = getCurrentUser();
    
    // Cache: générer une clé basée sur les paramètres
    $cacheKey = SimpleCache::key('commands', [
        'limit' => $limit,
        'offset' => $offset,
        'status' => $statusFilter,
        'iccid' => $iccidFilter,
        'user_id' => $currentUser ? $currentUser['id'] : null
    ]);
    
    // Essayer de récupérer depuis le cache
    $cached = SimpleCache::get($cacheKey);
    if ($cached !== null) {
        echo json_encode($cached);
        return;
    }
    
    try {
        expireDeviceCommands();
        
        // Requête pour compter le total
        $countSql = "
            SELECT COUNT(*)
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            WHERE d.deleted_at IS NULL
        ";
        $countParams = [];
        if ($statusFilter) {
            $countSql .= " AND dc.status = :status";
            $countParams['status'] = $statusFilter;
        }
        if ($iccidFilter) {
            $countSql .= " AND d.sim_iccid = :iccid";
            $countParams['iccid'] = $iccidFilter;
        }
        
        $countStmt = $pdo->prepare($countSql);
        foreach ($countParams as $key => $value) {
            $countStmt->bindValue(':' . $key, $value);
        }
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
        // Requête principale avec pagination
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
        $sql .= " ORDER BY dc.created_at DESC LIMIT :limit OFFSET :offset";
        
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

        // Vérifier s'il y a des dispositifs assignés et les désassigner automatiquement
        $deviceStmt = $pdo->prepare("SELECT id, sim_iccid, device_name FROM devices WHERE patient_id = :patient_id AND deleted_at IS NULL");
        $deviceStmt->execute(['patient_id' => $patient_id]);
        $assignedDevices = $deviceStmt->fetchAll();

        $wasAssigned = false;
        if (count($assignedDevices) > 0) {
            // Désassigner tous les dispositifs avant de supprimer le patient
            $pdo->prepare("UPDATE devices SET patient_id = NULL WHERE patient_id = :patient_id")
                ->execute(['patient_id' => $patient_id]);
            $wasAssigned = true;
            
            // Logger la désassignation pour chaque dispositif
            foreach ($assignedDevices as $device) {
                auditLog('device.unassigned_before_patient_delete', 'device', $device['id'], ['old_patient_id' => $patient_id], null);
            }
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
        echo json_encode([
            'success' => true, 
            'message' => 'Patient supprimé avec succès' . ($wasAssigned ? ' (dispositifs désassignés automatiquement)' : ''),
            'devices_unassigned' => $wasAssigned ? count($assignedDevices) : 0
        ]);
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

