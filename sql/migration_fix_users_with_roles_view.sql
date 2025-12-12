-- ============================================================================
-- MIGRATION: Fix VIEW users_with_roles - Ajout colonnes manquantes
-- ============================================================================
-- Date: 2025-12-12
-- Raison: La VIEW ne contenait pas toutes les colonnes de la table users
--         (deleted_at, timezone, phone, created_at, updated_at)
--         Cela causait des erreurs 500 sur toutes les requêtes API
-- ============================================================================

-- 1. Supprimer l'ancienne VIEW
DROP VIEW IF EXISTS users_with_roles CASCADE;

-- 2. Recréer la VIEW avec TOUTES les colonnes de users
CREATE VIEW users_with_roles AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.password_hash,
    u.role_id,
    u.is_active,
    u.last_login,
    u.created_at,
    u.updated_at,
    u.timezone,
    u.deleted_at,
    u.phone,
    r.name AS role_name,
    r.description AS role_description,
    string_agg(p.code::text, ','::text) AS permissions
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
GROUP BY 
    u.id, 
    u.email, 
    u.first_name, 
    u.last_name, 
    u.password_hash, 
    u.role_id, 
    u.is_active, 
    u.last_login, 
    u.created_at, 
    u.updated_at,
    u.timezone, 
    u.deleted_at, 
    u.phone, 
    r.name, 
    r.description;

-- 3. Vérification
SELECT 
    'Migration réussie!' as message,
    (SELECT COUNT(*) FROM users_with_roles WHERE deleted_at IS NULL) as users_actifs;

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================

