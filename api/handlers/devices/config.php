<?php
/**
 * API Handlers - Devices Config
 * Gestion de la configuration des dispositifs
 */

require_once __DIR__ . '/../../helpers.php';

/**
 * GET /api.php/devices/:device_id/config
 * Récupérer la configuration d'un dispositif
 */
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
        
        // Désérialiser calibration_coefficients si c'est un JSON string
        if (isset($config['calibration_coefficients']) && is_string($config['calibration_coefficients'])) {
            $config['calibration_coefficients'] = json_decode($config['calibration_coefficients'], true);
        }
        
        echo json_encode(['success' => true, 'config' => $config]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

/**
 * PUT /api.php/devices/:device_id/config
 * Mettre à jour la configuration d'un dispositif
 */
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
        
        // Vérifier si gps_enabled existe en BDD (compatibilité migration)
        $hasGpsColumn = columnExists('device_configurations', 'gps_enabled');
        
        // Liste de tous les champs configurables (ceux qui peuvent être sauvegardés en BDD)
        // Note: Les paramètres réseau/modem/OTA sont envoyés au firmware mais pas stockés en BDD
        // car ils sont gérés directement par le firmware via NVS
        $fieldsToUpdate = ['sleep_minutes', 'measurement_duration_ms', 'send_every_n_wakeups', 'calibration_coefficients'];
        if ($hasGpsColumn) {
            $fieldsToUpdate[] = 'gps_enabled';
        }
        
        foreach($fieldsToUpdate as $field) {
            if (array_key_exists($field, $input)) {
                if ($input[$field] === null) {
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
            
            // Créer une commande UPDATE_CONFIG pour envoyer la nouvelle config au firmware
            // Inclure TOUS les paramètres (même ceux non stockés en BDD)
            $configPayload = [];
            
            // Paramètres de base (stockés en BDD)
            $configFields = ['sleep_minutes', 'measurement_duration_ms', 'send_every_n_wakeups', 'calibration_coefficients'];
            if ($hasGpsColumn) {
                $configFields[] = 'gps_enabled';
            }
            
            // Paramètres airflow (envoyés au firmware, pas stockés en BDD)
            $airflowFields = ['airflow_passes', 'airflow_samples_per_pass', 'airflow_delay_ms'];
            
            // Paramètres modem (envoyés au firmware, pas stockés en BDD)
            $modemFields = ['watchdog_seconds', 'modem_boot_timeout_ms', 'sim_ready_timeout_ms', 'network_attach_timeout_ms', 'modem_max_reboots'];
            
            // Paramètres réseau (envoyés au firmware, pas stockés en BDD)
            $networkFields = ['apn', 'sim_pin'];
            
            // Paramètres OTA (envoyés au firmware, pas stockés en BDD)
            $otaFields = ['ota_primary_url', 'ota_fallback_url', 'ota_md5'];
            
            // Combiner tous les champs
            $allConfigFields = array_merge($configFields, $airflowFields, $modemFields, $networkFields, $otaFields);
            
            foreach($allConfigFields as $field) {
                if (array_key_exists($field, $input) && $input[$field] !== null && $input[$field] !== '') {
                    $configPayload[$field] = $input[$field];
                }
            }
            
            if (!empty($configPayload)) {
                $cmdStmt = $pdo->prepare("
                    INSERT INTO device_commands (device_id, command, payload, status, created_at)
                    VALUES (:device_id, 'UPDATE_CONFIG', :payload::jsonb, 'pending', NOW())
                ");
                $cmdStmt->execute([
                    'device_id' => $device_id,
                    'payload' => json_encode($configPayload)
                ]);
                error_log("[Config Update] Commande UPDATE_CONFIG créée pour dispositif $device_id : " . json_encode($configPayload));
            }
            
            auditLog('device.config_updated', 'device', $device_id, $old_config, $input);
            echo json_encode(['success' => true, 'command_created' => !empty($configPayload)]);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
        }
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}
