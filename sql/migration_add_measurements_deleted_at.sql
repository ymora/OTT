-- Migration pour ajouter la colonne deleted_at à la table measurements
-- Permet l'archivage (soft delete) des mesures historiques

ALTER TABLE measurements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN measurements.deleted_at IS 'Timestamp d''archivage de la mesure (soft delete). NULL = mesure active, non NULL = mesure archivée.';

