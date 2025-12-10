<?php
/**
 * API Handlers - Devices Commands
 * Gestion des commandes envoyées aux dispositifs
 */

require_once __DIR__ . '/../../helpers.php';
require_once __DIR__ . '/utils.php';

/**
 * GET /api.php/devices/:iccid/commands/pending
 * Récupérer les commandes en attente pour un dispositif
 */
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

/**
 * POST /api.php/devices/:iccid/commands
 * Créer une commande pour un dispositif
 */
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

/**
 * GET /api.php/devices/:iccid/commands
 * Récupérer toutes les commandes d'un dispositif
 */
function handleGetDeviceCommands($iccid) {
    global $pdo;
    requireAdmin();
    
    $device = findDeviceByIdentifier($iccid, false);
    if (!$device) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Device not found']);
        return;
    }
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    // Si page est fourni, calculer offset
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    $statusFilter = isset($_GET['status']) ? normalizeCommandStatus($_GET['status']) : null;
    
    try {
        // Compter le total
        $countSql = "
            SELECT COUNT(*)
            FROM device_commands dc
            JOIN devices d ON dc.device_id = d.id
            WHERE dc.device_id = :device_id AND d.deleted_at IS NULL
        ";
        $countParams = ['device_id' => $device['id']];
        if ($statusFilter) {
            $countSql .= " AND dc.status = :status";
            $countParams['status'] = $statusFilter;
        }
        $countStmt = $pdo->prepare($countSql);
        foreach ($countParams as $key => $value) {
            $countStmt->bindValue(':' . $key, $value);
        }
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
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
        $sql .= " ORDER BY dc.created_at DESC LIMIT :limit OFFSET :offset";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $rows = $stmt->fetchAll();
        $totalPages = ceil($total / $limit);
        echo json_encode([
            'success' => true, 
            'commands' => array_map('formatCommandForDashboard', $rows),
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
 * GET /api.php/commands
 * Liste toutes les commandes (admin)
 */
function handleListAllCommands() {
    global $pdo;
    requireAdmin();
    
    $statusFilter = isset($_GET['status']) ? normalizeCommandStatus($_GET['status']) : null;
    $iccidFilter = $_GET['iccid'] ?? null;
    
    // Pagination
    $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 100;
    $offset = isset($_GET['offset']) ? max(0, intval($_GET['offset'])) : 0;
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    
    if ($page > 1 && $offset === 0) {
        $offset = ($page - 1) * $limit;
    }
    
    $currentUser = getCurrentUser();
    
    // Cache
    $cacheKey = SimpleCache::key('commands', [
        'limit' => $limit,
        'offset' => $offset,
        'status' => $statusFilter,
        'iccid' => $iccidFilter,
        'user_id' => $currentUser ? $currentUser['id'] : null
    ]);
    
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
        
        $totalPages = ceil($total / $limit);
        $response = [
            'success' => true, 
            'commands' => array_map('formatCommandForDashboard', $rows),
            'pagination' => [
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset,
                'page' => $page,
                'total_pages' => $totalPages,
                'has_next' => ($offset + $limit) < $total,
                'has_prev' => $offset > 0
            ]
        ];
        SimpleCache::set($cacheKey, $response, 30);
        echo json_encode($response);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

/**
 * POST /api.php/commands/acknowledge
 * Accuser réception d'une commande (par le dispositif)
 */
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
