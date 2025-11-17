-- ============================================================================
-- MIGRATION : Suppression du rôle VIEWER
-- ============================================================================
-- Cette migration :
-- 1. Migre les utilisateurs viewer vers technicien
-- 2. Supprime les permissions du rôle viewer
-- 3. Supprime le rôle viewer
-- ============================================================================

BEGIN;

-- 1. Migrer les utilisateurs viewer (role_id=4) vers technicien (role_id=3)
UPDATE users 
SET role_id = 3 
WHERE role_id = 4;

-- 2. Supprimer les permissions du rôle viewer
DELETE FROM role_permissions WHERE role_id = 4;

-- 3. Supprimer le rôle viewer
DELETE FROM roles WHERE id = 4;

COMMIT;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================
-- Vérifier qu'il n'y a plus d'utilisateurs avec role_id=4
-- SELECT COUNT(*) FROM users WHERE role_id = 4; -- Doit retourner 0

-- Vérifier que les utilisateurs ont été migrés
-- SELECT u.email, r.name as role_name 
-- FROM users u 
-- JOIN roles r ON u.role_id = r.id 
-- WHERE u.email IN ('viewer@example.com', 'demo@example.com');

