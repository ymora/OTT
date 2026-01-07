<?php
/**
 * API Handlers - Devices Reports
 * Génération de rapports et statistiques
 */

require_once __DIR__ . '/../../helpers.php';

/**
 * GET /api.php/reports/overview
 * Récupérer un aperçu général des rapports
 */
function handleGetReportsOverview() {
    global $pdo;
    requirePermission('reports.view');

    try {
        // Optimisation : requêtes combinées pour réduire les appels DB
        $statsQuery = $pdo->prepare("
            SELECT 
                (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_total,
                (SELECT COUNT(*) FROM devices WHERE status = 'active' AND deleted_at IS NULL) as devices_active,
                (SELECT COUNT(*) FROM alerts WHERE status = 'unresolved') as alerts_unresolved,
                (SELECT COUNT(*) FROM measurements WHERE timestamp >= NOW() - INTERVAL '24 HOURS') as measurements_24h,
                (SELECT COALESCE(AVG(flowrate), 0) FROM measurements WHERE timestamp >= NOW() - INTERVAL '24 HOURS') as avg_flowrate_24h,
                (SELECT COALESCE(AVG(battery), 0) FROM measurements WHERE battery IS NOT NULL AND timestamp >= NOW() - INTERVAL '24 HOURS') as avg_battery_24h
        ");
        $statsQuery->execute();
        $statsRow = $statsQuery->fetch();
        
        $stats = [
            'devices_total' => (int)$statsRow['devices_total'],
            'devices_active' => (int)$statsRow['devices_active'],
            'alerts_unresolved' => (int)$statsRow['alerts_unresolved'],
            'measurements_24h' => (int)$statsRow['measurements_24h'],
            'avg_flowrate_24h' => round((float)$statsRow['avg_flowrate_24h'], 2),
            'avg_battery_24h' => round((float)$statsRow['avg_battery_24h'], 2)
        ];

        // Utiliser prepare() pour toutes les requêtes (bonne pratique)
        $trendStmt = $pdo->prepare("
            SELECT DATE(timestamp) AS day,
                   ROUND(AVG(flowrate)::numeric, 2) AS avg_flowrate,
                   ROUND(AVG(battery)::numeric, 2) AS avg_battery
            FROM measurements
            WHERE timestamp >= NOW() - INTERVAL '7 DAYS'
            GROUP BY day
            ORDER BY day
        ");
        $trendStmt->execute();

        $topDevicesStmt = $pdo->prepare("
            SELECT d.id, d.device_name, d.sim_iccid, d.latitude, d.longitude, d.status,
                   ROUND(AVG(m.flowrate)::numeric, 2) AS avg_flowrate,
                   ROUND(AVG(m.battery)::numeric, 2) AS avg_battery,
                   MAX(m.timestamp) AS last_measurement
            FROM devices d
            LEFT JOIN measurements m ON m.device_id = d.id
            WHERE d.deleted_at IS NULL
            GROUP BY d.id
            ORDER BY last_measurement DESC NULLS LAST
            LIMIT 5
        ");
        $topDevicesStmt->execute();

        $severityStmt = $pdo->prepare("
            SELECT severity, COUNT(*) AS count
            FROM alerts
            WHERE status = 'unresolved'
            GROUP BY severity
        ");
        $severityStmt->execute();

        // Pagination pour les assignations (limiter à 100 pour éviter les grandes listes)
        $assignmentLimit = isset($_GET['assignment_limit']) ? min(intval($_GET['assignment_limit']), 500) : 100;
        $assignmentOffset = isset($_GET['assignment_offset']) ? max(0, intval($_GET['assignment_offset'])) : 0;
        
        $assignmentStmt = $pdo->prepare("
            SELECT p.id AS patient_id,
                   p.first_name,
                   p.last_name,
                   d.device_name,
                   d.sim_iccid,
                   d.status,
                   d.last_seen
            FROM patients p
            LEFT JOIN devices d ON d.patient_id = p.id AND d.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
            ORDER BY p.last_name, p.first_name
            LIMIT :limit OFFSET :offset
        ");
        $assignmentStmt->bindValue(':limit', $assignmentLimit, PDO::PARAM_INT);
        $assignmentStmt->bindValue(':offset', $assignmentOffset, PDO::PARAM_INT);
        $assignmentStmt->execute();

        // Compter le total des assignations pour la pagination
        $assignmentCountStmt = $pdo->prepare("
            SELECT COUNT(DISTINCT p.id)
            FROM patients p
            LEFT JOIN devices d ON d.patient_id = p.id AND d.deleted_at IS NULL
            WHERE p.deleted_at IS NULL
        ");
        $assignmentCountStmt->execute();
        $assignmentTotal = intval($assignmentCountStmt->fetchColumn());

        echo json_encode([
            'success' => true,
            'overview' => $stats,
            'trend' => $trendStmt->fetchAll(),
            'top_devices' => $topDevicesStmt->fetchAll(),
            'severity_breakdown' => $severityStmt->fetchAll(),
            'assignments' => $assignmentStmt->fetchAll(),
            'assignments_pagination' => [
                'total' => $assignmentTotal,
                'limit' => $assignmentLimit,
                'offset' => $assignmentOffset,
                'has_more' => ($assignmentOffset + $assignmentLimit) < $assignmentTotal
            ]
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

/**
 * GET /api.php/devices/:id/reports
 */
function handleGetDeviceReports($device_id) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("
            SELECT * FROM device_reports 
            WHERE device_id = ? 
            ORDER BY created_at DESC 
            LIMIT 20
        ");
        $stmt->execute([$device_id]);
        echo json_encode(['success' => true, 'reports' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch(PDOException $e) {
        // Table might not exist, return empty array
        echo json_encode(['success' => true, 'reports' => []]);
    }
}

/**
 * POST /api.php/devices/:id/reports/generate
 */
function handleGenerateDeviceReport($device_id) {
    global $pdo;
    requirePermission('reports.view');
    
    try {
        // Get device info
        $deviceStmt = $pdo->prepare("SELECT * FROM devices WHERE id = ? OR device_identifier = ?");
        $deviceStmt->execute([$device_id, $device_id]);
        $device = $deviceStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$device) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Device not found']);
            return;
        }
        
        // Get measurements stats for last 30 days
        $statsStmt = $pdo->prepare("
            SELECT 
                COUNT(*) as measurement_count,
                COALESCE(AVG(flowrate), 0) as avg_flowrate,
                COALESCE(AVG(battery), 0) as avg_battery,
                MIN(timestamp) as first_measurement,
                MAX(timestamp) as last_measurement
            FROM measurements 
            WHERE device_id = ? AND timestamp >= NOW() - INTERVAL '30 DAYS'
        ");
        $statsStmt->execute([$device['id']]);
        $stats = $statsStmt->fetch(PDO::FETCH_ASSOC);
        
        // Get alerts count
        $alertsStmt = $pdo->prepare("SELECT COUNT(*) FROM alerts WHERE device_id = ? AND created_at >= NOW() - INTERVAL '30 DAYS'");
        $alertsStmt->execute([$device['id']]);
        $alertsCount = $alertsStmt->fetchColumn();
        
        $report = [
            'device' => $device,
            'period' => '30 days',
            'stats' => $stats,
            'alerts_count' => (int)$alertsCount,
            'generated_at' => date('c')
        ];
        
        echo json_encode(['success' => true, 'report' => $report]);
    } catch(PDOException $e) {
        http_response_code(500);
        error_log('[handleGenerateDeviceReport] ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}
