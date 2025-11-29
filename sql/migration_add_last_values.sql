-- Migration : Ajouter last_flowrate et last_rssi à la table devices
-- Pour permettre l'affichage des dernières valeurs dans le dashboard

-- Ajouter les colonnes si elles n'existent pas
DO $$ 
BEGIN
    -- Ajouter last_flowrate si elle n'existe pas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'last_flowrate'
    ) THEN
        ALTER TABLE devices ADD COLUMN last_flowrate NUMERIC(5,2);
    END IF;
    
    -- Ajouter last_rssi si elle n'existe pas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'last_rssi'
    ) THEN
        ALTER TABLE devices ADD COLUMN last_rssi INT;
    END IF;
END $$;

-- Commentaires pour documentation
COMMENT ON COLUMN devices.last_flowrate IS 'Dernière valeur de débit enregistrée (L/min)';
COMMENT ON COLUMN devices.last_rssi IS 'Dernière valeur RSSI enregistrée (dBm)';

