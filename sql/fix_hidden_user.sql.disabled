-- ============================================================================
-- Script pour trouver et corriger l'utilisateur "maxime berriot" caché
-- ============================================================================
-- Ce script identifie l'utilisateur qui existe en base mais n'apparaît pas
-- dans les listes (ni actifs ni archivés)
-- ============================================================================

-- 1. Trouver tous les utilisateurs contenant "maxime" ou "berriot"
SELECT 
    id,
    email,
    first_name,
    last_name,
    role_id,
    is_active,
    deleted_at,
    created_at,
    updated_at,
    (SELECT name FROM roles WHERE id = users.role_id) as role_name,
    CASE 
        WHEN deleted_at IS NULL THEN 'Actif'
        WHEN deleted_at IS NOT NULL THEN 'Archivé'
        ELSE 'État inconnu'
    END as status
FROM users 
WHERE 
    LOWER(first_name) LIKE '%maxime%' 
    OR LOWER(last_name) LIKE '%berriot%'
    OR LOWER(email) LIKE '%maxime%'
    OR LOWER(email) LIKE '%berriot%'
ORDER BY created_at DESC;

-- 2. Vérifier tous les utilisateurs pour voir ce qui est caché
SELECT 
    id,
    email,
    first_name,
    last_name,
    role_id,
    is_active,
    deleted_at IS NOT NULL as is_deleted,
    deleted_at,
    created_at,
    (SELECT name FROM roles WHERE id = users.role_id) as role_name,
    CASE 
        WHEN deleted_at IS NULL AND is_active = TRUE THEN 'Visible (actif)'
        WHEN deleted_at IS NOT NULL THEN 'Visible (archivé)'
        WHEN deleted_at IS NULL AND is_active = FALSE THEN '⚠️ CACHÉ (actif=FALSE)'
        ELSE '⚠️ État inconnu'
    END as visibility_status
FROM users 
ORDER BY created_at DESC;

-- 3. Si l'utilisateur "maxime berriot" est trouvé, le supprimer définitivement
-- (DÉCOMMENTEZ LES LIGNES CI-DESSOUS APRÈS AVOIR VÉRIFIÉ)

-- Suppression définitive de l'utilisateur "maxime berriot"
-- DELETE FROM user_notifications_preferences WHERE user_id IN (
--     SELECT id FROM users 
--     WHERE (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
--        OR LOWER(email) LIKE '%maxime%'
--        OR LOWER(email) LIKE '%berriot%'
-- );
-- 
-- DELETE FROM users 
-- WHERE (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
--    OR LOWER(email) LIKE '%maxime%'
--    OR LOWER(email) LIKE '%berriot%';

-- 4. Alternative : Si vous voulez restaurer l'utilisateur au lieu de le supprimer
-- UPDATE users 
-- SET deleted_at = NULL, 
--     is_active = TRUE,
--     updated_at = NOW()
-- WHERE (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%')
--    OR LOWER(email) LIKE '%maxime%'
--    OR LOWER(email) LIKE '%berriot%';

