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
        
        if ($tablesCount < 5) {
            error_log('[initDatabase] ⚠️ Schéma SQL incomplet - ' . $tablesCount . ' tables détectées');
            error_log('[initDatabase] ⚠️ Le schéma complet doit être appliqué via sql/schema.sql');
            error_log('[initDatabase] ⚠️ Application des données minimales (rôles + admin)');
        }

        // S'assurer que les rôles attendus existent (utile en cas de base partielle)
        $pdo->exec("
            INSERT INTO roles (id, name, description) VALUES
            (1, 'admin', 'Administrateur systeme - Acces complet'),
            (2, 'medecin', 'Medecin - Consultation patients et dispositifs'),
            (3, 'technicien', 'Technicien - Maintenance dispositifs')
            ON CONFLICT (id) DO UPDATE SET 
                name = EXCLUDED.name,
                description = EXCLUDED.description;
        ");
        error_log('[initDatabase] ✅ Rôles confirmés');

        // S'assurer que l'utilisateur admin existe
        $adminRoleStmt = $pdo->prepare("SELECT id FROM roles WHERE name = 'admin' LIMIT 1");
        $adminRoleStmt->execute();
        $adminRoleId = $adminRoleStmt->fetchColumn();

        if ($adminRoleId) {
            $adminHash = '$2y$10$CfYRXTMKgtzNsYnMoq2RU.6/SjicRxCnIXj50OZkiQ9/.4VvF51SC';

            $pdo->prepare("
                INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active, deleted_at)
                VALUES ('ymora@free.fr', :hash, 'Yann', 'Mora', NULL, :role_id, TRUE, NULL)
                ON CONFLICT (email) DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    phone = EXCLUDED.phone,
                    role_id = EXCLUDED.role_id,
                    is_active = TRUE,
                    deleted_at = NULL;
            ")->execute([
                'hash' => $adminHash,
                'role_id' => $adminRoleId
            ]);
            error_log('[initDatabase] ✅ Utilisateur admin confirmé');
        } else {
            error_log('[initDatabase] ⚠️ Rôle admin introuvable - impossible de créer l\'admin');
        }
    } catch (PDOException $e) {
        error_log('[initDatabase] ⚠️ Erreur lors de l\'initialisation: ' . $e->getMessage());
    }
}


