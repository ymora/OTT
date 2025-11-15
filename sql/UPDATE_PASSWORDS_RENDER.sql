-- =====================================================
-- MISE À JOUR MOTS DE PASSE - PostgreSQL Render
-- =====================================================
-- Date: 14 novembre 2025
-- À exécuter dans psql (connexion Render)
-- =====================================================

-- 1️⃣ Admin (ex: admin@example.com)
UPDATE users 
SET password_hash = '$2a$10$VOTRE_HASH_ADMIN_ICI'
WHERE email = 'admin@example.com';

-- 2️⃣ Technicien (ex: tech@example.com)
UPDATE users 
SET password_hash = '$2a$10$VOTRE_HASH_TECH_ICI'
WHERE email = 'tech@example.com';

-- Vérification
SELECT id, email, first_name, last_name, role_id 
FROM users 
ORDER BY id;

-- =====================================================
-- INSTRUCTIONS CONNEXION RENDER
-- =====================================================
-- 1. Aller sur https://render.com/
-- 2. Cliquer sur "ott-database"
-- 3. Onglet "Connect"
-- 4. Copier la commande psql
-- 5. Coller dans PowerShell
-- 6. Une fois connecté, copier-coller les UPDATE ci-dessus
-- 7. Taper \q pour quitter
-- =====================================================

-- ✅ Après exécution, tester sur https://ymora.github.io/OTT/

