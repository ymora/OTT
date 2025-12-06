<?php
/**
 * API Handlers - Devices OTA
 * Gestion des mises à jour OTA (Over-The-Air)
 */

require_once __DIR__ . '/../../helpers.php';

/**
 * POST /api.php/devices/:device_id/ota
 * Déclencher une mise à jour OTA pour un dispositif
 */
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
