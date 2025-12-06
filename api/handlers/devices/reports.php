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
        ");
        $assignmentStmt->execute();

        echo json_encode([
            'success' => true,
            'overview' => $stats,
            'trend' => $trendStmt->fetchAll(),
            'top_devices' => $topDevicesStmt->fetchAll(),
            'severity_breakdown' => $severityStmt->fetchAll(),
            'assignments' => $assignmentStmt->fetchAll()
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}
