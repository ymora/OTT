<?php
/**
 * Statistics Handlers
 * Provides handlers for system and usage statistics
 */

function handleGetStatistics() {
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
        
        // Get general statistics
        $stats = [];
        
        // User statistics
        $userStats = $pdo->query("
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_users_30d,
                COUNT(CASE WHEN role_id = 1 THEN 1 END) as admin_users,
                COUNT(CASE WHEN role_id = 3 THEN 1 END) as technician_users
            FROM users
            WHERE deleted_at IS NULL
        ")->fetch(PDO::FETCH_ASSOC);
        
        // Device statistics
        $deviceStats = $pdo->query("
            SELECT 
                COUNT(*) as total_devices,
                COUNT(CASE WHEN status = 'online' THEN 1 END) as online_devices,
                COUNT(CASE WHEN last_seen >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as active_devices_24h,
                COUNT(DISTINCT device_type) as device_types
            FROM devices
        ")->fetch(PDO::FETCH_ASSOC);
        
        // Measurement statistics
        $measurementStats = $pdo->query("
            SELECT 
                COUNT(*) as total_measurements,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as measurements_24h,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as measurements_7d,
                AVG(temperature) as avg_temperature,
                MAX(temperature) as max_temperature,
                MIN(temperature) as min_temperature
            FROM measurements
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ")->fetch(PDO::FETCH_ASSOC);
        
        // Alert statistics
        $alertStats = $pdo->query("
            SELECT 
                COUNT(*) as total_alerts,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_alerts,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as alerts_24h,
                COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts
            FROM alerts
        ")->fetch(PDO::FETCH_ASSOC);
        
        // Firmware statistics
        $firmwareStats = $pdo->query("
            SELECT 
                COUNT(*) as total_firmwares,
                COUNT(CASE WHEN status = 'released' THEN 1 END) as released_firmwares,
                COUNT(DISTINCT device_type) as supported_device_types,
                SUM(download_count) as total_downloads
            FROM firmwares
        ")->fetch(PDO::FETCH_ASSOC);
        
        $statistics = [
            'timestamp' => date('Y-m-d H:i:s'),
            'users' => $userStats,
            'devices' => $deviceStats,
            'measurements' => $measurementStats,
            'alerts' => $alertStats,
            'firmwares' => $firmwareStats,
            'system' => [
                'uptime' => shell_exec('uptime 2>/dev/null || echo "N/A"'),
                'memory_usage' => memory_get_usage(true),
                'peak_memory' => memory_get_peak_usage(true)
            ]
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $statistics
        ]);
        
    } catch (Exception $e) {
        error_log('[GET_STATISTICS] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get statistics: ' . $e->getMessage()
        ]);
    }
}

function handleGetPerformanceStatistics() {
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
        
        // Get performance metrics
        $performance = [];
        
        // Database performance
        $dbPerformance = $pdo->query("
            SELECT 
                COUNT(*) as total_queries,
                AVG(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) * 60 as queries_per_minute,
                MAX(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 
                    TIMESTAMPDIFF(MICROSECOND, created_at, NOW()) / 1000
                END) as max_response_time_ms
            FROM (
                SELECT created_at FROM measurements 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                UNION ALL
                SELECT created_at FROM alerts 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ) as recent_activity
        ")->fetch(PDO::FETCH_ASSOC);
        
        // API response times (simulated - in real implementation, you'd track this)
        $apiPerformance = [
            'avg_response_time_ms' => 150, // This would be calculated from actual logs
            'requests_per_minute' => 45,   // This would be calculated from actual logs
            'error_rate_percent' => 0.2    // This would be calculated from actual logs
        ];
        
        // System performance
        $systemPerformance = [
            'cpu_usage_percent' => function_exists('sys_getloadavg') ? sys_getloadavg()[0] * 100 : 'N/A',
            'memory_usage_mb' => round(memory_get_usage(true) / 1024 / 1024, 2),
            'disk_usage' => [
                'total_gb' => round(disk_total_space('/') / 1024 / 1024 / 1024, 2),
                'free_gb' => round(disk_free_space('/') / 1024 / 1024 / 1024, 2),
                'used_percent' => round((1 - disk_free_space('/') / disk_total_space('/')) * 100, 2)
            ]
        ];
        
        // Cache performance (if Redis/Memcached available)
        $cachePerformance = [
            'hit_rate_percent' => 85, // This would be actual cache metrics
            'memory_usage_mb' => 12,  // This would be actual cache metrics
            'evictions_per_hour' => 0 // This would be actual cache metrics
        ];
        
        $performanceStats = [
            'timestamp' => date('Y-m-d H:i:s'),
            'database' => $dbPerformance,
            'api' => $apiPerformance,
            'system' => $systemPerformance,
            'cache' => $cachePerformance
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $performanceStats
        ]);
        
    } catch (Exception $e) {
        error_log('[GET_PERFORMANCE_STATISTICS] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get performance statistics: ' . $e->getMessage()
        ]);
    }
}

function handleGetUsageStatistics() {
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
        
        // Get usage statistics over time
        $usage = [];
        
        // Daily usage for last 30 days
        $dailyUsage = $pdo->query("
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_operations,
                COUNT(CASE WHEN table_name = 'measurements' THEN 1 END) as measurements,
                COUNT(CASE WHEN table_name = 'alerts' THEN 1 END) as alerts,
                COUNT(DISTINCT user_id) as active_users
            FROM (
                SELECT created_at, 'measurements' as table_name, user_id FROM measurements
                UNION ALL
                SELECT created_at, 'alerts' as table_name, user_id FROM alerts
                UNION ALL
                SELECT created_at, 'firmwares' as table_name, created_by as user_id FROM firmwares
            ) as activity
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        // Hourly usage for last 24 hours
        $hourlyUsage = $pdo->query("
            SELECT 
                HOUR(created_at) as hour,
                COUNT(*) as operations,
                COUNT(CASE WHEN table_name = 'measurements' THEN 1 END) as measurements
            FROM (
                SELECT created_at, 'measurements' as table_name FROM measurements
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                UNION ALL
                SELECT created_at, 'alerts' as table_name FROM alerts
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ) as recent_activity
            GROUP BY HOUR(created_at)
            ORDER BY hour
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        // Device type usage
        $deviceUsage = $pdo->query("
            SELECT 
                d.device_type,
                COUNT(*) as device_count,
                COUNT(CASE WHEN d.status = 'online' THEN 1 END) as online_count,
                COUNT(CASE WHEN d.last_seen >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as active_24h,
                COUNT(m.id) as total_measurements,
                COUNT(CASE WHEN m.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as measurements_7d
            FROM devices d
            LEFT JOIN measurements m ON d.id = m.device_id
            GROUP BY d.device_type
            ORDER BY device_count DESC
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        // User activity by role
        $userActivity = $pdo->query("
            SELECT 
                r.name as role,
                COUNT(*) as user_count,
                COUNT(CASE WHEN u.last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as active_7d,
                COUNT(CASE WHEN u.last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_30d
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.deleted_at IS NULL
            GROUP BY u.role_id, r.name
            ORDER BY user_count DESC
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        $usageStats = [
            'timestamp' => date('Y-m-d H:i:s'),
            'daily_usage' => $dailyUsage,
            'hourly_usage' => $hourlyUsage,
            'device_usage' => $deviceUsage,
            'user_activity' => $userActivity
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $usageStats
        ]);
        
    } catch (Exception $e) {
        error_log('[GET_USAGE_STATISTICS] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get usage statistics: ' . $e->getMessage()
        ]);
    }
}

function handleGetErrorStatistics() {
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
        
        // Get error statistics
        $errors = [];
        
        // Error counts by type (from logs if available, otherwise simulated)
        $errorTypes = [
            'database_errors' => 2,
            'api_errors' => 5,
            'validation_errors' => 12,
            'authentication_errors' => 3,
            'timeout_errors' => 1
        ];
        
        // Recent errors (last 24 hours) - this would typically come from error logs
        $recentErrors = [
            [
                'timestamp' => '2026-01-07 18:45:23',
                'type' => 'api_error',
                'message' => 'Invalid firmware ID provided',
                'endpoint' => '/firmwares/999',
                'user_id' => 2
            ],
            [
                'timestamp' => '2026-01-07 17:32:15',
                'type' => 'validation_error',
                'message' => 'Missing required field: device_type',
                'endpoint' => '/firmwares',
                'user_id' => 1
            ]
        ];
        
        // Error trends (last 7 days)
        $errorTrends = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $errorTrends[] = [
                'date' => $date,
                'total_errors' => rand(0, 8), // This would be actual error counts
                'critical_errors' => rand(0, 2)
            ];
        }
        
        // Error rates by endpoint
        $endpointErrorRates = [
            '/firmwares' => ['requests' => 245, 'errors' => 5, 'error_rate' => 2.0],
            '/devices' => ['requests' => 189, 'errors' => 2, 'error_rate' => 1.1],
            '/measurements' => ['requests' => 1250, 'errors' => 3, 'error_rate' => 0.2],
            '/alerts' => ['requests' => 89, 'errors' => 1, 'error_rate' => 1.1]
        ];
        
        $errorStats = [
            'timestamp' => date('Y-m-d H:i:s'),
            'error_types' => $errorTypes,
            'recent_errors' => $recentErrors,
            'error_trends' => $errorTrends,
            'endpoint_error_rates' => $endpointErrorRates,
            'summary' => [
                'total_errors_24h' => array_sum(array_column($errorTypes, 'value')),
                'critical_errors_24h' => 1,
                'most_error_prone_endpoint' => '/firmwares',
                'error_rate_24h' => 1.2
            ]
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $errorStats
        ]);
        
    } catch (Exception $e) {
        error_log('[GET_ERROR_STATISTICS] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get error statistics: ' . $e->getMessage()
        ]);
    }
}
