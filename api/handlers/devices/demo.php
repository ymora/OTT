<?php
/**
 * API Handlers - Devices Demo
 * Fonctions de démonstration et reset
 */

require_once __DIR__ . '/../../helpers.php';

/**
 * POST /api.php/demo/reset
 * Réinitialiser la base de données de démonstration
 */
function handleResetDemo() {
    global $pdo;
    $user = requireAdmin();

    if (!ENABLE_DEMO_RESET) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Demo reset disabled on this instance']);
        return;
    }

    $tables = [
        'audit_logs',
        'notifications_queue',
        'device_commands',
        'device_logs',
        'alerts',
        'measurements',
        'firmware_versions',
        'device_configurations',
        'devices',
        'patients',
        'user_notifications_preferences',
        'users',
        'role_permissions',
        'permissions',
        'roles'
    ];

    // Whitelist des tables autorisées pour TRUNCATE (sécurité)
    $allowedTables = [
        'devices', 'measurements', 'alerts', 'device_commands', 'device_logs',
        'device_configurations', 'patients', 'users', 'user_notifications_preferences',
        'patient_notifications_preferences', 'notifications_queue', 'audit_logs',
        'firmware_versions', 'role_permissions', 'permissions', 'roles'
    ];
    
    // Valider que toutes les tables demandées sont dans la whitelist
    $invalidTables = array_diff($tables, $allowedTables);
    if (!empty($invalidTables)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Unauthorized table(s): ' . implode(', ', $invalidTables)
        ]);
        return;
    }

    $startedAt = microtime(true);

    try {
        // TRUNCATE sécurisé : tables validées via whitelist
        $pdo->exec('TRUNCATE TABLE ' . implode(', ', $tables) . ' RESTART IDENTITY CASCADE');
        runSqlFile($pdo, 'base_seed.sql');
        runSqlFile($pdo, 'demo_seed.sql');

        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
        auditLog('admin.reset_demo', 'system', null, null, ['duration_ms' => $durationMs]);

        echo json_encode([
            'success' => true,
            'message' => 'Base de démo réinitialisée',
            'meta' => [
                'duration_ms' => $durationMs,
                'tables_reset' => count($tables),
                'actor' => $user['email'] ?? null
            ]
        ]);
    } catch(Throwable $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Demo reset failed',
            'details' => $e->getMessage()
        ]);
    }
}
