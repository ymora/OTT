-- ================================================================
-- SCRIPT DE RESET COMPLET - DÉVELOPPEMENT UNIQUEMENT
-- ================================================================
-- ⚠️ ATTENTION : Ce script SUPPRIME TOUTES LES DONNÉES !
-- À utiliser UNIQUEMENT en environnement de développement/test
-- NE JAMAIS exécuter en production !
-- ================================================================

-- Désactiver temporairement les contraintes de clés étrangères
SET session_replication_role = 'replica';

-- ================================================================
-- SUPPRESSION DES DONNÉES (ordre inverse des dépendances)
-- ================================================================

-- 1. Logs et audits
TRUNCATE TABLE usb_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;

-- 2. Commandes et notifications
TRUNCATE TABLE device_commands RESTART IDENTITY CASCADE;
TRUNCATE TABLE notifications_queue RESTART IDENTITY CASCADE;

-- 3. Alertes et mesures
TRUNCATE TABLE alerts RESTART IDENTITY CASCADE;
TRUNCATE TABLE measurements RESTART IDENTITY CASCADE;

-- 4. Configurations des dispositifs
TRUNCATE TABLE device_configurations RESTART IDENTITY CASCADE;

-- 5. Dispositifs (avec soft delete, on supprime TOUT)
DELETE FROM devices; -- Hard delete pour nettoyer aussi les soft-deleted
ALTER SEQUENCE devices_id_seq RESTART WITH 1;

-- 6. Patients (optionnel - décommenter si besoin)
-- TRUNCATE TABLE patients RESTART IDENTITY CASCADE;

-- 7. Firmwares (optionnel - garder les firmwares uploadés)
-- TRUNCATE TABLE firmwares RESTART IDENTITY CASCADE;

-- 8. Sessions utilisateurs
TRUNCATE TABLE sessions RESTART IDENTITY CASCADE;

-- 9. Utilisateurs de test (optionnel - garder les admins)
-- DELETE FROM users WHERE email LIKE '%@test.com' OR email LIKE '%@example.com';

-- ================================================================
-- RÉACTIVATION DES CONTRAINTES
-- ================================================================
SET session_replication_role = 'origin';

-- ================================================================
-- VÉRIFICATION
-- ================================================================
SELECT 
    'devices' as table_name, COUNT(*) as remaining_rows FROM devices
UNION ALL
SELECT 'measurements', COUNT(*) FROM measurements
UNION ALL
SELECT 'device_configurations', COUNT(*) FROM device_configurations
UNION ALL
SELECT 'device_commands', COUNT(*) FROM device_commands
UNION ALL
SELECT 'usb_logs', COUNT(*) FROM usb_logs
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs
ORDER BY table_name;

-- ================================================================
-- RÉSULTAT ATTENDU
-- ================================================================
-- Toutes les tables doivent avoir 0 lignes
-- Les séquences sont réinitialisées à 1
-- La base est prête pour de nouveaux tests propres
-- ================================================================

