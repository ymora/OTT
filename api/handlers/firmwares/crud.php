<?php
/**
 * Firmware CRUD Handlers
 * Provides Create, Read, Update, Delete operations for firmwares
 */

function handleGetFirmwares() {
    try {
        global $pdo;
        
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection not available'
            ]);
            return;
        }
        
        // Pagination (style dashboard)
        $limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 500) : 100;
        $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : null;
        if ($page !== null && $offset === 0 && $page > 1) {
            $offset = ($page - 1) * $limit;
        }

        // Filters
        $where = [];
        $params = [];

        if (!empty($_GET['status'])) {
            $where[] = "status = ?";
            $params[] = $_GET['status'];
        }
        if (isset($_GET['is_stable']) && $_GET['is_stable'] !== '') {
            $where[] = "is_stable = ?";
            $params[] = ($_GET['is_stable'] === 'true' || $_GET['is_stable'] === '1') ? 1 : 0;
        }

        $whereClause = empty($where) ? '' : 'WHERE ' . implode(' AND ', $where);

        // Total count (table réelle: firmware_versions)
        $countQuery = "SELECT COUNT(*) FROM firmware_versions $whereClause";
        $totalStmt = $pdo->prepare($countQuery);
        $totalStmt->execute($params);
        $totalCount = (int)$totalStmt->fetchColumn();

        // List
        $query = "
            SELECT
                id,
                version,
                file_path,
                file_size,
                checksum,
                release_notes,
                is_stable,
                status,
                error_message,
                uploaded_by,
                created_at,
                updated_at
            FROM firmware_versions
            $whereClause
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ";

        $stmt = $pdo->prepare($query);
        $allParams = array_merge($params, [$limit, $offset]);
        $stmt->execute($allParams);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Compat dashboard: data.firmwares.firmwares
        echo json_encode([
            'success' => true,
            'data' => [
                'firmwares' => [
                    'firmwares' => $rows,
                    'pagination' => [
                        'limit' => $limit,
                        'offset' => $offset,
                        'total' => $totalCount,
                        'page' => $page,
                        'pages' => $page !== null ? (int)ceil($totalCount / $limit) : null,
                    ]
                ]
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
    } catch (Exception $e) {
        error_log('[GET_FIRMWARES] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get firmwares: ' . $e->getMessage()
        ]);
    }
}

function handleCreateFirmware() {
    try {
        global $pdo;
        
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection not available'
            ]);
            return;
        }
        
        // Get JSON input
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid JSON input'
            ]);
            return;
        }
        
        // Validate required fields
        $required = ['name', 'version', 'device_type'];
        foreach ($required as $field) {
            if (empty($input[$field])) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'error' => "Field '$field' is required"
                ]);
                return;
            }
        }
        
        // Insert firmware
        $query = "
            INSERT INTO firmware_versions (
                name, version, device_type, description, 
                status, created_at, created_by
            ) VALUES (?, ?, ?, ?, 'draft', NOW(), ?)
        ";
        
        $stmt = $pdo->prepare($query);
        $stmt->execute([
            $input['name'],
            $input['version'],
            $input['device_type'],
            $input['description'] ?? '',
            $_SESSION['user_id'] ?? null
        ]);
        
        $firmwareId = $pdo->lastInsertId();
        
        echo json_encode([
            'success' => true,
            'data' => [
                'id' => $firmwareId,
                'message' => 'Firmware created successfully'
            ]
        ]);
        
    } catch (Exception $e) {
        error_log('[CREATE_FIRMWARE] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to create firmware: ' . $e->getMessage()
        ]);
    }
}

function handleUpdateFirmware($firmwareId) {
    try {
        global $pdo;
        
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection not available'
            ]);
            return;
        }
        
        // Check if firmware exists
        $check = $pdo->prepare("SELECT id FROM firmware_versions WHERE id = ?");
        $check->execute([$firmwareId]);
        
        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Firmware not found'
            ]);
            return;
        }
        
        // Get JSON input
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid JSON input'
            ]);
            return;
        }
        
        // Build update query
        $updates = [];
        $params = [];
        
        $allowedFields = ['name', 'version', 'device_type', 'description', 'status'];
        
        foreach ($allowedFields as $field) {
            if (isset($input[$field])) {
                $updates[] = "$field = ?";
                $params[] = $input[$field];
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'No valid fields to update'
            ]);
            return;
        }
        
        $updates[] = "updated_at = NOW()";
        $params[] = $firmwareId;
        
        $query = "UPDATE firmware_versions SET " . implode(', ', $updates) . " WHERE id = ?";
        
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        
        echo json_encode([
            'success' => true,
            'data' => [
                'message' => 'Firmware updated successfully'
            ]
        ]);
        
    } catch (Exception $e) {
        error_log('[UPDATE_FIRMWARE] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to update firmware: ' . $e->getMessage()
        ]);
    }
}

function handleDeleteFirmware($firmwareId) {
    try {
        global $pdo;
        
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection not available'
            ]);
            return;
        }
        
        // Check if firmware exists
        $check = $pdo->prepare("SELECT id, file_path FROM firmware_versions WHERE id = ?");
        $check->execute([$firmwareId]);
        $firmware = $check->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Firmware not found'
            ]);
            return;
        }
        
        // Check if firmware is in use
        $usageCheck = $pdo->prepare("
            SELECT COUNT(*) FROM devices 
            WHERE current_firmware_id = ? OR target_firmware_id = ?
        ");
        $usageCheck->execute([$firmwareId, $firmwareId]);
        $usageCount = $usageCheck->fetchColumn();
        
        if ($usageCount > 0) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Cannot delete firmware: it is in use by ' . $usageCount . ' device(s)'
            ]);
            return;
        }
        
        // Delete firmware record
        $delete = $pdo->prepare("DELETE FROM firmware_versions WHERE id = ?");
        $delete->execute([$firmwareId]);
        
        // Delete physical file if exists
        if (!empty($firmware['file_path']) && file_exists($firmware['file_path'])) {
            unlink($firmware['file_path']);
        }
        
        echo json_encode([
            'success' => true,
            'data' => [
                'message' => 'Firmware deleted successfully'
            ]
        ]);
        
    } catch (Exception $e) {
        error_log('[DELETE_FIRMWARE] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to delete firmware: ' . $e->getMessage()
        ]);
    }
}

function handleCheckFirmwareVersion($version) {
    try {
        global $pdo;

        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection not available'
            ]);
            return;
        }

        $version = trim((string)$version);
        if ($version === '') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Version is required'
            ]);
            return;
        }

        $stmt = $pdo->prepare('SELECT id, version, file_path, file_size, checksum, release_notes, is_stable, status, created_at, updated_at FROM firmware_versions WHERE version = :version LIMIT 1');
        $stmt->execute(['version' => $version]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'exists' => (bool)$firmware,
            'firmware' => $firmware ?: null
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch (Exception $e) {
        error_log('[CHECK_FIRMWARE_VERSION] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to check firmware version: ' . $e->getMessage()
        ]);
    }
}