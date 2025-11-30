-- ============================================================================
-- Ajout de dispositifs fictifs pour les tests
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- ============================================================================

-- Dispositif fictif 1 : Non assigné
INSERT INTO devices (
    sim_iccid,
    device_serial,
    device_name,
    firmware_version,
    status,
    patient_id,
    created_at,
    updated_at
) VALUES (
    'TEST-ICCID-001',
    'TEST-SERIAL-001',
    'Dispositif Test 1',
    'v3.0-rebuild',
    'active',
    NULL,
    NOW(),
    NOW()
) ON CONFLICT (sim_iccid) DO NOTHING;

-- Dispositif fictif 2 : Non assigné
INSERT INTO devices (
    sim_iccid,
    device_serial,
    device_name,
    firmware_version,
    status,
    patient_id,
    created_at,
    updated_at
) VALUES (
    'TEST-ICCID-002',
    'TEST-SERIAL-002',
    'Dispositif Test 2',
    'v3.0-rebuild',
    'active',
    NULL,
    NOW(),
    NOW()
) ON CONFLICT (sim_iccid) DO NOTHING;

-- Vérification
SELECT 
    id,
    sim_iccid,
    device_serial,
    device_name,
    status,
    patient_id,
    firmware_version
FROM devices
WHERE sim_iccid LIKE 'TEST-%'
ORDER BY created_at DESC;

