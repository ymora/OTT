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

/**
 * Enregistrer des logs USB (batch)
 */
function createUsbLogs($pdo, $body, $userId) {
    // Accepter les logs même sans authentification (pour USB local)
    // $userId peut être null si pas authentifié, c'est acceptable pour les logs USB
    
    // Validation stricte
    if (!isset($body['device_identifier']) || empty(trim($body['device_identifier']))) {
        http_response_code(400);
        header('Content-Type: application/json');
        return json_encode(['success' => false, 'error' => 'device_identifier est requis']);
    }
    
    if (!isset($body['logs']) || !is_array($body['logs']) || count($body['logs']) === 0) {
        http_response_code(400);
        return json_encode(['success' => false, 'error' => 'logs doit être un tableau non vide']);
    }
    
    // Sanitization
    $deviceIdentifier = htmlspecialchars(trim($body['device_identifier']), ENT_QUOTES, 'UTF-8');
    $deviceName = isset($body['device_name']) ? htmlspecialchars(trim($body['device_name']), ENT_QUOTES, 'UTF-8') : null;
    $logs = $body['logs'];
    
    // Validation longueur
    if (strlen($deviceIdentifier) > 255) {
        http_response_code(400);
        return json_encode(['success' => false, 'error' => 'device_identifier trop long']);
    }
    
    // Limiter le nombre de logs par requête
    if (count($logs) > 100) {
        http_response_code(400);
        return json_encode(['success' => false, 'error' => 'Maximum 100 logs par requête']);
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
                continue;
            }
            
            // Sanitization XSS
            $logLine = htmlspecialchars(trim($log['log_line']), ENT_QUOTES, 'UTF-8');
            $logSource = isset($log['log_source']) ? trim($log['log_source']) : 'device';
            
            // Validation stricte
            if (!in_array($logSource, ['device', 'dashboard'], true)) {
                $logSource = 'device';
            }
            
            // Validation longueur
            if (strlen($logLine) > 5000) {
                continue; // Ignorer logs trop longs (protection)
            }
            
            $timestamp = isset($log['timestamp']) && is_numeric($log['timestamp']) 
                ? date('Y-m-d H:i:s.u', $log['timestamp'] / 1000) 
                : date('Y-m-d H:i:s.u');
            
            // $userId peut être null pour les logs USB locaux
            $stmt->execute([
                ':device_identifier' => $deviceIdentifier,
                ':device_name' => $deviceName,
                ':log_line' => $logLine,
                ':log_source' => $logSource,
                ':user_id' => $userId, // null acceptable pour logs USB sans auth
                ':created_at' => $timestamp
            ]);
            
            $insertedCount++;
        }
        
        $pdo->commit();
        
        http_response_code(201);
        header('Content-Type: application/json');
        return json_encode([
            'success' => true,
            'message' => "$insertedCount logs enregistrés avec succès",
            'inserted_count' => $insertedCount
        ]);
        
    } catch (PDOException $e) {
        $pdo->rollBack();
        $errorMsg = "Erreur création logs USB: " . $e->getMessage();
        error_log($errorMsg);
        http_response_code(500);
        header('Content-Type: application/json');
        return json_encode([
            'success' => false, 
            'error' => 'Erreur lors de l\'enregistrement des logs',
            'details' => getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : null
        ]);
    } catch (Exception $e) {
        $errorMsg = "Erreur inattendue création logs USB: " . $e->getMessage();
        error_log($errorMsg);
        http_response_code(500);
        header('Content-Type: application/json');
        return json_encode([
            'success' => false, 
            'error' => 'Erreur inattendue lors de l\'enregistrement des logs',
            'details' => getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : null
        ]);
    }
}

/**
 * Récupérer les logs USB
 */
