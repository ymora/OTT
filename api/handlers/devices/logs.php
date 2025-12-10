<?php
/**
 * API Handlers - Devices Logs
 * Gestion des logs des dispositifs
 */

require_once __DIR__ . '/../../helpers.php';

/**
 * POST /api.php/logs
 * Recevoir un log d'un dispositif
 */
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
                $pdo->prepare("INSERT INTO devices (sim_iccid, device_name, device_serial, status, first_use_date) VALUES (:iccid, :device_name, :device_serial, 'active', NOW())")
                    ->execute([
                        'iccid' => $iccid,
                        'device_name' => $iccid,
                        'device_serial' => $iccid
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

/**
 * GET /api.php/logs
 * Récupérer les logs des dispositifs
 */
function handleGetLogs() {
    global $pdo;
    
    $device_id = isset($_GET['device_id']) ? intval($_GET['device_id']) : null;
    
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
        $countSql = "
            SELECT COUNT(*)
            FROM device_logs l
            JOIN devices d ON l.device_id = d.id
            WHERE d.deleted_at IS NULL
        ";
        $countParams = [];
        if ($device_id) {
            $countSql .= " AND l.device_id = :device_id";
            $countParams['device_id'] = $device_id;
        }
        $countStmt = $pdo->prepare($countSql);
        foreach ($countParams as $key => $value) {
            $countStmt->bindValue(':' . $key, $value);
        }
        $countStmt->execute();
        $total = intval($countStmt->fetchColumn());
        
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
        
        $sql .= " ORDER BY l.timestamp DESC LIMIT :limit OFFSET :offset";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue(':' . $key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $totalPages = ceil($total / $limit);
        echo json_encode([
            'success' => true, 
            'logs' => $stmt->fetchAll(),
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
