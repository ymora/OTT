<?php
/**
 * Handlers pour les migrations de base de données
 * Extrait de api.php pour modularisation
 */

// MIGRATION HANDLERS (conservés dans api.php pour compatibilité)
// ============================================================================

function handleRunMigration() {
    global $pdo;
    
    // Désactiver l'affichage des erreurs pour éviter qu'elles polluent la réponse JSON
    ini_set('display_errors', '0');
    error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE);
    
    try {
        // Vérifier les permissions
        $user = requireAuth();
        if ($user['role_name'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin requis.']);
            return;
        }
        
        // Lire le corps de la requête
        $body = json_decode(file_get_contents('php://input'), true);
        
        // Valider les entrées
        if (!isset($body['migration_file'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'migration_file requis']);
            return;
        }
        
        $migrationFile = $body['migration_file'];
        
        // Sécuriser le chemin du fichier
        $migrationDir = __DIR__ . '/../../sql/migrations';
        $fullPath = realpath($migrationDir . '/' . basename($migrationFile));
        
        if (!$fullPath || !str_starts_with($fullPath, realpath($migrationDir))) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Chemin de migration invalide']);
            return;
        }
        
        if (!file_exists($fullPath)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Fichier de migration non trouvé']);
            return;
        }
        
        // Exécuter la migration
        $logs = [];
        $startTime = microtime(true);
        
        error_log("[handleRunMigration] Début migration: {$migrationFile}");
        
        try {
            runSqlFile($pdo, $fullPath);
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            error_log("[handleRunMigration] ✅ Migration réussie en {$duration}ms");
            
            // Enregistrer la migration dans l'historique (si la table existe)
            try {
                $checkTable = $pdo->query("SHOW TABLES LIKE 'migration_history'");
                if ($checkTable->rowCount() > 0) {
                    $insertHistory = $pdo->prepare("
                        INSERT INTO migration_history (migration_file, executed_at, executed_by, duration_ms, success)
                        VALUES (?, NOW(), ?, ?, 1)
                    ");
                    $insertHistory->execute([
                        $migrationFile,
                        $user['id'],
                        $duration
                    ]);
                    error_log("[handleRunMigration] Migration enregistrée dans l'historique");
                }
            } catch (Exception $historyErr) {
                // Ne pas faire échouer la migration si l'enregistrement de l'historique échoue
                error_log("[handleRunMigration] ⚠️ Erreur enregistrement historique (non bloquant): " . $historyErr->getMessage());
            }
            
            echo json_encode([
                'success' => true,
                'message' => 'Migration exécutée avec succès',
                'migration_file' => $migrationFile,
                'duration_ms' => $duration
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            
        } catch (Exception $e) {
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            $errorMessage = $e->getMessage();
            $errorInfo = $pdo->errorInfo();
            
            error_log("[handleRunMigration] ❌ ERREUR PDO:");
            error_log("[handleRunMigration]   Code: {$errorCode}");
            error_log("[handleRunMigration]   Message: {$errorMessage}");
            error_log("[handleRunMigration]   PDO ErrorInfo: " . json_encode($errorInfo));
            
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Erreur lors de l\'exécution de la migration: ' . $errorMessage,
                'migration_file' => $migrationFile,
                'duration_ms' => $duration,
                'pdo_error' => $errorInfo
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        
    } catch (Exception $e) {
        $errorMessage = $e->getMessage();
        $errorCode = $e->getCode();
        $previousException = $e->getPrevious();
        
        error_log('[handleRunMigration] ❌ ERREUR: ' . $errorMessage);
        error_log('[handleRunMigration] Code: ' . $errorCode);
        error_log('[handleRunMigration] Stack trace: ' . $e->getTraceAsString());
        if ($previousException) {
            error_log('[handleRunMigration] Exception précédente: ' . $previousException->getMessage());
        }
        
        // Construire des logs détaillés
        $logs[] = "ERREUR FATAL: " . $errorMessage;
        $logs[] = "Code: " . $errorCode;
        $logs[] = "Fichier: " . $e->getFile() . ":" . $e->getLine();
        if ($previousException) {
            $logs[] = "Exception précédente: " . $previousException->getMessage();
        }
        
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Erreur fatale lors de la migration',
            'details' => $errorMessage,
            'logs' => $logs
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

function handleGetMigrationHistory() {
    global $pdo;
    
    try {
        $user = requireAuth();
        if ($user['role_name'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin requis.']);
            return;
        }
        
        $stmt = $pdo->query("
            SELECT id, migration_file, executed_at, executed_by, duration_ms, success
            FROM migration_history
            ORDER BY executed_at DESC
            LIMIT 100
        ");
        
        $migrations = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'migrations' => $migrations
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleDeleteMigration($id) {
    global $pdo;
    
    try {
        $user = requireAuth();
        if ($user['role_name'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin requis.']);
            return;
        }
        
        $stmt = $pdo->prepare("DELETE FROM migration_history WHERE id = ?");
        $stmt->execute([$id]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Entrée d\'historique supprimée'
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
