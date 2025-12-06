<?php
/**
 * API Handlers - Devices Alerts
 * Gestion des alertes des dispositifs
 */

require_once __DIR__ . '/../../helpers.php';

/**
 * Créer une alerte pour un dispositif (si elle n'existe pas déjà)
 */
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
        if (function_exists('triggerAlertNotifications')) {
            triggerAlertNotifications($pdo, $device_id, $type, $severity, $message);
        }
    } catch(PDOException $e) {
        // Ignorer les erreurs d'insertion d'alerte (non critique)
    }
}

/**
 * GET /api.php/alerts
 * Récupérer les alertes avec pagination et filtres
 */
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
        if ($status && in_array($status, ['unresolved', 'acknowledged'])) {
            $sql .= " AND a.status = :status";
            $params['status'] = $status;
        } else {
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
