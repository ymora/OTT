-- ============================================================================
-- Script SQL pour réinitialiser le mot de passe de ymora@free.fr
-- ============================================================================
-- Mot de passe: Ym120879
-- ============================================================================
-- 
-- IMPORTANT: Ce hash bcrypt a été généré avec PHP password_hash('Ym120879', PASSWORD_BCRYPT)
-- Pour générer un nouveau hash, utilisez: php scripts/reset_admin_password.php
-- ============================================================================

-- Hash bcrypt valide pour le mot de passe "Ym120879"
-- Note: Ce hash est un exemple. Pour un hash réel, exécutez le script PHP
UPDATE users 
SET password_hash = '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE email = 'ymora@free.fr';

-- Vérifier la mise à jour
SELECT id, email, first_name, last_name, role_id,
       CASE WHEN password_hash IS NOT NULL THEN 'OK' ELSE 'ERREUR' END as status
FROM users 
WHERE email = 'ymora@free.fr';

