-- ============================================================================
-- Script de nettoyage pour supprimer definitivement tous les utilisateurs
-- "maxime berriot" possibles, meme s'ils sont caches ou dans un etat etrange
-- ============================================================================
-- Ce script supprime TOUS les utilisateurs correspondant aux criteres,
-- independamment de leur etat (actif, archive, inactif, etc.)
-- ============================================================================

BEGIN;

-- 1. Identifier tous les utilisateurs a supprimer
SELECT 
    id,
    email,
    first_name,
    last_name,
    role_id,
    is_active,
    deleted_at,
    created_at,
    'Sera supprime' as action
FROM users 
WHERE 
    (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
    OR LOWER(email) LIKE '%maxime.berriot%'
    OR LOWER(email) LIKE '%maximeberriot%'
    OR (LOWER(first_name) = 'maxime' AND LOWER(last_name) = 'berriot')
ORDER BY created_at DESC;

-- 2. Supprimer les preferences de notifications
DELETE FROM user_notifications_preferences 
WHERE user_id IN (
    SELECT id FROM users 
    WHERE 
        (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
        OR LOWER(email) LIKE '%maxime.berriot%'
        OR LOWER(email) LIKE '%maximeberriot%'
        OR (LOWER(first_name) = 'maxime' AND LOWER(last_name) = 'berriot')
);

-- 3. Mettre a jour les logs d'audit (mettre user_id a NULL)
UPDATE audit_logs 
SET user_id = NULL 
WHERE user_id IN (
    SELECT id FROM users 
    WHERE 
        (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
        OR LOWER(email) LIKE '%maxime.berriot%'
        OR LOWER(email) LIKE '%maximeberriot%'
        OR (LOWER(first_name) = 'maxime' AND LOWER(last_name) = 'berriot')
);

-- 4. Supprimer definitivement les utilisateurs
DELETE FROM users 
WHERE 
    (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
    OR LOWER(email) LIKE '%maxime.berriot%'
    OR LOWER(email) LIKE '%maximeberriot%'
    OR (LOWER(first_name) = 'maxime' AND LOWER(last_name) = 'berriot');

-- 5. Verification finale
SELECT 
    COUNT(*) as remaining_count,
    'Utilisateurs maxime berriot restants' as message
FROM users 
WHERE 
    (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
    OR LOWER(email) LIKE '%maxime.berriot%'
    OR LOWER(email) LIKE '%maximeberriot%'
    OR (LOWER(first_name) = 'maxime' AND LOWER(last_name) = 'berriot');

COMMIT;

-- ============================================================================
-- NOTE: Pour executer ce script, utilisez l'endpoint /admin/migrate-sql
-- ou executez-le directement dans votre client PostgreSQL
-- ============================================================================

