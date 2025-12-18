<?php
/**
 * Initialisation automatique de la base de données
 * Vérifie et crée les données essentielles si elles n'existent pas
 */

function initDatabaseIfEmpty() {
    global $pdo;
    
    try {
        // Vérifier si les rôles existent
        $rolesStmt = $pdo->prepare("SELECT COUNT(*) FROM roles");
        $rolesStmt->execute();
        $rolesCount = $rolesStmt->fetchColumn();
        
        if ($rolesCount == 0) {
            error_log('[initDatabase] Base vide détectée - Initialisation...');
            
            // Créer les rôles
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
                // Hash pour Ym120879 (généré une fois, réutilisé)
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
            
            error_log('[initDatabase] ✅ Initialisation terminée');
        }
    } catch (PDOException $e) {
        // Ne pas bloquer si l'initialisation échoue (peut être que les tables n'existent pas encore)
        error_log('[initDatabase] ⚠️ Erreur lors de l\'initialisation: ' . $e->getMessage());
    }
}