function getUsbLogs($pdo, $query, $userRole) {
    // Seuls les admins peuvent voir tous les logs
    if ($userRole !== 'admin') {
        http_response_code(403);
        return json_encode(['success' => false, 'error' => 'Accès refusé. Seuls les administrateurs peuvent consulter les logs.']);
    }
    
    try {
        $conditions = [];
        $params = [];
        
        if (isset($query['device']) && !empty($query['device'])) {
            $conditions[] = "device_identifier = :device";
            $params[':device'] = trim($query['device']);
        }
        
        if (isset($query['since']) && is_numeric($query['since'])) {
            $conditions[] = "created_at >= :since";
            $params[':since'] = date('Y-m-d H:i:s', $query['since'] / 1000);
        }
        
        if (isset($query['source']) && in_array($query['source'], ['device', 'dashboard'])) {
            $conditions[] = "log_source = :source";
            $params[':source'] = $query['source'];
        }
        
        $limit = isset($query['limit']) && is_numeric($query['limit']) ? min((int)$query['limit'], 1000) : 100;
        $offset = isset($query['offset']) && is_numeric($query['offset']) ? (int)$query['offset'] : 0;
        
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
        
        $countSql = "SELECT COUNT(*) as total FROM usb_logs $whereClause";
        $countStmt = $pdo->prepare($countSql);
        foreach ($params as $key => $value) {
            $countStmt->bindValue($key, $value);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetch(PDO::FETCH_ASSOC)['total'];
        
        http_response_code(200);
        return json_encode([
            'success' => true,
            'logs' => $logs,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => ($offset + $limit) < $total
        ]);
        
    } catch (PDOException $e) {
        error_log("Erreur récupération logs USB: " . $e->getMessage());
        http_response_code(500);
        return json_encode(['success' => false, 'error' => 'Erreur lors de la récupération des logs']);
    }
}

/**
 * Récupérer les logs d'un dispositif spécifique
 */
function getDeviceUsbLogs($pdo, $deviceIdentifier, $query, $userRole) {
    if ($userRole !== 'admin') {
        http_response_code(403);
        return json_encode(['success' => false, 'error' => 'Accès refusé. Seuls les administrateurs peuvent consulter les logs.']);
    }
    
    // Décoder l'identifiant du dispositif (URL decode)
    $deviceIdentifier = urldecode($deviceIdentifier);
    
    $query['device'] = $deviceIdentifier;
    return getUsbLogs($pdo, $query, $userRole);
}

/**
 * Nettoyer les vieux logs
 */
function cleanupUsbLogs($pdo, $userRole) {
    if ($userRole !== 'admin') {
        http_response_code(403);
        return json_encode(['success' => false, 'error' => 'Accès refusé. Seuls les administrateurs peuvent nettoyer les logs.']);
    }
    
    try {
        // Utiliser prepare() au lieu de query() pour la sécurité
        $stmt = $pdo->prepare("SELECT cleanup_old_usb_logs() as deleted_count");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $deletedCount = (int)$result['deleted_count'];
        
        http_response_code(200);
        return json_encode([
            'success' => true,
            'message' => "$deletedCount logs supprimés avec succès",
            'deleted_count' => $deletedCount
        ]);
        
    } catch (PDOException $e) {
        error_log("Erreur nettoyage logs USB: " . $e->getMessage());
        http_response_code(500);
        return json_encode(['success' => false, 'error' => 'Erreur lors du nettoyage des logs']);
    }
}

/**
 * Router principal pour les logs USB
 */
function handleUsbLogsRequest($pdo, $method, $path, $body, $query, $userId, $userRole) {
    // Nettoyer le buffer de sortie AVANT tout header
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    // Définir le Content-Type JSON AVANT tout autre output
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    
    $subPath = preg_replace('#^/usb-logs/?#', '', $path);
    
    switch ($method) {
        case 'POST':
            if (empty($subPath)) {
                return createUsbLogs($pdo, $body, $userId);
            }
            http_response_code(404);
            return json_encode(['success' => false, 'error' => 'Endpoint non trouvé']);
            
        case 'GET':
            if (empty($subPath)) {
                return getUsbLogs($pdo, $query, $userRole);
            } elseif (!empty($subPath)) {
                return getDeviceUsbLogs($pdo, $subPath, $query, $userRole);
            }
            http_response_code(404);
            return json_encode(['success' => false, 'error' => 'Endpoint non trouvé']);
            
        case 'DELETE':
            if ($subPath === 'cleanup') {
                return cleanupUsbLogs($pdo, $userRole);
            }
            http_response_code(404);
            return json_encode(['success' => false, 'error' => 'Endpoint non trouvé']);
            
        default:
            http_response_code(405);
            return json_encode(['success' => false, 'error' => 'Méthode non supportée']);
    }
}
