-- Script de test pour vérifier que la base de données est prête pour le firmware
-- Exécuter ce script directement sur la base de données PostgreSQL

-- 1. Vérifier que toutes les tables nécessaires existent
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'devices') 
        THEN '✅ Table devices existe'
        ELSE '❌ Table devices MANQUANTE'
    END as devices_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'measurements') 
        THEN '✅ Table measurements existe'
        ELSE '❌ Table measurements MANQUANTE'
    END as measurements_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_configurations') 
        THEN '✅ Table device_configurations existe'
        ELSE '❌ Table device_configurations MANQUANTE'
    END as device_configurations_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_commands') 
        THEN '✅ Table device_commands existe'
        ELSE '❌ Table device_commands MANQUANTE'
    END as device_commands_check;

-- 2. Vérifier les colonnes de la table measurements
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'measurements'
ORDER BY ordinal_position;

-- 3. Vérifier les colonnes GPS dans measurements
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'measurements' AND column_name = 'latitude') 
        THEN '✅ Colonne latitude existe'
        ELSE '❌ Colonne latitude MANQUANTE'
    END as latitude_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'measurements' AND column_name = 'longitude') 
        THEN '✅ Colonne longitude existe'
        ELSE '❌ Colonne longitude MANQUANTE'
    END as longitude_check;

-- 4. Vérifier les colonnes min/max dans devices
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'min_flowrate') 
        THEN '✅ Colonne min_flowrate existe'
        ELSE '❌ Colonne min_flowrate MANQUANTE'
    END as min_flowrate_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'max_flowrate') 
        THEN '✅ Colonne max_flowrate existe'
        ELSE '❌ Colonne max_flowrate MANQUANTE'
    END as max_flowrate_check;

-- 5. Vérifier que le trigger update_device_min_max existe
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'trg_update_device_min_max'
        ) 
        THEN '✅ Trigger trg_update_device_min_max existe'
        ELSE '❌ Trigger trg_update_device_min_max MANQUANTE'
    END as trigger_check;

-- 6. Test d'insertion (simulation firmware)
-- Créer un dispositif de test s'il n'existe pas
INSERT INTO devices (sim_iccid, device_serial, device_name, firmware_version, status, first_use_date)
VALUES ('TEST-ICCID-1234567890', 'TEST-SERIAL-001', 'TEST-DEVICE', '2.0', 'active', NOW())
ON CONFLICT (sim_iccid) DO NOTHING
RETURNING id, sim_iccid, device_serial;

-- Insérer une mesure de test (format firmware)
INSERT INTO measurements (
    device_id, 
    timestamp, 
    flowrate, 
    battery, 
    signal_strength, 
    device_status,
    latitude,
    longitude
)
SELECT 
    d.id,
    NOW(),
    2.5,
    85.5,
    -75,
    'EVENT',
    48.8566,
    2.3522
FROM devices d
WHERE d.sim_iccid = 'TEST-ICCID-1234567890'
RETURNING id, device_id, timestamp, flowrate, battery, signal_strength;

-- Vérifier que les min/max ont été mis à jour
SELECT 
    sim_iccid,
    device_serial,
    min_flowrate,
    max_flowrate,
    min_battery,
    max_battery,
    min_rssi,
    max_rssi,
    min_max_updated_at
FROM devices
WHERE sim_iccid = 'TEST-ICCID-1234567890';

-- Nettoyer (optionnel - commenter pour garder les données de test)
-- DELETE FROM measurements WHERE device_id IN (SELECT id FROM devices WHERE sim_iccid = 'TEST-ICCID-1234567890');
-- DELETE FROM devices WHERE sim_iccid = 'TEST-ICCID-1234567890';

