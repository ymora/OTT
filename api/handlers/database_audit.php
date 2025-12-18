<?php
/**
 * API Handlers - Database Audit
 * Audit complet du schéma de base de données
 */

function handleDatabaseAudit() {
    global $pdo;
    requireAdmin(); // Seuls les admins peuvent auditer la base de données
    
    // Définir le Content-Type JSON
    header('Content-Type: application/json; charset=utf-8');
    
    try {
        $results = [
            'connection' => ['status' => 'ok', 'message' => 'Connexion réussie'],
            'tables' => [],
            'columns' => [],
            'duplicates' => [],
            'missing' => [],
            'orphans' => [],
            'indexes' => [],
            'issues' => [],
            'warnings' => [],
            'score' => 10
        ];
        
        // 1. Test de connexion
        try {
            // SÉCURITÉ: Utiliser prepared statement même pour requête statique (bonne pratique)
            $stmt = $pdo->prepare("SELECT version()");
            $stmt->execute();
            $version = $stmt->fetchColumn();
            $results['connection']['version'] = $version;
        } catch(PDOException $e) {
            $results['connection'] = ['status' => 'error', 'message' => $e->getMessage()];
            $results['score'] = 0;
            echo json_encode(['success' => false, 'error' => 'Database connection failed', 'results' => $results]);
            return;
        }
        
        // 2. Tables attendues (depuis schema.sql)
        $expectedTables = [
            'roles', 'permissions', 'role_permissions',
            'users', 'patients', 'devices', 'measurements',
            'alerts', 'device_logs', 'device_configurations',
            'firmware_versions', 'firmware_compilations',
            'user_notifications_preferences', 'patient_notifications_preferences', 'notifications_queue',
            'audit_logs', 'usb_logs', 'device_commands'
        ];
        
        // Récupérer toutes les tables existantes
        // SÉCURITÉ: Utiliser prepared statement même pour requête statique (bonne pratique)
        $stmt = $pdo->prepare("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        ");
        $stmt->execute();
        $existingTables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        // Vérifier les tables attendues
        foreach ($expectedTables as $table) {
            $exists = in_array($table, $existingTables);
            $results['tables'][] = [
                'name' => $table,
                'exists' => $exists,
                'status' => $exists ? 'ok' : 'missing'
            ];
            if (!$exists) {
                $results['missing'][] = "Table manquante: $table";
                $results['issues'][] = "Table manquante: $table";
                $results['score'] -= 0.5;
            }
        }
        
        // Détecter les tables orphelines
        foreach ($existingTables as $table) {
            if (!in_array($table, $expectedTables)) {
                $results['orphans'][] = $table;
                $results['warnings'][] = "Table orpheline: $table (existe en DB mais pas dans schema.sql)";
            }
        }
        
        // 3. Détection colonnes en double (ex: birth_date vs date_of_birth)
        $tablesToCheck = ['patients', 'users', 'devices', 'measurements'];
        foreach ($tablesToCheck as $tableName) {
            if (in_array($tableName, $existingTables)) {
                $stmt = $pdo->prepare("
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = :table_name 
                    ORDER BY column_name
                ");
                $stmt->execute(['table_name' => $tableName]);
                $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
                
                // Vérifier spécifiquement birth_date vs date_of_birth dans patients
                if ($tableName === 'patients') {
                    $hasBirthDate = in_array('birth_date', $columns);
                    $hasDateOfBirth = in_array('date_of_birth', $columns);
                    
                    if ($hasBirthDate && $hasDateOfBirth) {
                        $results['duplicates'][] = [
                            'table' => 'patients',
                            'columns' => ['birth_date', 'date_of_birth'],
                            'issue' => 'DOUBLON CRITIQUE: birth_date et date_of_birth existent tous les deux'
                        ];
                        $results['issues'][] = "DOUBLON CRITIQUE: patients.birth_date et patients.date_of_birth";
                        $results['score'] -= 2;
                    }
                }
                
                $results['columns'][$tableName] = $columns;
            }
        }
        
        // 4. Vérification tables de notifications
        $notificationTables = ['user_notifications_preferences', 'patient_notifications_preferences', 'notifications_queue'];
        foreach ($notificationTables as $table) {
            if (!in_array($table, $existingTables)) {
                $results['issues'][] = "Table notifications manquante: $table";
                $results['score'] -= 1;
            }
        }
        
        // 5. Vérification index critiques
        $criticalIndexes = [
            ['table' => 'measurements', 'index' => 'idx_measurements_device_time'],
            ['table' => 'devices', 'index' => 'devices_pkey'],
            ['table' => 'users', 'index' => 'users_pkey'],
            ['table' => 'patients', 'index' => 'patients_pkey']
        ];
        
        foreach ($criticalIndexes as $idx) {
            $stmt = $pdo->prepare("
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes 
                    WHERE tablename = :table 
                    AND indexname = :index
                )
            ");
            $stmt->execute(['table' => $idx['table'], 'index' => $idx['index']]);
            $exists = $stmt->fetchColumn();
            $exists = ($exists === true || $exists === 't' || $exists === 1 || $exists === '1');
            
            $results['indexes'][] = [
                'table' => $idx['table'],
                'index' => $idx['index'],
                'exists' => $exists
            ];
            
            if (!$exists) {
                $results['warnings'][] = "Index manquant: {$idx['table']}.{$idx['index']}";
            }
        }
        
        // Calculer le score final (max 10)
        $results['score'] = max(0, min(10, $results['score']));
        
        // Déterminer le statut global
        $status = 'ok';
        if (count($results['issues']) > 0) {
            $status = count($results['duplicates']) > 0 ? 'critical' : 'warning';
        }
        
        echo json_encode([
            'success' => true,
            'status' => $status,
            'results' => $results,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database audit error',
            'message' => $e->getMessage()
        ]);
    }
}

