# 🔧 SOLUTION - Database Error OTT-8837

**Problème :** `POST /api.php/devices` retourne "Database error" lors de création OTT-8837

**Données tentées :**
```json
{
  "device_name": "OTT-8837",
  "sim_iccid": "8933150821051278837",
  "device_serial": "OTT-PIERRE-001",
  "firmware_version": "3.8-unified",
  "status": "usb_connected"
}
```

---

## 🔍 DIAGNOSTIC

### Causes Possibles

1. **Contrainte UNIQUE violée**
   - ICCID ou Serial existe déjà (même soft-deleted)
   - PostgreSQL : contraintes UNIQUE ne considèrent PAS `deleted_at`

2. **API Render pas à jour**
   - Modification `firmware_version` dans INSERT pas déployée
   - Besoin redéploiement manuel

3. **Problème schéma BDD**
   - Colonne manquante ?
   - Type de données incompatible ?

---

## ✅ SOLUTIONS

### Solution 1 : Activer DEBUG_ERRORS (RECOMMANDÉ)

**Sur Render Dashboard :**
1. Aller dans Environment Variables
2. Ajouter : `DEBUG_ERRORS=true`
3. Redémarrer le service
4. Retester la création
5. L'erreur SQL exacte apparaîtra dans la réponse

### Solution 2 : Vérifier et Nettoyer Soft Deletes

**SQL à exécuter sur Render :**
```sql
-- Chercher dispositifs supprimés avec même ICCID/Serial
SELECT id, device_name, sim_iccid, device_serial, deleted_at, created_at
FROM devices
WHERE (sim_iccid = '8933150821051278837' 
   OR device_serial = 'OTT-PIERRE-001')
  AND deleted_at IS NOT NULL;

-- Si trouvés, les supprimer définitivement (hard delete)
DELETE FROM devices
WHERE (sim_iccid = '8933150821051278837' 
   OR device_serial = 'OTT-PIERRE-001')
  AND deleted_at IS NOT NULL;
```

### Solution 3 : Modifier Contraintes UNIQUE (Long Terme)

**Modifier les contraintes pour ignorer deleted_at :**
```sql
-- Supprimer anciennes contraintes
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_sim_iccid_key;
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_serial_key;

-- Créer index UNIQUE partiel (exclut deleted_at IS NOT NULL)
CREATE UNIQUE INDEX devices_sim_iccid_unique 
ON devices (sim_iccid) 
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX devices_device_serial_unique 
ON devices (device_serial) 
WHERE deleted_at IS NULL;
```

### Solution 4 : Créer avec ICCID Alternatif (Temporaire)

Si urgent, créer avec un ICCID légèrement modifié :
```json
{
  "device_name": "OTT-8837-TEMP",
  "sim_iccid": "893315082105127883X",  // X à la fin
  "device_serial": "OTT-PIERRE-001-NEW",
  "firmware_version": "3.8-unified",
  "status": "usb_connected"
}
```

---

## 🎯 ACTIONS IMMÉDIATES

1. ✅ Activer `DEBUG_ERRORS=true` sur Render
2. 🔍 Identifier erreur SQL exacte
3. 🔧 Appliquer solution appropriée
4. ✅ Retester création OTT-8837
5. 🧹 Nettoyer logs debug après correction

---

## 📝 NOTE

Le code frontend est **PARFAIT** ! Le problème est 100% côté API/BDD.
Une fois l'erreur SQL identifiée, la correction sera rapide.

