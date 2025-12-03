<?php
/**
 * API Handler - USB Logs (Logs USB pour monitoring à distance)
 * 
 * Endpoints:
 * - POST   /api.php/usb-logs          Enregistrer des logs USB (batch)
 * - GET    /api.php/usb-logs          Récupérer tous les logs (admin seulement)
 * - GET    /api.php/usb-logs/:device  Récupérer les logs d'un dispositif spécifique
 * - DELETE /api.php/usb-logs/cleanup  Nettoyer les vieux logs (admin seulement)
 */

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../helpers_sql.php';
require_once __DIR__ . '/../validators.php';

/**
 * Enregistrer des logs USB (batch)
 * POST /api.php/usb-logs
 * 
 * Body: {
 *   "device_identifier": "8933302400...",
 *   "device_name": "USB-1234",
 *   "logs": [
 *     { "log_line": "...", "log_source": "device", "timestamp": 1234567890000 },
 *     ...
 *   ]
 * }
 */
function createUsbLogs($pdo, $body, $userId) {
    // Validation
    if (!isset($body['device_identifier']) || empty($body['device_identifier'])) {
        return jsonError('device_identifier est requis', 400);
    }
    
    if (!isset($body['logs']) || !is_array($body['logs']) || count($body['logs']) === 0) {
        return jsonError('logs doit être un tableau non vide', 400);
    }
    
    $deviceIdentifier = trim($body['device_identifier']);
    $deviceName = isset($body['device_name']) ? trim($body['device_name']) : null;
    $logs = $body['logs'];
    
    // Limiter le nombre de logs par requête (éviter les abus)
    if (count($logs) > 100) {
        return jsonError('Maximum 100 logs par requête', 400);
    }
    
    try {
        $pdo->beginTransaction();
        
        $insertedCount = 0;
        $stmt = $pdo->prepare("
            INSERT INTO usb_logs (device_identifier, device_name, log_line, log_source, user_id, created_at)
            VALUES (:device_identifier, :device_name, :log_line, :log_source, :user_id, :created_at)
        ");
        
        foreach ($logs as $log) {
            if (!isset($log['log_line']) || empty(trim($log['log_line']))) {
                continue; // Ignorer les logs vides
            }
            
            $logLine = trim($log['log_line']);
            $logSource = isset($log['log_source']) ? trim($log['log_source']) : 'device';
            
            // Valider log_source
            if (!in_array($logSource, ['device', 'dashboard'])) {
                $logSource = 'device';
            }
            
            // Utiliser le timestamp fourni ou le timestamp actuel
            $timestamp = isset($log['timestamp']) && is_numeric($log['timestamp']) 
                ? date('Y-m-d H:i:s.u', $log['timestamp'] / 1000) 
                : date('Y-m-d H:i:s.u');
            
            $stmt->execute([
                ':device_identifier' => $deviceIdentifier,
                ':device_name' => $deviceName,
                ':log_line' => $logLine,
                ':log_source' => $logSource,
                ':user_id' => $userId,
                ':created_at' => $timestamp
            ]);
            
            $insertedCount++;
        }
        
        $pdo->commit();
        
        return jsonSuccess([
            'message' => "$insertedCount logs enregistrés avec succès",
            'inserted_count' => $insertedCount
        ], 201);
        
    } catch (PDOException $e) {
        $pdo->rollBack();
        error_log("Erreur création logs USB: " . $e->getMessage());
        return jsonError('Erreur lors de l\'enregistrement des logs', 500);
    }
}

/**
 * Récupérer les logs USB
 * GET /api.php/usb-logs?device=xxx&limit=100&offset=0&since=timestamp
 */
function getUsbLogs($pdo, $query, $userRole) {
    // Seuls les admins peuvent voir tous les logs
    if ($userRole !== 'admin') {
        return jsonError('Accès refusé. Seuls les administrateurs peuvent consulter les logs.', 403);
    }
    
    try {
        $conditions = [];
        $params = [];
        
        // Filtrer par dispositif
        if (isset($query['device']) && !empty($query['device'])) {
            $conditions[] = "device_identifier = :device";
            $params[':device'] = trim($query['device']);
        }
        
        // Filtrer par date (logs depuis un timestamp)
        if (isset($query['since']) && is_numeric($query['since'])) {
            $conditions[] = "created_at >= :since";
            $params[':since'] = date('Y-m-d H:i:s', $query['since'] / 1000);
        }
        
        // Filtrer par source
        if (isset($query['source']) && in_array($query['source'], ['device', 'dashboard'])) {
            $conditions[] = "log_source = :source";
            $params[':source'] = $query['source'];
        }
        
        // Limite et offset pour pagination
        $limit = isset($query['limit']) && is_numeric($query['limit']) ? min((int)$query['limit'], 1000) : 100;
        $offset = isset($query['offset']) && is_numeric($query['offset']) ? (int)$query['offset'] : 0;
        
        // Construire la requête
        $whereClause = count($conditions) > 0 ? 'WHERE ' . implode(' AND ', $conditions) : '';
        
        $sql = "
            SELECT 
                id,
                device_identifier,
                device_name,
                log_line,
                log_source,
                user_id,
                created_at,
                EXTRACT(EPOCH FROM created_at) * 1000 as timestamp_ms
            FROM usb_logs
            $whereClause
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        ";
        
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Compter le total pour la pagination
        $countSql = "SELECT COUNT(*) as total FROM usb_logs $whereClause";
        $countStmt = $pdo->prepare($countSql);
        foreach ($params as $key => $value) {
            $countStmt->bindValue($key, $value);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetch(PDO::FETCH_ASSOC)['total'];
        
        return jsonSuccess([
            'logs' => $logs,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total
        ]);
        
    } catch (PDOException $e) {
        error_log("Erreur récupération logs USB: " . $e->getMessage());
        return jsonError('Erreur lors de la récupération des logs', 500);
    }
}

/**
 * Récupérer les logs d'un dispositif spécifique
 * GET /api.php/usb-logs/:device
 */
function getDeviceUsbLogs($pdo, $deviceIdentifier, $query, $userRole) {
    // Seuls les admins peuvent voir les logs
    if ($userRole !== 'admin') {
        return jsonError('Accès refusé. Seuls les administrateurs peuvent consulter les logs.', 403);
    }
    
    // Ajouter le device identifier dans les paramètres de requête
    $query['device'] = $deviceIdentifier;
    
    return getUsbLogs($pdo, $query, $userRole);
}

/**
 * Nettoyer les vieux logs (plus de 7 jours)
 * DELETE /api.php/usb-logs/cleanup
 */
function cleanupUsbLogs($pdo, $userRole) {
    // Seuls les admins peuvent nettoyer les logs
    if ($userRole !== 'admin') {
        return jsonError('Accès refusé. Seuls les administrateurs peuvent nettoyer les logs.', 403);
    }
    
    try {
        $stmt = $pdo->query("SELECT cleanup_old_usb_logs() as deleted_count");
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $deletedCount = (int)$result['deleted_count'];
        
        return jsonSuccess([
            'message' => "$deletedCount logs supprimés avec succès",
            'deleted_count' => $deletedCount
        ]);
        
    } catch (PDOException $e) {
        error_log("Erreur nettoyage logs USB: " . $e->getMessage());
        return jsonError('Erreur lors du nettoyage des logs', 500);
    }
}

/**
 * Router principal pour les logs USB
 */
function handleUsbLogsRequest($pdo, $method, $path, $body, $query, $userId, $userRole) {
    // Retirer le préfixe /usb-logs
    $subPath = preg_replace('#^/usb-logs/?#', '', $path);
    
    switch ($method) {
        case 'POST':
            if (empty($subPath)) {
                return createUsbLogs($pdo, $body, $userId);
            }
            return jsonError('Endpoint non trouvé', 404);
            
        case 'GET':
            if (empty($subPath)) {
                return getUsbLogs($pdo, $query, $userRole);
            } elseif (!empty($subPath)) {
                // GET /usb-logs/:device
                return getDeviceUsbLogs($pdo, $subPath, $query, $userRole);
            }
            return jsonError('Endpoint non trouvé', 404);
            
        case 'DELETE':
            if ($subPath === 'cleanup') {
                return cleanupUsbLogs($pdo, $userRole);
            }
            return jsonError('Endpoint non trouvé', 404);
            
        default:
            return jsonError('Méthode non supportée', 405);
    }
}

