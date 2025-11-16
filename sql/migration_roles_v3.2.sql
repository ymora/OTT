-- ============================================================================
-- MIGRATION ROLES V3.2 - Définition claire des permissions
-- ============================================================================
-- Rôles : admin, technicien (utilisateur), medecin
-- ============================================================================

-- Supprimer le rôle viewer (optionnel, si vous voulez le garder, commentez cette ligne)
-- DELETE FROM role_permissions WHERE role_id = 4;
-- DELETE FROM users WHERE role_id = 4;
-- DELETE FROM roles WHERE id = 4;

-- Mettre à jour les descriptions des rôles
UPDATE roles SET description = 'Administrateur système - Accès complet à toutes les fonctionnalités' WHERE name = 'admin';
UPDATE roles SET description = 'Technicien - Maintenance et configuration des dispositifs' WHERE name = 'technicien';
UPDATE roles SET description = 'Médecin - Consultation des patients et suivi médical' WHERE name = 'medecin';

-- Supprimer toutes les permissions existantes pour les rôles (sauf admin qui garde tout)
DELETE FROM role_permissions WHERE role_id IN (2, 3);

-- ============================================================================
-- PERMISSIONS ADMIN (id=1) - TOUS LES DROITS
-- ============================================================================
-- L'admin garde toutes les permissions (déjà fait dans base_seed.sql)

-- ============================================================================
-- PERMISSIONS MEDECIN (id=2)
-- ============================================================================
-- Peut : Voir patients, modifier patients, voir dispositifs, voir rapports, voir alertes
-- Ne peut PAS : Modifier dispositifs, OTA, commandes, gérer utilisateurs, audit complet
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN (
  'devices.view',              -- Voir liste et détails dispositifs
  'patients.view',              -- Voir patients
  'patients.edit',              -- Modifier patients (ajout/modification données médicales)
  'patients.export',            -- Exporter données patients
  'reports.view',               -- Voir rapports
  'reports.export',             -- Exporter rapports
  'alerts.view'                 -- Voir alertes
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PERMISSIONS TECHNICIEN (id=3)
-- ============================================================================
-- Peut : Voir/modifier dispositifs, configurer, commandes, OTA, gérer alertes, voir rapports
-- Ne peut PAS : Gérer patients, gérer utilisateurs, audit complet
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN (
  'devices.view',              -- Voir liste et détails dispositifs
  'devices.edit',               -- Modifier dispositifs (assignation, statut)
  'devices.configure',          -- Configurer paramètres à distance
  'devices.commands',           -- Pilotage commandes descendantes
  'devices.ota',                -- Mises à jour OTA
  'alerts.view',                -- Voir alertes
  'alerts.manage',              -- Résoudre alertes
  'reports.view'                -- Voir rapports techniques
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================
-- Afficher les permissions par rôle
SELECT 
  r.name AS role,
  r.description,
  COUNT(rp.permission_id) AS nb_permissions,
  STRING_AGG(p.code, ', ' ORDER BY p.code) AS permissions
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE r.name IN ('admin', 'medecin', 'technicien')
GROUP BY r.id, r.name, r.description
ORDER BY r.id;

