-- ============================================================================
-- Migration : Ajout des champs Min/Max pour les dispositifs
-- ============================================================================
-- HAPPLYZ MEDICAL SAS
-- Ajoute les champs pour conserver les valeurs min/max (débit, batterie, RSSI)
-- Mise à jour automatique via trigger SQL à chaque nouvelle mesure
-- ============================================================================

-- 1. Ajout des champs dans la table devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS min_flowrate NUMERIC(5,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_flowrate NUMERIC(5,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS min_battery NUMERIC(5,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_battery NUMERIC(5,2);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS min_rssi INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_rssi INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS min_max_updated_at TIMESTAMPTZ;

-- 2. Création de la fonction pour mettre à jour automatiquement les min/max
CREATE OR REPLACE FUNCTION update_device_min_max()
RETURNS TRIGGER AS $$
BEGIN
  -- Mettre à jour les min/max uniquement si les valeurs ne sont pas NULL
  UPDATE devices SET
    min_flowrate = CASE 
      WHEN NEW.flowrate IS NOT NULL THEN
        LEAST(COALESCE(min_flowrate, NEW.flowrate), NEW.flowrate)
      ELSE min_flowrate
    END,
    max_flowrate = CASE 
      WHEN NEW.flowrate IS NOT NULL THEN
        GREATEST(COALESCE(max_flowrate, NEW.flowrate), NEW.flowrate)
      ELSE max_flowrate
    END,
    min_battery = CASE 
      WHEN NEW.battery IS NOT NULL THEN
        LEAST(COALESCE(min_battery, NEW.battery), NEW.battery)
      ELSE min_battery
    END,
    max_battery = CASE 
      WHEN NEW.battery IS NOT NULL THEN
        GREATEST(COALESCE(max_battery, NEW.battery), NEW.battery)
      ELSE max_battery
    END,
    min_rssi = CASE 
      WHEN NEW.signal_strength IS NOT NULL THEN
        LEAST(COALESCE(min_rssi, NEW.signal_strength), NEW.signal_strength)
      ELSE min_rssi
    END,
    max_rssi = CASE 
      WHEN NEW.signal_strength IS NOT NULL THEN
        GREATEST(COALESCE(max_rssi, NEW.signal_strength), NEW.signal_strength)
      ELSE max_rssi
    END,
    min_max_updated_at = NOW()
  WHERE id = NEW.device_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Création du trigger qui s'exécute après chaque INSERT dans measurements
DROP TRIGGER IF EXISTS trg_update_device_min_max ON measurements;
CREATE TRIGGER trg_update_device_min_max
AFTER INSERT ON measurements
FOR EACH ROW
WHEN (NEW.flowrate IS NOT NULL OR NEW.battery IS NOT NULL OR NEW.signal_strength IS NOT NULL)
EXECUTE FUNCTION update_device_min_max();

-- 4. Initialisation des valeurs min/max pour tous les dispositifs existants
UPDATE devices d SET
  min_flowrate = (SELECT MIN(flowrate) FROM measurements WHERE device_id = d.id AND flowrate IS NOT NULL),
  max_flowrate = (SELECT MAX(flowrate) FROM measurements WHERE device_id = d.id AND flowrate IS NOT NULL),
  min_battery = (SELECT MIN(battery) FROM measurements WHERE device_id = d.id AND battery IS NOT NULL),
  max_battery = (SELECT MAX(battery) FROM measurements WHERE device_id = d.id AND battery IS NOT NULL),
  min_rssi = (SELECT MIN(signal_strength) FROM measurements WHERE device_id = d.id AND signal_strength IS NOT NULL),
  max_rssi = (SELECT MAX(signal_strength) FROM measurements WHERE device_id = d.id AND signal_strength IS NOT NULL),
  min_max_updated_at = NOW()
WHERE EXISTS (SELECT 1 FROM measurements WHERE device_id = d.id);

-- 5. Commentaires pour documentation
COMMENT ON COLUMN devices.min_flowrate IS 'Valeur minimale de débit (L/min) enregistrée pour ce dispositif';
COMMENT ON COLUMN devices.max_flowrate IS 'Valeur maximale de débit (L/min) enregistrée pour ce dispositif';
COMMENT ON COLUMN devices.min_battery IS 'Valeur minimale de batterie (%) enregistrée pour ce dispositif';
COMMENT ON COLUMN devices.max_battery IS 'Valeur maximale de batterie (%) enregistrée pour ce dispositif';
COMMENT ON COLUMN devices.min_rssi IS 'Valeur minimale de RSSI (dBm) enregistrée pour ce dispositif';
COMMENT ON COLUMN devices.max_rssi IS 'Valeur maximale de RSSI (dBm) enregistrée pour ce dispositif';
COMMENT ON COLUMN devices.min_max_updated_at IS 'Date de dernière mise à jour des valeurs min/max';

