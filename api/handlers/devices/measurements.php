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
    
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
        return;
    }
    
    // Extraire les données (format unifié uniquement)
    $iccid = $input['sim_iccid'] ?? null;
    $flowrate = isset($input['flow_lpm']) ? floatval($input['flow_lpm']) : 0;
    $battery = isset($input['battery_percent']) ? intval($input['battery_percent']) : 100;
    $rssi = isset($input['rssi']) ? intval($input['rssi']) : 0;
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
                
                $insertStmt = $pdo->prepare("
                    INSERT INTO devices (sim_iccid, device_name, device_serial, last_seen, last_battery, firmware_version, status, first_use_date, latitude, longitude)
                    VALUES (:iccid, :device_name, :device_serial, :timestamp, :battery, :firmware_version, 'active', :timestamp, :latitude, :longitude)
                ");
                $insertStmt->execute([
                    'iccid' => $iccid,
                    'device_name' => $iccid,
                    'device_serial' => $iccid,
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
 * GET /api.php/devices/:id/history
 * Récupérer l'historique des mesures d'un dispositif
 */
function handleGetDeviceHistory($device_id) {
    global $pdo;
    
    try {
        // Récupérer les mesures avec les coordonnées GPS du dispositif (dernières connues)
        $stmt = $pdo->prepare("
            SELECT 
                m.*,
                d.latitude,
                d.longitude
            FROM measurements m
            JOIN devices d ON m.device_id = d.id
            WHERE m.device_id = :device_id 
            ORDER BY m.timestamp DESC 
            LIMIT 1000
        ");
        $stmt->execute(['device_id' => $device_id]);
        echo json_encode(['success' => true, 'measurements' => $stmt->fetchAll()]);
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