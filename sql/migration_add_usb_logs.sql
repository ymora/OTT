-- ============================================================================
-- Migration : Ajout de la table usb_logs pour le monitoring à distance
-- ============================================================================
-- Cette table stocke tous les logs des dispositifs USB connectés
-- pour permettre aux administrateurs de les consulter à distance
-- ============================================================================

CREATE TABLE IF NOT EXISTS usb_logs (
  id SERIAL PRIMARY KEY,
  device_identifier VARCHAR(255) NOT NULL, -- sim_iccid, device_serial, ou device_name
  device_name VARCHAR(255),
  log_line TEXT NOT NULL,
  log_source VARCHAR(20) DEFAULT 'device' CHECK (log_source IN ('device', 'dashboard')),
  user_id INT REFERENCES users(id) ON DELETE SET NULL, -- L'utilisateur qui avait le dispositif connecté
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour optimiser les requêtes par dispositif
CREATE INDEX IF NOT EXISTS idx_usb_logs_device ON usb_logs(device_identifier);
CREATE INDEX IF NOT EXISTS idx_usb_logs_created_at ON usb_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usb_logs_device_created ON usb_logs(device_identifier, created_at DESC);

-- Vue pour faciliter la lecture des logs avec informations du dispositif
CREATE OR REPLACE VIEW usb_logs_view AS
SELECT 
  ul.id,
  ul.device_identifier,
  ul.device_name,
  ul.log_line,
  ul.log_source,
  ul.created_at,
  u.email as user_email,
  u.first_name || ' ' || u.last_name as user_name,
  d.id as device_id,
  d.status as device_status
FROM usb_logs ul
LEFT JOIN users u ON ul.user_id = u.id
LEFT JOIN devices d ON (d.sim_iccid = ul.device_identifier OR d.device_serial = ul.device_identifier OR d.device_name = ul.device_identifier)
ORDER BY ul.created_at DESC;

-- Fonction pour nettoyer les vieux logs (garder seulement 7 jours)
CREATE OR REPLACE FUNCTION cleanup_old_usb_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM usb_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Commentaires pour documentation
COMMENT ON TABLE usb_logs IS 'Stocke tous les logs des dispositifs USB connectés pour monitoring à distance';
COMMENT ON COLUMN usb_logs.device_identifier IS 'Identifiant du dispositif (sim_iccid, device_serial, ou device_name)';
COMMENT ON COLUMN usb_logs.log_source IS 'Source du log : device (firmware) ou dashboard (interface web)';
COMMENT ON COLUMN usb_logs.user_id IS 'Utilisateur qui avait le dispositif connecté en USB';
COMMENT ON FUNCTION cleanup_old_usb_logs() IS 'Supprime les logs USB de plus de 7 jours';

