<?php
/**
 * Initialisation automatique de la base de données
 * Fallback minimal si le schéma SQL n'a pas été appliqué
 * NOTE: Le schéma complet doit être appliqué via sql/schema.sql pour une base neuve
 */

function initDatabaseIfEmpty() {
    global $pdo;
    
    try {
        // Vérifier si les tables existent (si aucune table, le schéma n'a pas été appliqué)
        $tablesCheck = $pdo->prepare("
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('roles', 'users', 'devices', 'patients', 'firmware_versions')
        ");
        $tablesCheck->execute();
        $tablesCount = $tablesCheck->fetchColumn();
        
        // Si moins de 5 tables essentielles, le schéma n'a pas été appliqué
        if ($tablesCount < 5) {
            error_log('[initDatabase] ⚠️ Schéma SQL non appliqué - ' . $tablesCount . ' tables trouvées');
            error_log('[initDatabase] ⚠️ Le schéma complet doit être appliqué via sql/schema.sql');
            error_log('[initDatabase] ⚠️ Application uniquement des données essentielles (rôles + admin)');
        }
        
        // Vérifier si les rôles existent
        $rolesStmt = $pdo->prepare("SELECT COUNT(*) FROM roles");
        $rolesStmt->execute();
        $rolesCount = $rolesStmt->fetchColumn();
        
        if ($rolesCount == 0) {
            error_log('[initDatabase] Base vide détectée - Initialisation minimale...');
            
            // Créer les rôles (fallback si le schéma n'a pas été appliqué)
            $pdo->exec("
                INSERT INTO roles (id, name, description) VALUES
                (1, 'admin', 'Administrateur systeme - Acces complet'),
                (2, 'medecin', 'Medecin - Consultation patients et dispositifs'),
                (3, 'technicien', 'Technicien - Maintenance dispositifs')
                ON CONFLICT (id) DO UPDATE SET 
                name = EXCLUDED.name,
                description = EXCLUDED.description;
            ");
            error_log('[initDatabase] ✅ Rôles créés');
            
            // Vérifier si l'utilisateur admin existe
            $userStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE email = 'ymora@free.fr'");
            $userStmt->execute();
            $userExists = $userStmt->fetchColumn() > 0;
            
            if (!$userExists) {
                // Hash pour Ym120879 (doit correspondre à celui dans schema.sql)
                $adminHash = '$2y$10$CfYRXTMKgtzNsYnMoq2RU.6/SjicRxCnIXj50OZkiQ9/.4VvF51SC';
                
                $pdo->prepare("
                    INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role_id, is_active, deleted_at)
                    VALUES (1, 'ymora@free.fr', :hash, 'Yann', 'Mora', NULL, 1, TRUE, NULL)
                    ON CONFLICT (id) DO UPDATE SET 
                    email = EXCLUDED.email,
                    password_hash = EXCLUDED.password_hash,
                    phone = EXCLUDED.phone,
                    role_id = EXCLUDED.role_id,
                    is_active = TRUE,
                    deleted_at = NULL;
                ")->execute(['hash' => $adminHash]);
                
                error_log('[initDatabase] ✅ Utilisateur admin créé');
            }
            
            error_log('[initDatabase] ✅ Initialisation minimale terminée');
        }
    } catch (PDOException $e) {
        // Ne pas bloquer si l'initialisation échoue (peut être que les tables n'existent pas encore)
        error_log('[initDatabase] ⚠️ Erreur lors de l\'initialisation: ' . $e->getMessage());
    }
}

