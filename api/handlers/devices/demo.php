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
        
        // Recréer les tables de notifications si elles ont été supprimées
        // Ceci garantit que les tables existent même après un TRUNCATE
        if (!tableExists('user_notifications_preferences') || !tableExists('patient_notifications_preferences')) {
            error_log('[handleResetDemo] Recréation des tables de notifications...');
            if (!ensureNotificationsTablesExist()) {
                throw new Exception('Failed to recreate notifications tables');
            }
            error_log('[handleResetDemo] Tables de notifications recréées avec succès');
        }
        
        // Exécuter les scripts seed s'ils existent
        if (file_exists(__DIR__ . '/../../../sql/base_seed.sql')) {
            runSqlFile($pdo, 'base_seed.sql');
        }
        if (file_exists(__DIR__ . '/../../../sql/demo_seed.sql')) {
            runSqlFile($pdo, 'demo_seed.sql');
        }

        $durationMs = (int) round((microtime(true) - $startedAt) * 1000);
        auditLog('admin.reset_demo', 'system', null, null, ['duration_ms' => $durationMs]);

        echo json_encode([
            'success' => true,
            'message' => 'Base de démo réinitialisée avec tables de notifications recréées',
            'meta' => [
                'duration_ms' => $durationMs,
                'tables_reset' => count($tables),
                'notifications_tables_recreated' => true,
                'actor' => $user['email'] ?? null
            ]
        ]);
    } catch(Throwable $e) {
        error_log('[handleResetDemo] Erreur: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Demo reset failed',
            'details' => getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Internal error'
        ]);
    }
}
