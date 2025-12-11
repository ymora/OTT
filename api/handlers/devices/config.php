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
        error_log("[Config Get] Erreur PDO: " . $e->getMessage());
        error_log("[Config Get] Code: " . $e->getCode());
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'error' => 'Database error',
            'details' => (getenv('DEBUG_ERRORS') === 'true') ? $e->getMessage() : 'Erreur base de données. Vérifiez les logs serveur.'
        ]);
    } catch(Exception $e) {
        error_log("[Config Get] Erreur générale: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'error' => 'Erreur serveur',
            'details' => (getenv('DEBUG_ERRORS') === 'true') ? $e->getMessage() : 'Erreur lors de la récupération. Vérifiez les logs serveur.'
        ]);
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
        // Créer les colonnes manquantes automatiquement si elles n'existent pas
        $columnsToAdd = [
            'roaming_enabled' => 'BOOLEAN DEFAULT true',
            'airflow_passes' => 'INTEGER',
            'airflow_samples_per_pass' => 'INTEGER',
            'airflow_delay_ms' => 'INTEGER',
            'watchdog_seconds' => 'INTEGER',
            'modem_boot_timeout_ms' => 'INTEGER',
            'sim_ready_timeout_ms' => 'INTEGER',
            'network_attach_timeout_ms' => 'INTEGER',
            'modem_max_reboots' => 'INTEGER',
            'apn' => 'VARCHAR(64)',
            'sim_pin' => 'VARCHAR(8)',
            'ota_primary_url' => 'TEXT',
            'ota_fallback_url' => 'TEXT',
            'ota_md5' => 'VARCHAR(32)'
        ];
        
        foreach ($columnsToAdd as $column => $type) {
            if (!columnExists('device_configurations', $column)) {
                try {
                    // Sécuriser le nom de colonne et le type (validation)
                    if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
                        throw new InvalidArgumentException("Invalid column name: $column");
                    }
                    // Utiliser un placeholder pour le nom de colonne (échappement PostgreSQL)
                    $escapedColumn = '"' . str_replace('"', '""', $column) . '"';
                    $escapedType = preg_match('/^(VARCHAR|TEXT|INTEGER|BIGINT|BOOLEAN|REAL|DOUBLE|NUMERIC|TIMESTAMP|DATE|TIME|JSONB|JSON)(\([0-9]+\))?$/i', $type) ? $type : 'TEXT';
                    $pdo->exec("ALTER TABLE device_configurations ADD COLUMN IF NOT EXISTS $escapedColumn $escapedType");
                    error_log("[Config] Colonne $column ajoutée automatiquement");
                } catch (PDOException $e) {
                    error_log("[Config] Erreur ajout colonne $column: " . $e->getMessage());
                } catch (InvalidArgumentException $e) {
                    error_log("[Config] Erreur validation colonne $column: " . $e->getMessage());
                }
            }
        }
        
        $stmt = $pdo->prepare("SELECT * FROM device_configurations WHERE device_id = :device_id");
        $stmt->execute(['device_id' => $device_id]);
        $old_config = $stmt->fetch();
        
        $updates = [];
        $params = ['device_id' => $device_id];
        
        // Vérifier si les colonnes existent en BDD (compatibilité migration)
        $hasGpsColumn = columnExists('device_configurations', 'gps_enabled');
        
        // Liste de TOUS les champs configurables (sauvegardés en BDD ET envoyés au firmware)
        // IMPORTANT: Tous les paramètres sont maintenant sauvegardés en BDD pour pouvoir
        // les recharger dans le modal, même si le firmware les gère aussi via NVS
        $fieldsToUpdate = [
            'sleep_minutes', 
            'measurement_duration_ms', 
            'send_every_n_wakeups', 
            'calibration_coefficients',
            // Paramètres réseau (GPS, Itinérance)
            'roaming_enabled',
            // Paramètres airflow
            'airflow_passes',
            'airflow_samples_per_pass',
            'airflow_delay_ms',
            // Paramètres modem
            'watchdog_seconds',
            'modem_boot_timeout_ms',
            'sim_ready_timeout_ms',
            'network_attach_timeout_ms',
            'modem_max_reboots',
            // Paramètres réseau
            'apn',
            'sim_pin',
            // Paramètres OTA
            'ota_primary_url',
            'ota_fallback_url',
            'ota_md5'
        ];
        if ($hasGpsColumn) {
            $fieldsToUpdate[] = 'gps_enabled';
        }
        
        // Vérifier si roaming_enabled existe en BDD (compatibilité migration)
        $hasRoamingColumn = columnExists('device_configurations', 'roaming_enabled');
        if ($hasRoamingColumn) {
            // Déjà dans la liste si la colonne existe
        }
        
        foreach($fieldsToUpdate as $field) {
            // Vérifier si la colonne existe en BDD (pour compatibilité avec anciennes migrations)
            if (!columnExists('device_configurations', $field)) {
                continue; // Ignorer les colonnes qui n'existent pas encore
            }
            
            if (array_key_exists($field, $input)) {
                if ($input[$field] === null || $input[$field] === '') {
                    $updates[] = "$field = NULL";
                } else {
                    $updates[] = "$field = :$field";
                    // Convertir les valeurs selon le type
                    if (is_array($input[$field])) {
                        $params[$field] = json_encode($input[$field]);
                    } elseif (in_array($field, ['airflow_passes', 'airflow_samples_per_pass', 'airflow_delay_ms', 
                                                'watchdog_seconds', 'modem_boot_timeout_ms', 'sim_ready_timeout_ms', 
                                                'network_attach_timeout_ms', 'modem_max_reboots', 'sleep_minutes', 
                                                'measurement_duration_ms', 'send_every_n_wakeups'])) {
                        $params[$field] = (int)$input[$field];
                    } elseif (in_array($field, ['gps_enabled', 'roaming_enabled'])) {
                        $params[$field] = (bool)$input[$field];
                    } else {
                        $params[$field] = (string)$input[$field];
                    }
                }
            }
        }
        
        $updates[] = "last_config_update = NOW()";
        
        if (count($updates) > 0) {
            try {
                $stmt = $pdo->prepare("UPDATE device_configurations SET " . implode(', ', $updates) . " WHERE device_id = :device_id");
                $stmt->execute($params);
                error_log("[Config Update] UPDATE réussi pour device_id=$device_id, " . count($updates) . " champ(s) mis à jour");
            } catch(PDOException $updateErr) {
                error_log("[Config Update] Erreur UPDATE SQL: " . $updateErr->getMessage());
                error_log("[Config Update] Requête: UPDATE device_configurations SET " . implode(', ', $updates) . " WHERE device_id = :device_id");
                error_log("[Config Update] Paramètres: " . json_encode($params));
                throw $updateErr; // Re-lancer pour être capturé par le catch global
            }
            
            // Créer une commande UPDATE_CONFIG pour envoyer la nouvelle config au firmware
            // Inclure TOUS les paramètres (même ceux non stockés en BDD)
            $configPayload = [];
            
            // Paramètres de base (stockés en BDD)
            $configFields = ['sleep_minutes', 'measurement_duration_ms', 'send_every_n_wakeups', 'calibration_coefficients'];
            if ($hasGpsColumn) {
                $configFields[] = 'gps_enabled';
            }
            if ($hasRoamingColumn) {
                $configFields[] = 'roaming_enabled';
            }
            
            // Paramètres airflow (envoyés au firmware, pas stockés en BDD)
            $airflowFields = ['airflow_passes', 'airflow_samples_per_pass', 'airflow_delay_ms'];
            
            // Paramètres modem (envoyés au firmware, pas stockés en BDD)
            $modemFields = ['watchdog_seconds', 'modem_boot_timeout_ms', 'sim_ready_timeout_ms', 'network_attach_timeout_ms', 'modem_max_reboots'];
            
            // Paramètres réseau (envoyés au firmware, pas stockés en BDD)
            $networkFields = ['apn', 'sim_pin'];
            // Note: roaming_enabled est dans $fieldsToUpdate (stocké en BDD)
            
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
            error_log("[Config Update] Aucun champ à mettre à jour pour device_id=$device_id");
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
        }
        
    } catch(PDOException $e) {
        error_log("[Config Update] Erreur PDO: " . $e->getMessage());
        error_log("[Config Update] Code: " . $e->getCode());
        error_log("[Config Update] Trace: " . $e->getTraceAsString());
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'error' => 'Database error',
            'details' => (getenv('DEBUG_ERRORS') === 'true') ? $e->getMessage() : 'Erreur base de données. Vérifiez les logs serveur.'
        ]);
    } catch(Exception $e) {
        error_log("[Config Update] Erreur générale: " . $e->getMessage());
        error_log("[Config Update] Trace: " . $e->getTraceAsString());
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'error' => 'Erreur serveur',
            'details' => (getenv('DEBUG_ERRORS') === 'true') ? $e->getMessage() : 'Erreur lors de la mise à jour. Vérifiez les logs serveur.'
        ]);
    }
}
