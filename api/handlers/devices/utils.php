<?php
/**
 * API Handlers - Devices Utils
 * Fonctions utilitaires partagées pour la gestion des dispositifs
 */

require_once __DIR__ . '/../../helpers.php';

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

/**
 * Normalise la priorité d'une commande
 */
function normalizePriority($priority) {
    $allowed = ['low', 'normal', 'high', 'critical'];
    $priority = strtolower($priority ?? 'normal');
    return in_array($priority, $allowed) ? $priority : 'normal';
}

/**
 * Normalise le statut d'une commande
 */
function normalizeCommandStatus($status) {
    $allowed = ['pending','executing','executed','error','expired','cancelled'];
    $status = strtolower($status ?? '');
    return in_array($status, $allowed) ? $status : null;
}

/**
 * Décode JSON de manière sécurisée
 */
function safeJsonDecode($value) {
    if ($value === null || $value === '') {
        return null;
    }
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
}

/**
 * Expire les commandes dépassées
 */
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

/**
 * Formate une commande pour le dispositif (format simplifié)
 */
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

/**
 * Formate une commande pour le dashboard (format complet)
 */
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

/**
 * Récupère les commandes en attente pour un dispositif
 */
function fetchPendingCommandsForDevice($device_id, $limit = 5) {
    global $pdo;
    
    try {
        expireDeviceCommands($device_id);
    } catch (Exception $e) {
        // Log l'erreur mais continuer
        error_log('[fetchPendingCommandsForDevice] Erreur expireDeviceCommands: ' . $e->getMessage());
    }
    
    // Vérifier si une OTA est en attente et créer automatiquement la commande OTA_REQUEST
    try {
        $configStmt = $pdo->prepare("
            SELECT target_firmware_version, firmware_url, ota_pending
            FROM device_configurations
            WHERE device_id = :device_id AND ota_pending = TRUE
        ");
        $configStmt->execute(['device_id' => $device_id]);
        $config = $configStmt->fetch();
    } catch (Exception $e) {
        // Si la table ou colonne n'existe pas, ignorer et continuer
        error_log('[fetchPendingCommandsForDevice] Erreur vérification OTA: ' . $e->getMessage());
        $config = false;
    }
    
    if ($config && $config['ota_pending']) {
        try {
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
                try {
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
                        
                        // Insérer la commande OTA_REQUEST (syntaxe PostgreSQL)
                        $insertStmt = $pdo->prepare("
                            INSERT INTO device_commands (device_id, command, payload, priority, status, execute_after, expires_at)
                            VALUES (:device_id, 'OTA_REQUEST', :payload, 'high', 'pending', NOW(), NOW() + INTERVAL '24 HOURS')
                        ");
                        $insertStmt->execute([
                            'device_id' => $device_id,
                            'payload' => json_encode($otaPayload)
                        ]);
                    }
                } catch (Exception $e) {
                    // Si la table firmware_versions n'existe pas, ignorer
                    error_log('[fetchPendingCommandsForDevice] Erreur récupération firmware: ' . $e->getMessage());
                }
            }
        } catch (Exception $e) {
            // Si la table device_commands n'existe pas, ignorer
            error_log('[fetchPendingCommandsForDevice] Erreur vérification OTA command: ' . $e->getMessage());
        }
    }
    
    try {
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
        
        // Formater les commandes avec gestion d'erreur
        $formatted = [];
        foreach ($rows as $row) {
            try {
                $formatted[] = formatCommandForDevice($row);
            } catch (Exception $e) {
                error_log('[fetchPendingCommandsForDevice] Erreur formatage commande: ' . $e->getMessage());
                // Ignorer cette commande et continuer
            }
        }
        return $formatted;
    } catch (Exception $e) {
        // Si la table device_commands n'existe pas encore, retourner un tableau vide
        error_log('[fetchPendingCommandsForDevice] Erreur récupération commandes: ' . $e->getMessage());
        return [];
    }
}
