-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Créer table migration_history pour tracker les migrations
-- ═══════════════════════════════════════════════════════════════════
-- HAPPLYZ MEDICAL SAS
-- 
-- RAISON:
-- - Permet de tracker quelles migrations ont été exécutées
-- - Afficher le statut dans le dashboard
-- - Permettre de masquer les migrations exécutées
-- 
-- Date: 2025-12-13
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS migration_history (
  id SERIAL PRIMARY KEY,
  migration_file VARCHAR(255) NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  executed_by INT REFERENCES users(id) ON DELETE SET NULL,
  duration_ms NUMERIC(10,2),
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index unique pour éviter les doublons (seulement pour les migrations non masquées)
-- Note: On permet plusieurs entrées pour la même migration si elle est masquée puis réexécutée
-- Utilisation d'un index partiel unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_history_file_unique 
ON migration_history(migration_file) 
WHERE hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_migration_history_executed_at ON migration_history(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_history_hidden ON migration_history(hidden);

COMMENT ON TABLE migration_history IS 'Historique des migrations SQL exécutées';
COMMENT ON COLUMN migration_history.migration_file IS 'Nom du fichier de migration (ex: migration_sim_pin_varchar16.sql)';
COMMENT ON COLUMN migration_history.executed_at IS 'Date et heure d''exécution';
COMMENT ON COLUMN migration_history.executed_by IS 'ID de l''utilisateur qui a exécuté la migration (NULL si exécutée automatiquement)';
COMMENT ON COLUMN migration_history.duration_ms IS 'Durée d''exécution en millisecondes';
COMMENT ON COLUMN migration_history.status IS 'Statut: success, failed, partial';
COMMENT ON COLUMN migration_history.hidden IS 'Si TRUE, la migration est masquée du dashboard (mais reste dans l''historique)';

SELECT 'MIGRATION migration_history table CREATED' as status;
