<?php
/**
 * API Handlers - Devices Measurements
 * Gestion des mesures reçues des dispositifs
 */

require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/utils.php';

/**
 * POST /api.php/measurements
 * Recevoir une mesure d'un dispositif (USB ou OTA)
 */
function handlePostMeasurement() {
    global $pdo;
    
    // Nettoyer tout output précédent
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    ob_start();
    
    // Headers JSON
    header('Content-Type: application/json; charset=utf-8');
    
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
        return;
    }
    
    // Extraire les données (format unifié uniquement)
    $iccid = $input['sim_iccid'] ?? null;
    $flowrate = isset($input['flow_lpm']) ? floatval($input['flow_lpm']) : 0;
    // CORRECTION: Utiliser floatval() pour préserver la précision (85.5% au lieu de 85%)
    $battery = isset($input['battery_percent']) ? floatval($input['battery_percent']) : null;
    // CORRECTION: Utiliser null comme défaut si non fourni (au lieu de 0 qui peut masquer un problème)
    $rssi = isset($input['rssi']) ? intval($input['rssi']) : null;
    $status = $input['status'] ?? $input['mode'] ?? 'active';
    $timestamp = $input['timestamp'] ?? null;
    $firmware_version = $input['firmware_version'] ?? 'unknown';
    
    if (!$iccid) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'sim_iccid is required']);
        return;
    }
    
    // Extraire latitude/longitude (format unifié)
    $latitude = isset($input['latitude']) && is_numeric($input['latitude']) ? floatval($input['latitude']) : null;
    $longitude = isset($input['longitude']) && is_numeric($input['longitude']) ? floatval($input['longitude']) : null;
    
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
                        if ($latitude >= -90 && $latitude <= 90 && $longitude >= -180 && $longitude <= 180) {
                            $initialLatitude = $latitude;
                            $initialLongitude = $longitude;
                        }
                    }
                }
                
                // Utiliser device_serial et device_name du payload si fournis, sinon utiliser ICCID
                $device_serial = $input['device_serial'] ?? $iccid;
                $device_name = $input['device_name'] ?? $iccid;
                
                $insertStmt = $pdo->prepare("
                    INSERT INTO devices (sim_iccid, device_name, device_serial, last_seen, last_battery, firmware_version, status, first_use_date, latitude, longitude)
                    VALUES (:iccid, :device_name, :device_serial, :timestamp, :battery, :firmware_version, 'active', :timestamp, :latitude, :longitude)
                ");
                $insertStmt->execute([
                    'iccid' => $iccid,
                    'device_name' => $device_name,
                    'device_serial' => $device_serial,
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
                
                // Mettre à jour le device_serial si le firmware envoie un serial valide (pas temporaire)
                // et que le dispositif n'a pas de serial ou a un serial temporaire
                $device_serial_from_payload = $input['device_serial'] ?? null;
                $isSerialTemporary = $device_serial_from_payload && (
                    strpos($device_serial_from_payload, 'OTT-XX-XXX') !== false ||
                    strpos($device_serial_from_payload, 'TEMP-') === 0
                );
                $hasSerial = !empty($device['device_serial']);
                $hasTemporarySerial = $hasSerial && (
                    strpos($device['device_serial'], 'OTT-XX-XXX') !== false ||
                    strpos($device['device_serial'], 'TEMP-') === 0
                );
                
                if ($device_serial_from_payload && !$isSerialTemporary) {
                    // Le firmware envoie un serial valide
                    if (!$hasSerial || $hasTemporarySerial || $device['device_serial'] !== $device_serial_from_payload) {
                        // Mettre à jour le serial si :
                        // - Le dispositif n'a pas de serial
                        // - Le dispositif a un serial temporaire
                        // - Le serial est différent
                        $updateFields[] = 'device_serial = :device_serial';
                        $updateParams['device_serial'] = $device_serial_from_payload;
                        error_log("[Measurement] Mise à jour device_serial pour device_id=$device_id: '{$device['device_serial']}' → '$device_serial_from_payload'");
                    }
                }
                
                // Gestion de la position
                if ($latitude !== null && $longitude !== null) {
                    if ($latitude >= -90 && $latitude <= 90 && $longitude >= -180 && $longitude <= 180) {
                        $updateFields[] = 'latitude = :latitude';
                        $updateFields[] = 'longitude = :longitude';
                        $updateParams['latitude'] = $latitude;
                        $updateParams['longitude'] = $longitude;
                    }
                } elseif ($isUsbMeasurement) {
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
                }
                
                $pdo->prepare("UPDATE devices SET " . implode(', ', $updateFields) . " WHERE id = :id")
                    ->execute($updateParams);
                
                // Mettre à jour la configuration si firmware_version a changé
                if ($firmware_version && $firmware_version !== $device['firmware_version']) {
                    $pdo->prepare("UPDATE device_configurations SET firmware_version = :firmware_version WHERE device_id = :device_id")
                        ->execute(['firmware_version' => $firmware_version, 'device_id' => $device_id]);
                }
                
                // Mettre à jour la configuration si elle est fournie
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
                        $pdo->prepare("
                            INSERT INTO device_configurations (device_id, firmware_version)
                            VALUES (:device_id, :firmware_version)
                            ON CONFLICT (device_id) DO NOTHING
                        ")->execute(['device_id' => $device_id, 'firmware_version' => $firmware_version]);
                        
                        $pdo->prepare("
                            UPDATE device_configurations 
                            SET " . implode(', ', $configUpdateFields) . "
                            WHERE device_id = :device_id
                        ")->execute($configUpdateParams);
                    }
                }
            }
            
            // Enregistrer la mesure
            // IMPORTANT: S'assurer que flowrate est toujours un nombre valide (même 0)
            // La table measurements a flowrate NOT NULL, donc on doit toujours fournir une valeur
            $flowrateValue = is_numeric($flowrate) ? floatval($flowrate) : 0.0;
            
            try {
                // Vérifier si les colonnes GPS existent dans measurements
                $checkGpsStmt = $pdo->prepare("
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'measurements' 
                        AND column_name = 'latitude'
                    ) as has_latitude
                ");
                $checkGpsStmt->execute();
                $gpsCheck = $checkGpsStmt->fetch(PDO::FETCH_ASSOC);
                $hasGpsColumns = ($gpsCheck['has_latitude'] === true || $gpsCheck['has_latitude'] === 't' || $gpsCheck['has_latitude'] === 1);
                
                // Construire la requête INSERT selon si les colonnes GPS existent
                if ($hasGpsColumns) {
                    // Colonnes GPS existent : les inclure dans l'INSERT
                    $measurementStmt = $pdo->prepare("
                        INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status, latitude, longitude)
                        VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status, :latitude, :longitude)
                    ");
                    $measurementStmt->execute([
                        'device_id' => $device_id,
                        'flowrate' => $flowrateValue,
                        'battery' => $battery !== null ? floatval($battery) : null,
                        'rssi' => $rssi !== null ? intval($rssi) : null,
                        'status' => $status,
                        'timestamp' => $timestampValue,
                        'latitude' => ($latitude !== null && $latitude >= -90 && $latitude <= 90) ? floatval($latitude) : null,
                        'longitude' => ($longitude !== null && $longitude >= -180 && $longitude <= 180) ? floatval($longitude) : null
                    ]);
                } else {
                    // Colonnes GPS n'existent pas encore : INSERT sans GPS
                    $measurementStmt = $pdo->prepare("
                        INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
                        VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status)
                    ");
                    $measurementStmt->execute([
                        'device_id' => $device_id,
                        'flowrate' => $flowrateValue,
                        'battery' => $battery !== null ? floatval($battery) : null,
                        'rssi' => $rssi !== null ? intval($rssi) : null,
                        'status' => $status,
                        'timestamp' => $timestampValue
                    ]);
                }
                error_log("[Measurement] ✅ Mesure enregistrée pour dispositif $device_id (ICCID: $iccid) - Flow: $flowrateValue, Bat: $battery, RSSI: $rssi");
            } catch(PDOException $measurementError) {
                error_log("[Measurement] ❌ ERREUR insertion mesure pour dispositif $device_id (ICCID: $iccid): " . $measurementError->getMessage());
                error_log("[Measurement] Code erreur: " . $measurementError->getCode());
                error_log("[Measurement] Données: flowrate=$flowrateValue (type: " . gettype($flowrateValue) . "), battery=$battery, rssi=$rssi, status=$status");
                error_log("[Measurement] Stack trace: " . $measurementError->getTraceAsString());
                // Faire échouer la transaction pour éviter l'incohérence (last_seen mis à jour mais pas de mesure)
                throw $measurementError;
            }
            
            // Alertes - utiliser la fonction depuis helpers.php si disponible, sinon créer directement
            if ($battery < 20) {
                if (function_exists('createAlert')) {
                    createAlert($pdo, $device_id, 'low_battery', 'high', "Batterie faible: $battery%");
                } else {
                    // Fallback : créer l'alerte directement
                    try {
                        $pdo->prepare("
                            INSERT INTO alerts (id, device_id, type, severity, message, status, created_at)
                            VALUES (:id, :device_id, :type, :severity, :message, 'unresolved', NOW())
                            ON CONFLICT DO NOTHING
                        ")->execute([
                            'id' => 'alert_' . uniqid(),
                            'device_id' => $device_id,
                            'type' => 'low_battery',
                            'severity' => 'high',
                            'message' => "Batterie faible: $battery%"
                        ]);
                    } catch(PDOException $e) {
                        // Ignorer si l'alerte existe déjà
                    }
                }
            }
            
            // Commit de la transaction
            $pdo->commit();
            
            // Récupérer les commandes en attente (avec gestion d'erreur robuste)
            $commands = [];
            if (function_exists('fetchPendingCommandsForDevice')) {
                try {
                    $commands = @fetchPendingCommandsForDevice($device_id);
                    if (!is_array($commands)) {
                        $commands = [];
                    }
                } catch (Exception $cmdError) {
                    error_log('[handlePostMeasurement] ⚠️ Erreur récupération commandes: ' . $cmdError->getMessage());
                    $commands = [];
                } catch (Error $cmdError) {
                    error_log('[handlePostMeasurement] ⚠️ Erreur fatale récupération commandes: ' . $cmdError->getMessage());
                    $commands = [];
                }
            }
            
            // Nettoyer le buffer avant d'envoyer la réponse
            ob_clean();
            echo json_encode([
                'success' => true,
                'device_id' => $device_id,
                'device_auto_registered' => !$device,
                'commands' => $commands
            ]);
            ob_end_flush();
            
        } catch(PDOException $e) {
            // Rollback en cas d'erreur
            $pdo->rollBack();
            
            // Gérer les contraintes uniques (race condition)
            if ($e->getCode() == 23000) {
                // Réessayer une fois
                try {
                    $pdo->beginTransaction();
                    $device = findDeviceByIdentifier($iccid, false);
                    
                    if ($device) {
                        $device_id = $device['id'];
                        $updateParams = ['battery' => $battery, 'id' => $device_id, 'timestamp' => $timestampValue];
                        $updateFields = ['last_seen = :timestamp', 'last_battery = :battery'];
                        
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
                            if (function_exists('createAlert')) {
                                createAlert($pdo, $device_id, 'low_battery', 'high', "Batterie faible: $battery%");
                            }
                        }
                        
                        $pdo->commit();
                        $commands = [];
                        if (function_exists('fetchPendingCommandsForDevice')) {
                            try {
                                $commands = @fetchPendingCommandsForDevice($device_id);
                                if (!is_array($commands)) {
                                    $commands = [];
                                }
                            } catch (Exception $e) {
                                error_log('[handlePostMeasurement] Erreur commandes (retry): ' . $e->getMessage());
                                $commands = [];
                            }
                        }
                        
                        ob_clean();
                        echo json_encode([
                            'success' => true,
                            'device_id' => $device_id,
                            'device_auto_registered' => false,
                            'commands' => $commands
                        ]);
                        ob_end_flush();
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
        error_log('[handlePostMeasurement] ❌ ERREUR SQL: ' . $e->getMessage());
        error_log('[handlePostMeasurement] Code: ' . $e->getCode());
        error_log('[handlePostMeasurement] ICCID: ' . ($iccid ?? 'unknown'));
        
        // Nettoyer le buffer avant d'envoyer l'erreur
        ob_clean();
        
        // Retourner l'erreur SQL complète dans la réponse pour diagnostic
        // Le firmware pourra la voir dans la réponse HTTP
        echo json_encode([
            'success' => false, 
            'error' => $errorMsg,
            'error_code' => $e->getCode(),
            'error_message' => $e->getMessage() // Toujours inclure le message complet pour diagnostic
        ]);
        ob_end_flush();
    }
}

/**
 * GET /api.php/devices/:id/measurements
 * Récupérer les mesures d'un dispositif
 */
function handleGetDeviceMeasurements($device_id) {
    global $pdo;
    
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    
    try {
        $stmt = $pdo->prepare("
            SELECT m.* FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE d.device_identifier = ? OR d.id = ?
            ORDER BY m.timestamp DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$device_id, $device_id, $limit, $offset]);
        $measurements = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'measurements' => $measurements]);
    } catch(PDOException $e) {
        http_response_code(500);
        error_log('[handleGetDeviceMeasurements] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

/**
 * GET /api.php/devices/:id/history
 * Récupérer l'historique des mesures d'un dispositif
 */
function handleGetDeviceHistory($device_id) {
    global $pdo;
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 1000) : 500;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    try {
        // Vérifier si les colonnes GPS existent dans measurements
        $checkGpsColumns = $pdo->prepare("
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'measurements' 
                AND column_name = 'latitude'
            ) as has_latitude,
            EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'measurements' 
                AND column_name = 'longitude'
            ) as has_longitude
        ");
        $checkGpsColumns->execute();
        $checkGpsColumns = $checkGpsColumns->fetch(PDO::FETCH_ASSOC);
        
        $hasGpsColumns = ($checkGpsColumns['has_latitude'] === true || $checkGpsColumns['has_latitude'] === 't' || $checkGpsColumns['has_latitude'] === 1) &&
                         ($checkGpsColumns['has_longitude'] === true || $checkGpsColumns['has_longitude'] === 't' || $checkGpsColumns['has_longitude'] === 1);
        
        // Vérifier si la colonne deleted_at existe
        $checkDeletedAtStmt = $pdo->prepare("
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'measurements' 
                AND column_name = 'deleted_at'
            ) as has_deleted_at
        ");
        $checkDeletedAtStmt->execute();
        $checkDeletedAt = $checkDeletedAtStmt->fetch(PDO::FETCH_ASSOC);
        $hasDeletedAt = $checkDeletedAt && $checkDeletedAt['has_deleted_at'];
        
        // Gérer l'affichage des archives
        $showArchived = isset($_GET['show_archived']) && ($_GET['show_archived'] === 'true' || $_GET['show_archived'] === '1');
        
        // Filtrer les mesures archivées selon le paramètre
        $deletedAtFilter = "";
        if ($hasDeletedAt) {
            if ($showArchived) {
                // Afficher uniquement les mesures archivées
                $deletedAtFilter = " AND m.deleted_at IS NOT NULL";
            } else {
                // Exclure les mesures archivées (comportement par défaut)
                $deletedAtFilter = " AND m.deleted_at IS NULL";
            }
        }
        
        // Compter le total selon le filtre
        $countSql = "
            SELECT COUNT(*)
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.device_id = :device_id
            $deletedAtFilter
        ";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute(['device_id' => $device_id]);
        $total = intval($countStmt->fetchColumn());
        
        // Construire la requête selon si les colonnes GPS existent
        if ($hasGpsColumns) {
            // Colonnes GPS existent : utiliser COALESCE pour prioriser les coordonnées de la mesure
            $sql = "
                SELECT 
                    m.*,
                    COALESCE(m.latitude, d.latitude) as latitude,
                    COALESCE(m.longitude, d.longitude) as longitude
                FROM measurements m
                JOIN devices d ON m.device_id = d.id
                WHERE m.device_id = :device_id 
                $deletedAtFilter
                ORDER BY m.timestamp DESC 
                LIMIT :limit OFFSET :offset
            ";
        } else {
            // Colonnes GPS n'existent pas encore : utiliser seulement celles du dispositif
            $sql = "
                SELECT 
                    m.*,
                    d.latitude,
                    d.longitude
                FROM measurements m
                JOIN devices d ON m.device_id = d.id
                WHERE m.device_id = :device_id 
                $deletedAtFilter
                ORDER BY m.timestamp DESC 
                LIMIT :limit OFFSET :offset
            ";
        }
        
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(':device_id', $device_id, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $totalPages = ceil($total / $limit);
        echo json_encode([
            'success' => true, 
            'measurements' => $stmt->fetchAll(),
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

/**
 * GET /api.php/measurements/latest
 * Récupérer les dernières mesures (24h)
 */
function handleGetLatestMeasurements() {
    global $pdo;
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    try {
        // Compter le total
        $countStmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            AND d.deleted_at IS NULL
        ");
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
        $stmt = $pdo->prepare("
            SELECT m.*, d.sim_iccid, d.device_name
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            AND d.deleted_at IS NULL
            ORDER BY m.timestamp DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $totalPages = ceil($total / $limit);
        echo json_encode([
            'success' => true, 
            'measurements' => $stmt->fetchAll(),
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

/**
 * GET /api.php/admin/diagnostic/measurements
 * Diagnostic complet des mesures dans la base de données
 */
function handleDiagnosticMeasurements() {
    global $pdo;
    requireAdmin();
    
    try {
        $diagnostic = [];
        
        // 1. Compter les dispositifs
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL");
        $stmt->execute();
        $diagnostic['devices_count'] = (int)$stmt->fetchColumn();
        
        // 2. Compter les mesures totales
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM measurements");
        $stmt->execute();
        $diagnostic['measurements_total'] = (int)$stmt->fetchColumn();
        
        // 3. Compter les mesures des dernières 24h
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            AND d.deleted_at IS NULL
        ");
        $stmt->execute();
        $diagnostic['measurements_24h'] = (int)$stmt->fetchColumn();
        
        // 4. Liste des dispositifs avec nombre de mesures
        // Inclure aussi les dispositifs avec last_seen récent mais sans mesures (incohérence)
        $stmt = $pdo->prepare("
            SELECT d.id, d.sim_iccid, d.device_name, d.device_serial, 
                   COUNT(m.id) as measurement_count,
                   MAX(m.timestamp) as last_measurement,
                   d.last_seen,
                   CASE 
                     WHEN COUNT(m.id) = 0 AND d.last_seen IS NOT NULL AND d.last_seen >= NOW() - INTERVAL '7 days' 
                     THEN true 
                     ELSE false 
                   END as has_inconsistency
            FROM devices d
            LEFT JOIN measurements m ON d.id = m.device_id
            WHERE d.deleted_at IS NULL
            GROUP BY d.id, d.sim_iccid, d.device_name, d.device_serial, d.last_seen
            ORDER BY last_measurement DESC NULLS LAST, d.last_seen DESC NULLS LAST
        ");
        $stmt->execute();
        $diagnostic['devices'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // 5. Dernières 10 mesures
        $stmt = $pdo->prepare("
            SELECT m.id, m.device_id, d.sim_iccid, d.device_name, 
                   m.timestamp, m.flowrate, m.battery, m.signal_strength, m.device_status
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE d.deleted_at IS NULL
            ORDER BY m.timestamp DESC
            LIMIT 10
        ");
        $stmt->execute();
        $diagnostic['latest_measurements'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // 6. Dispositifs sans mesures
        $stmt = $pdo->prepare("
            SELECT d.id, d.sim_iccid, d.device_name, d.device_serial, d.last_seen
            FROM devices d
            LEFT JOIN measurements m ON d.id = m.device_id
            WHERE d.deleted_at IS NULL
            AND m.id IS NULL
            ORDER BY d.last_seen DESC NULLS LAST
        ");
        $stmt->execute();
        $diagnostic['devices_without_measurements'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // 7. Statistiques par dispositif (mesures 24h)
        $stmt = $pdo->prepare("
            SELECT d.sim_iccid, d.device_name, COUNT(m.id) as count, MAX(m.timestamp) as last_measurement
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.timestamp >= NOW() - INTERVAL '24 HOURS'
            AND d.deleted_at IS NULL
            GROUP BY d.id, d.sim_iccid, d.device_name
            ORDER BY last_measurement DESC
        ");
        $stmt->execute();
        $diagnostic['measurements_by_device_24h'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'diagnostic' => $diagnostic,
            'timestamp' => date('c')
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'error' => 'Database error',
            'message' => getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Vérifiez les logs'
        ]);
    }
}

/**
 * DELETE /api.php/measurements/:id
 * Supprimer définitivement une mesure (admin uniquement)
 */
function handleDeleteMeasurement($measurement_id) {
    global $pdo;
    
    requireAdmin();
    
    try {
        // Vérifier que la mesure existe
        $stmt = $pdo->prepare("SELECT id, device_id FROM measurements WHERE id = :id");
        $stmt->execute(['id' => $measurement_id]);
        $measurement = $stmt->fetch();
        
        if (!$measurement) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mesure non trouvée']);
            return;
        }
        
        // Vérifier si la colonne deleted_at existe
        $checkDeletedAtStmt = $pdo->prepare("
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'measurements' 
                AND column_name = 'deleted_at'
            ) as has_deleted_at
        ");
        $checkDeletedAtStmt->execute();
        $checkDeletedAt = $checkDeletedAtStmt->fetch(PDO::FETCH_ASSOC);
        $hasDeletedAt = $checkDeletedAt && $checkDeletedAt['has_deleted_at'];
        
        // Déterminer l'action : archive=true pour archivage, permanent=true pour suppression définitive
        $archive = isset($_GET['archive']) && $_GET['archive'] === 'true';
        $permanent = isset($_GET['permanent']) && $_GET['permanent'] === 'true';
        
        if ($archive && $hasDeletedAt) {
            // Archivage (soft delete) - marquer comme supprimé avec deleted_at
            $updateStmt = $pdo->prepare("UPDATE measurements SET deleted_at = NOW() WHERE id = :id");
            $updateStmt->execute(['id' => $measurement_id]);
            
            error_log("[Measurement] ✅ Mesure $measurement_id archivée par admin (device_id: {$measurement['device_id']})");
            
            echo json_encode([
                'success' => true,
                'message' => 'Mesure archivée'
            ]);
        } else {
            // Suppression définitive
            $deleteStmt = $pdo->prepare("DELETE FROM measurements WHERE id = :id");
            $deleteStmt->execute(['id' => $measurement_id]);
            
            error_log("[Measurement] ✅ Mesure $measurement_id supprimée définitivement par admin (device_id: {$measurement['device_id']})");
            
            echo json_encode([
                'success' => true,
                'message' => 'Mesure supprimée définitivement'
            ]);
        }
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeleteMeasurement] ❌ ERREUR: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

/**
 * PATCH /api.php/measurements/:id
 * Restaurer une mesure archivée (admin uniquement)
 */
function handleRestoreMeasurement($measurement_id) {
    global $pdo;
    
    requireAdmin();
    
    try {
        // Vérifier si la colonne deleted_at existe
        $checkDeletedAtStmt = $pdo->prepare("
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'measurements' 
                AND column_name = 'deleted_at'
            ) as has_deleted_at
        ");
        $checkDeletedAtStmt->execute();
        $checkDeletedAt = $checkDeletedAtStmt->fetch(PDO::FETCH_ASSOC);
        $hasDeletedAt = $checkDeletedAt && $checkDeletedAt['has_deleted_at'];
        
        if (!$hasDeletedAt) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'La fonctionnalité de restauration n\'est pas disponible (colonne deleted_at absente)']);
            return;
        }
        
        // Vérifier que la mesure existe et est archivée
        $stmt = $pdo->prepare("SELECT id, device_id, deleted_at FROM measurements WHERE id = :id");
        $stmt->execute(['id' => $measurement_id]);
        $measurement = $stmt->fetch();
        
        if (!$measurement) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mesure non trouvée']);
            return;
        }
        
        if ($measurement['deleted_at'] === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Cette mesure n\'est pas archivée']);
            return;
        }
        
        // Restaurer la mesure (définir deleted_at à NULL)
        $updateStmt = $pdo->prepare("UPDATE measurements SET deleted_at = NULL WHERE id = :id");
        $updateStmt->execute(['id' => $measurement_id]);
        
        error_log("[Measurement] ✅ Mesure $measurement_id restaurée par admin (device_id: {$measurement['device_id']})");
        
        echo json_encode([
            'success' => true,
            'message' => 'Mesure restaurée'
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleRestoreMeasurement] ❌ ERREUR: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}