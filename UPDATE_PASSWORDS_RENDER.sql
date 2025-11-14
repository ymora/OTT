-- =====================================================
-- MISE À JOUR MOTS DE PASSE - PostgreSQL Render
-- =====================================================
-- Date: 14 novembre 2025
-- À exécuter dans psql (connexion Render)
-- =====================================================

-- 1️⃣ ymora@free.fr (Hash fourni)
UPDATE users 
SET password_hash = '$2a$10$ipRX1z7Zo1DmZXyP1N9gW.aumu6Vx8oRusI5I4KI7ns7/nJH8tnQi'
WHERE email = 'ymora@free.fr';

-- 2️⃣ maxime@happlyzmedical.com (Hash fourni)
UPDATE users 
SET password_hash = '$2a$10$spiEURMRB264ZIEQ/q54Xuxd8Gh7s30yVG9B6ZycDWZbUMD/PFnY2'
WHERE email = 'maxime@happlyzmedical.com';

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

