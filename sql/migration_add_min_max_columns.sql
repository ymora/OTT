-- Migration: Ajouter les colonnes min/max manquantes à la table devices
-- Ces colonnes sont utilisées par le trigger update_device_min_max()
-- Date: 2025-12-08

-- Vérifier et ajouter les colonnes si elles n'existent pas
DO $$
BEGIN
    -- min_flowrate
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'min_flowrate') THEN
        ALTER TABLE devices ADD COLUMN min_flowrate NUMERIC(5,2);
    END IF;
    
    -- max_flowrate
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'max_flowrate') THEN
        ALTER TABLE devices ADD COLUMN max_flowrate NUMERIC(5,2);
    END IF;
    
    -- min_battery
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'min_battery') THEN
        ALTER TABLE devices ADD COLUMN min_battery NUMERIC(5,2);
    END IF;
    
    -- max_battery
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'max_battery') THEN
        ALTER TABLE devices ADD COLUMN max_battery NUMERIC(5,2);
    END IF;
    
    -- min_rssi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'min_rssi') THEN
        ALTER TABLE devices ADD COLUMN min_rssi INT;
    END IF;
    
    -- max_rssi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'max_rssi') THEN
        ALTER TABLE devices ADD COLUMN max_rssi INT;
    END IF;
    
    -- min_max_updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'min_max_updated_at') THEN
        ALTER TABLE devices ADD COLUMN min_max_updated_at TIMESTAMPTZ;
    END IF;
END $$;

-- Vérifier que le trigger existe, sinon le créer
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_device_min_max') THEN
        -- Le trigger sera créé par schema.sql, mais on peut le créer ici aussi
        RAISE NOTICE 'Le trigger trg_update_device_min_max doit être créé via schema.sql';
    END IF;
END $$;

-- Afficher un message de confirmation
SELECT 'Migration terminée: Colonnes min/max ajoutées à la table devices' AS status;

