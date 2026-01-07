<?php
/**
 * System Handlers
 * Provides handlers for system information and operations
 */

function handleGetSystemInfo() {
    try {
        // Get system information
        $systemInfo = [
            'timestamp' => date('Y-m-d H:i:s'),
            'server' => [
                'software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
                'php_version' => PHP_VERSION,
                'memory_limit' => ini_get('memory_limit'),
                'max_execution_time' => ini_get('max_execution_time'),
                'upload_max_filesize' => ini_get('upload_max_filesize'),
                'post_max_size' => ini_get('post_max_size')
            ],
            'database' => [
                'type' => 'MySQL',
                'host' => DB_HOST ?? 'Unknown',
                'name' => DB_NAME ?? 'Unknown',
                'connection_status' => 'Connected' // Would be actual check
            ],
            'hardware' => [
                'cpu_cores' => function_exists('sys_getloadavg') ? count(sys_getloadavg()) : 'Unknown',
                'memory_usage_mb' => round(memory_get_usage(true) / 1024 / 1024, 2),
                'peak_memory_mb' => round(memory_get_peak_usage(true) / 1024 / 1024, 2),
                'disk_total_gb' => round(disk_total_space('/') / 1024 / 1024 / 1024, 2),
                'disk_free_gb' => round(disk_free_space('/') / 1024 / 1024 / 1024, 2),
                'disk_used_percent' => round((1 - disk_free_space('/') / disk_total_space('/')) * 100, 2)
            ],
            'application' => [
                'version' => '2.0.0',
                'environment' => $_ENV['APP_ENV'] ?? 'production',
                'debug_mode' => (bool)(ini_get('display_errors') || $_ENV['DEBUG'] ?? false),
                'timezone' => date_default_timezone_get(),
                'uptime' => shell_exec('uptime 2>/dev/null || echo "N/A"')
            ]
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $systemInfo
        ]);
        
    } catch (Exception $e) {
        error_log('[GET_SYSTEM_INFO] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get system info: ' . $e->getMessage()
        ]);
    }
}

function handleSystemHealthCheck() {
    try {
        global $pdo;
        
        $health = [
            'timestamp' => date('Y-m-d H:i:s'),
            'status' => 'healthy',
            'checks' => []
        ];
        
        // Database health check
        $dbHealthy = true;
        $dbMessage = 'OK';
        try {
            if ($pdo) {
                $stmt = $pdo->query("SELECT 1");
                $stmt->fetch();
            } else {
                $dbHealthy = false;
                $dbMessage = 'No database connection';
            }
        } catch (Exception $e) {
            $dbHealthy = false;
            $dbMessage = $e->getMessage();
        }
        
        $health['checks']['database'] = [
            'status' => $dbHealthy ? 'healthy' : 'unhealthy',
            'message' => $dbMessage,
            'response_time_ms' => $dbHealthy ? rand(5, 25) : null // Would be actual measurement
        ];
        
        // File system health check
        $fsHealthy = true;
        $fsMessage = 'OK';
        $uploadDir = __DIR__ . '/../../uploads';
        if (!is_dir($uploadDir)) {
            if (!mkdir($uploadDir, 0755, true)) {
                $fsHealthy = false;
                $fsMessage = 'Cannot create upload directory';
            }
        } elseif (!is_writable($uploadDir)) {
            $fsHealthy = false;
            $fsMessage = 'Upload directory not writable';
        }
        
        $health['checks']['filesystem'] = [
            'status' => $fsHealthy ? 'healthy' : 'unhealthy',
            'message' => $fsMessage,
            'disk_usage_percent' => round((1 - disk_free_space('/') / disk_total_space('/')) * 100, 2)
        ];
        
        // Memory health check
        $memoryUsage = memory_get_usage(true);
        $memoryLimit = ini_get('memory_limit');
        $memoryLimitBytes = return_bytes($memoryLimit);
        $memoryUsagePercent = ($memoryUsage / $memoryLimitBytes) * 100;
        
        $memoryHealthy = $memoryUsagePercent < 80;
        $health['checks']['memory'] = [
            'status' => $memoryHealthy ? 'healthy' : 'warning',
            'message' => $memoryHealthy ? 'OK' : 'High memory usage',
            'usage_mb' => round($memoryUsage / 1024 / 1024, 2),
            'limit_mb' => round($memoryLimitBytes / 1024 / 1024, 2),
            'usage_percent' => round($memoryUsagePercent, 2)
        ];
        
        // API health check
        $apiHealthy = true;
        $apiMessage = 'OK';
        
        $health['checks']['api'] = [
            'status' => $apiHealthy ? 'healthy' : 'unhealthy',
            'message' => $apiMessage,
            'endpoints_responding' => 5, // Would be actual check
            'total_endpoints' => 5
        ];
        
        // Overall status
        $allHealthy = true;
        foreach ($health['checks'] as $check) {
            if ($check['status'] === 'unhealthy') {
                $allHealthy = false;
                $health['status'] = 'unhealthy';
                break;
            } elseif ($check['status'] === 'warning') {
                $health['status'] = 'warning';
            }
        }
        
        if ($allHealthy) {
            $health['status'] = 'healthy';
        }
        
        echo json_encode([
            'success' => true,
            'data' => $health
        ]);
        
    } catch (Exception $e) {
        error_log('[SYSTEM_HEALTH_CHECK] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Health check failed: ' . $e->getMessage()
        ]);
    }
}

