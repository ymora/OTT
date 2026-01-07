<?php
/**
 * Database Audit Handlers
 * Provides handlers for database audit operations
 */

function handleDatabaseAudit() {
    try {
        global $pdo;
        
        // Check if database connection is available
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Database connection not available'
            ]);
            return;
        }
        
        // Get database statistics
        $stats = [];
        
        // Table sizes
        $tableStats = $pdo->query("
            SELECT 
                table_name as 'table',
                ROUND(((data_length + index_length) / 1024 / 1024), 2) as 'size_mb'
            FROM information_schema.tables 
            WHERE table_schema = DATABASE()
            ORDER BY (data_length + index_length) DESC
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        // Row counts
        $rowCounts = [];
        $tables = ['users', 'devices', 'measurements', 'alerts', 'firmwares'];
        
        foreach ($tables as $table) {
            try {
                $count = $pdo->query("SELECT COUNT(*) as count FROM `$table`")->fetchColumn();
                $rowCounts[$table] = $count;
            } catch (Exception $e) {
                $rowCounts[$table] = 'N/A';
            }
        }
        
        // Recent activity
        $recentActivity = $pdo->query("
            SELECT 'measurements' as type, COUNT(*) as count, DATE(created_at) as date
            FROM measurements 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
            LIMIT 7
        ")->fetchAll(PDO::FETCH_ASSOC);
        
        $audit = [
            'timestamp' => date('Y-m-d H:i:s'),
            'database' => [
                'name' => DB_NAME,
                'host' => DB_HOST,
                'tables' => $tableStats,
                'row_counts' => $rowCounts,
                'total_size_mb' => array_sum(array_column($tableStats, 'size_mb'))
            ],
            'activity' => $recentActivity,
            'health' => [
                'connection' => 'OK',
                'last_check' => date('Y-m-d H:i:s')
            ]
        ];
        
        echo json_encode([
            'success' => true,
            'data' => $audit
        ]);
        
    } catch (Exception $e) {
        error_log('[DATABASE_AUDIT] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database audit failed: ' . $e->getMessage()
        ]);
    }
}

function handleRunDatabaseAudit() {
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
        
        // Perform comprehensive database audit
        $audit = [];
        
        // Check table structures
        $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        
        foreach ($tables as $table) {
            $columns = $pdo->query("DESCRIBE `$table`")->fetchAll(PDO::FETCH_ASSOC);
            $indexes = $pdo->query("SHOW INDEX FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
            
            $audit['tables'][$table] = [
                'columns' => count($columns),
                'indexes' => count($indexes),
                'engine' => $pdo->query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$table'")->fetchColumn(),
                'size' => $pdo->query("SELECT ROUND(((data_length + index_length) / 1024 / 1024), 2) as size FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$table'")->fetchColumn()
            ];
        }
        
        // Check for potential issues
        $issues = [];
        
        // Check for large tables (>100MB)
        foreach ($audit['tables'] as $name => $info) {
            if ($info['size'] > 100) {
                $issues[] = "Table '$name' is large ({$info['size']}MB)";
            }
        }
        
        // Check for missing indexes
        $audit['recommendations'] = $issues;
        $audit['timestamp'] = date('Y-m-d H:i:s');
        
        echo json_encode([
            'success' => true,
            'data' => $audit
        ]);
        
    } catch (Exception $e) {
        error_log('[RUN_DATABASE_AUDIT] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database audit failed: ' . $e->getMessage()
        ]);
    }
}

function handleRepairDatabaseAudit() {
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
        
        // Only allow admin users
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Admin access required'
            ]);
            return;
        }
        
        $repairs = [];
        
        // Optimize tables
        $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tables as $table) {
            try {
                $pdo->query("OPTIMIZE TABLE `$table`");
                $repairs[] = "Optimized table: $table";
            } catch (Exception $e) {
                $repairs[] = "Failed to optimize $table: " . $e->getMessage();
            }
        }
        
        echo json_encode([
            'success' => true,
            'data' => [
                'repairs' => $repairs,
                'timestamp' => date('Y-m-d H:i:s')
            ]
        ]);
        
    } catch (Exception $e) {
        error_log('[REPAIR_DATABASE_AUDIT] Error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database repair failed: ' . $e->getMessage()
        ]);
    }
}