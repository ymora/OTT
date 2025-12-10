-- ============================================================================
-- Ajout des index manquants pour améliorer les performances
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- Index pour les colonnes deleted_at et autres colonnes fréquemment filtrées
-- ============================================================================

-- Index pour deleted_at (soft delete) - très utilisé dans les WHERE
CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON devices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON patients(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- Index pour les jointures fréquentes
CREATE INDEX IF NOT EXISTS idx_devices_patient_id ON devices(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC) WHERE last_seen IS NOT NULL;

-- Index pour les recherches par email/identifiants
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devices_sim_iccid ON devices(sim_iccid) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devices_device_serial ON devices(device_serial) WHERE deleted_at IS NULL AND device_serial IS NOT NULL;

-- Index pour les mesures par timestamp (amélioration)
CREATE INDEX IF NOT EXISTS idx_measurements_timestamp_desc ON measurements(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_device_timestamp ON measurements(device_id, timestamp DESC);

-- Index pour les alertes par statut et sévérité (amélioration)
CREATE INDEX IF NOT EXISTS idx_alerts_device_status ON alerts(device_id, status) WHERE status IS NOT NULL;

-- Index pour les logs par device et timestamp
CREATE INDEX IF NOT EXISTS idx_device_logs_device_timestamp ON device_logs(device_id, timestamp DESC);

-- Index pour les notifications par statut
CREATE INDEX IF NOT EXISTS idx_notifications_queue_status_created ON notifications_queue(status, created_at) WHERE status IN ('pending', 'processing');

