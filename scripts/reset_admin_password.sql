-- ============================================================================
-- Script SQL pour réinitialiser le mot de passe admin
-- ============================================================================
-- Email: ymora@free.fr
-- Nouveau mot de passe: Ym120879
-- ============================================================================
-- 
-- IMPORTANT: Le hash bcrypt doit être généré avec PHP
-- Exécutez sur Render (dans le shell de votre service API):
--   php -r "echo password_hash('Ym120879', PASSWORD_BCRYPT);"
-- 
-- Puis remplacez le hash dans la commande UPDATE ci-dessous
-- ============================================================================

-- Étape 1: Générer le hash (à faire sur Render)
-- php -r "echo password_hash('Ym120879', PASSWORD_BCRYPT);"

-- Étape 2: Mettre à jour le mot de passe (remplacez <HASH> par le résultat de l'étape 1)
UPDATE users 
SET password_hash = '<HASH_GÉNÉRÉ_PAR_PHP>'
WHERE email = 'ymora@free.fr';

-- Étape 3: Si l'utilisateur n'existe pas, le créer
INSERT INTO users (email, password_hash, first_name, last_name, role_id, is_active)
SELECT 
    'ymora@free.fr',
    '<HASH_GÉNÉRÉ_PAR_PHP>',
    'Admin',
    'OTT',
    1,
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'ymora@free.fr'
);

-- Étape 4: Vérifier que ça a fonctionné
SELECT 
    id, 
    email, 
    first_name, 
    last_name, 
    role_id,
    CASE 
        WHEN password_hash IS NOT NULL THEN '✅ Mot de passe défini'
        ELSE '❌ Pas de mot de passe'
    END as password_status
FROM users 
WHERE email = 'ymora@free.fr';
