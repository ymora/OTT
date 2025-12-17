-- ============================================================================
-- Script pour créer l'utilisateur admin initial
-- Usage: Exécuter via l'API de migration ou directement avec psql
-- ============================================================================

-- Vérifier que le rôle admin existe
DO $$
DECLARE
    admin_role_id INT;
    password_hash TEXT;
BEGIN
    -- Récupérer l'ID du rôle admin
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin' LIMIT 1;
    
    IF admin_role_id IS NULL THEN
        RAISE EXCEPTION 'Le rôle admin n''existe pas. Assurez-vous d''avoir appliqué le schéma SQL (sql/schema.sql) d''abord.';
    END IF;
    
    -- Hasher le mot de passe avec bcrypt
    -- Mot de passe: Ym120879
    -- Hash généré avec: password_hash('Ym120879', PASSWORD_BCRYPT)
    password_hash := '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
    
    -- Vérifier si l'utilisateur existe déjà
    IF EXISTS (SELECT 1 FROM users WHERE email = 'ymora@free.fr') THEN
        -- Mettre à jour l'utilisateur existant
        UPDATE users 
        SET password_hash = password_hash,
            first_name = 'Yann',
            last_name = 'Mora',
            role_id = admin_role_id,
            is_active = TRUE,
            phone = NULL
        WHERE email = 'ymora@free.fr';
        
        RAISE NOTICE 'Utilisateur ymora@free.fr mis à jour avec succès';
    ELSE
        -- Créer l'utilisateur
        INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active)
        VALUES ('ymora@free.fr', password_hash, 'Yann', 'Mora', NULL, admin_role_id, TRUE);
        
        RAISE NOTICE 'Utilisateur admin ymora@free.fr créé avec succès';
    END IF;
END $$;

-- Vérification
SELECT 
    id,
    email,
    first_name,
    last_name,
    role_id,
    (SELECT name FROM roles WHERE id = users.role_id) as role_name,
    is_active,
    created_at
FROM users 
WHERE email = 'ymora@free.fr';