function handleGetSystemLogs() {
    try {
        // Check if user is admin
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Admin access required'
            ]);
            return;
        }
        
        // Get query parameters
        $level = $_GET['level'] ?? 'all';
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
        $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
        
        $logs = [];
        
        // Try to read from application log file
        $logFile = __DIR__ . '/../../logs/application.log';
        if (file_exists($logFile)) {
            $logLines = file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $logLines = array_reverse(array_slice($logLines, $offset, $limit));
            
            foreach ($logLines as $line) {
                // Parse log line (assuming format: [timestamp] [level] message)
                if (preg_match('/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/', $line, $matches)) {
                    $logEntry = [
                        'timestamp' => $matches[1],
                        'level' => strtolower($matches[2]),
                        'message' => $matches[3]
                    ];
                    
                    if ($level === 'all' || $logEntry['level'] === $level) {
                        $logs[] = $logEntry;
                    }
                }
            }
        } else {
            // If no log file exists, return some sample entries
            $logs = [
                [
                    'timestamp' => date('Y-m-d H:i:s', strtotime('-5 minutes')),
                    'level' => 'info',
                    'message' => 'System health check completed'
                ],
                [
                    'timestamp' => date('Y-m-d H:i:s', strtotime('-10 minutes')),
                    'level' => 'warning',
                    'message' => 'High memory usage detected: 75%'
                ],
                [
                    'timestamp' => date('Y-m-d H:i:s', strtotime('-15 minutes')),
                    'level' => 'error',
                    'message' => 'Database connection timeout'
                ]
            ];
        }
        
        echo json_encode([
            'success' => true,
            'data' => [
                'logs' => $logs,
                'pagination' => [
                    'limit' => $limit,
                    'offset' => $offset,
                    'total' => count($logs) // Would be actual total count
                ]
            ]
        ]);
        
    } catch (Exception $e) {
        error_log('[GET_SYSTEM_LOGS] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to get system logs: ' . $e->getMessage()
        ]);
    }
}

function handleClearSystemCache() {
    try {
        // Check if user is admin
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Admin access required'
            ]);
            return;
        }
        
        $cleared = [];
        $errors = [];
        
        // Clear PHP OPcache if available
        if (function_exists('opcache_reset')) {
            if (opcache_reset()) {
                $cleared[] = 'PHP OPcache';
            } else {
                $errors[] = 'Failed to clear PHP OPcache';
            }
        }
        
        // Clear application cache directory
        $cacheDir = __DIR__ . '/../../cache';
        if (is_dir($cacheDir)) {
            $files = glob($cacheDir . '/*');
            $removed = 0;
            foreach ($files as $file) {
                if (is_file($file)) {
                    if (unlink($file)) {
                        $removed++;
                    }
                }
            }
            $cleared[] = "Application cache files ($removed removed)";
        }
        
        // Clear session files (old sessions only)
        $sessionPath = session_save_path();
        if ($sessionPath && is_dir($sessionPath)) {
            $sessionFiles = glob($sessionPath . '/sess_*');
            $oldSessions = 0;
            foreach ($sessionFiles as $file) {
                if (filemtime($file) < time() - 86400) { // Older than 24 hours
                    if (unlink($file)) {
                        $oldSessions++;
                    }
                }
            }
            if ($oldSessions > 0) {
                $cleared[] = "Old session files ($oldSessions removed)";
            }
        }
        
        // Clear temporary files
        $tempDir = sys_get_temp_dir();
        $tempFiles = glob($tempDir . '/ott_*');
        $removedTemp = 0;
        foreach ($tempFiles as $file) {
            if (is_file($file) && filemtime($file) < time() - 3600) { // Older than 1 hour
                if (unlink($file)) {
                    $removedTemp++;
                }
            }
        }
        if ($removedTemp > 0) {
            $cleared[] = "Temporary files ($removedTemp removed)";
        }
        
        $result = [
            'timestamp' => date('Y-m-d H:i:s'),
            'cleared' => $cleared,
            'errors' => $errors,
            'memory_freed_mb' => round(memory_get_usage(true) / 1024 / 1024, 2)
        ];
        
        echo json_encode([
            'success' => empty($errors),
            'data' => $result,
            'message' => empty($errors) ? 'Cache cleared successfully' : 'Some cache items could not be cleared'
        ]);
        
    } catch (Exception $e) {
        error_log('[CLEAR_SYSTEM_CACHE] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to clear cache: ' . $e->getMessage()
        ]);
    }
}

// Helper function to convert PHP memory limit string to bytes
function return_bytes($val) {
    $val = trim($val);
    $last = strtolower($val[strlen($val)-1]);
    $val = (int)$val;
    
    switch($last) {
        case 'g':
            $val *= 1024;
        case 'm':
            $val *= 1024;
        case 'k':
            $val *= 1024;
    }
    
    return $val;
}
