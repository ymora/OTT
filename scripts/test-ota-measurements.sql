-- Script SQL pour vérifier les mesures OTA reçues
-- =================================================

-- 1. Voir les 10 dernières mesures reçues
SELECT 
    id,
    device_id,
    timestamp,
    flowrate,
    battery,
    signal_strength,
    device_status,
    created_at
FROM measurements
ORDER BY timestamp DESC
LIMIT 10;

-- 2. Voir les dispositifs et leur dernière mise à jour
SELECT 
    id,
    sim_iccid,
    device_name,
    device_serial,
    last_seen,
    last_battery,
    last_flowrate,
    last_rssi,
    firmware_version,
    status,
    latitude,
    longitude
FROM devices
ORDER BY last_seen DESC
LIMIT 20;

-- 3. Compter les mesures par dispositif (24 dernières heures)
SELECT 
    d.device_name,
    d.sim_iccid,
    COUNT(m.id) as nb_mesures,
    MIN(m.timestamp) as premiere_mesure,
    MAX(m.timestamp) as derniere_mesure,
    AVG(m.flowrate) as flowrate_moyen,
    AVG(m.battery) as battery_moyenne,
    AVG(m.signal_strength) as rssi_moyen
FROM devices d
LEFT JOIN measurements m ON d.id = m.device_id 
    AND m.timestamp >= NOW() - INTERVAL '24 hours'
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.device_name, d.sim_iccid
ORDER BY derniere_mesure DESC;

-- 4. Vérifier qu'un dispositif spécifique a bien envoyé (remplacez 'ICCID_ICI' par l'ICCID réel)
-- SELECT 
--     m.*,
--     d.device_name,
--     d.sim_iccid
-- FROM measurements m
-- JOIN devices d ON m.device_id = d.id
-- WHERE d.sim_iccid = 'ICCID_ICI'
-- ORDER BY m.timestamp DESC
-- LIMIT 20;

