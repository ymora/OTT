# 🔍 Vérification de la Cohérence des Données

## 📊 Flux de Données : Firmware → API → BDD → Frontend

### 1. 📤 Firmware envoie (JSON)

**Fichier** : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino` (ligne ~1847)

```json
{
  "sim_iccid": "8933150821051278837",
  "device_serial": "OTT-25-001",
  "device_name": "OTT-8837",
  "firmware_version": "v1.0",
  "flow_lpm": 2.5,
  "battery_percent": 85,
  "rssi": -75,
  "latitude": 48.8566,
  "longitude": 2.3522,
  "status": "TIMER" | "BOOT" | "EVENT",
  "timestamp": "2025-12-08T19:33:00Z"
}
```

---

### 2. 🔄 API reçoit et transforme

**Fichier** : `api/handlers/devices/measurements.php` (ligne ~24-41)

**Mapping** :
- `sim_iccid` → utilisé pour trouver/créer le device
- `flow_lpm` → `$flowrate` (float)
- `battery_percent` → `$battery` (int, défaut 100)
- `rssi` → `$rssi` (int, défaut 0)
- `status` → `$status` (string, défaut 'active')
- `timestamp` → `$timestampValue` (datetime)
- `latitude` → `$latitude` (float, nullable)
- `longitude` → `$longitude` (float, nullable)
- `firmware_version` → utilisé pour mettre à jour device

**⚠️ PROBLÈME IDENTIFIÉ** :
- Les coordonnées GPS (`latitude`, `longitude`) sont **reçues** par l'API
- Mais elles sont **stockées dans `devices`**, pas dans `measurements`
- Chaque mesure n'a pas ses propres coordonnées GPS

---

### 3. 💾 Base de données stocke

**Fichier** : `sql/schema.sql` (ligne ~126)

**Table `measurements`** :
```sql
CREATE TABLE measurements (
  id BIGSERIAL PRIMARY KEY,
  device_id INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  flowrate NUMERIC(5,2) NOT NULL,
  battery NUMERIC(5,2),
  signal_strength INT,
  device_status VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**⚠️ PROBLÈME IDENTIFIÉ** :
- ❌ Pas de colonnes `latitude` et `longitude` dans `measurements`
- ✅ Les coordonnées GPS sont stockées dans `devices.latitude` et `devices.longitude`
- ⚠️ Donc toutes les mesures d'un dispositif partagent les mêmes coordonnées (dernières connues)

**Table `devices`** :
```sql
latitude NUMERIC(10,8),
longitude NUMERIC(11,8),
```

**Insertion** (ligne ~197) :
```php
INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status)
VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status)
```

**⚠️ Les coordonnées GPS ne sont PAS insérées dans measurements !**

---

### 4. 📥 API retourne (GET /devices/:id/history)

**Fichier** : `api/handlers/devices/measurements.php` (ligne ~348)

```sql
SELECT 
    m.*,
    d.latitude,
    d.longitude
FROM measurements m
JOIN devices d ON m.device_id = d.id
WHERE m.device_id = :device_id 
ORDER BY m.timestamp DESC 
LIMIT 1000
```

**Résultat JSON** :
```json
{
  "success": true,
  "measurements": [
    {
      "id": 1,
      "device_id": 4030,
      "timestamp": "2025-12-08T19:33:00+00:00",
      "flowrate": "2.50",
      "battery": "85.00",
      "signal_strength": -75,
      "device_status": "TIMER",
      "created_at": "2025-12-08T19:33:01+00:00",
      "latitude": "48.8566",  // ← Depuis devices, pas measurements !
      "longitude": "2.3522"   // ← Depuis devices, pas measurements !
    }
  ]
}
```

**⚠️ PROBLÈME** :
- Les coordonnées GPS retournées sont celles du dispositif (dernières connues)
- Pas les coordonnées spécifiques de chaque mesure
- Si le dispositif se déplace, toutes les mesures afficheront les mêmes coordonnées

---

### 5. 🖥️ Frontend affiche

**Fichier** : `components/DeviceMeasurementsModal.js` (ligne ~303-336)

**Mapping** :
- `measurement.flowrate` → "Débit (L/min)"
- `measurement.battery` → "Batterie (%)"
- `measurement.signal_strength` → "RSSI (dBm)"
- `measurement.latitude` + `measurement.longitude` → "GPS" (lien Google Maps)
- `measurement.device_status` → "Statut"
- `measurement.timestamp` → "Date & Heure"

**✅ Cohérence** : Le frontend affiche correctement les données reçues de l'API.

---

## ⚠️ Problèmes Identifiés

### Problème 1 : Coordonnées GPS non stockées par mesure

**Situation actuelle** :
- Le firmware envoie `latitude` et `longitude` pour chaque mesure
- L'API reçoit ces coordonnées
- Mais elles ne sont **pas stockées** dans `measurements`
- Elles sont seulement mises à jour dans `devices` (dernières connues)
- L'API retourne les coordonnées depuis `devices`, pas depuis `measurements`

**Impact** :
- ❌ Perte de l'historique des positions GPS par mesure
- ❌ Toutes les mesures affichent les mêmes coordonnées (dernières connues)
- ❌ Impossible de tracer le déplacement du dispositif

**Solution recommandée** :
1. Ajouter `latitude` et `longitude` à la table `measurements`
2. Stocker les coordonnées GPS avec chaque mesure
3. Modifier l'API pour insérer les coordonnées dans `measurements`

---

### Problème 2 : Conversion de types

**Firmware** :
- `battery_percent` : float (ex: 85.5)

**API** :
- `$battery = intval($input['battery_percent'])` → **Perte de précision !**

**BDD** :
- `battery NUMERIC(5,2)` → Supporte les décimales

**Frontend** :
- `Number(measurement.battery).toFixed(1)` → Affiche 1 décimale

**⚠️ PROBLÈME** : L'API convertit `battery_percent` en `int`, perdant la précision (85.5 → 85).

**Solution** : Utiliser `floatval()` au lieu de `intval()` pour `battery`.

---

### Problème 3 : Valeurs par défaut

**API** (ligne ~27-28) :
```php
$battery = isset($input['battery_percent']) ? intval($input['battery_percent']) : 100;
$rssi = isset($input['rssi']) ? intval($input['rssi']) : 0;
```

**⚠️ PROBLÈME** :
- Si `battery_percent` n'est pas fourni → défaut = 100% (peut masquer un problème)
- Si `rssi` n'est pas fourni → défaut = 0 (peut masquer un problème)

**Solution** : Utiliser `null` comme défaut si la valeur n'est pas fournie.

---

## ✅ Ce qui est Cohérent

1. ✅ **Noms de champs** : Mapping correct entre firmware et API
2. ✅ **flowrate** : `flow_lpm` → `flowrate` → `flowrate` (cohérent)
3. ✅ **signal_strength** : `rssi` → `signal_strength` → `signal_strength` (cohérent)
4. ✅ **device_status** : `status` → `device_status` → `device_status` (cohérent)
5. ✅ **timestamp** : Format ISO → datetime → formaté correctement (cohérent)
6. ✅ **Frontend** : Affiche correctement toutes les données reçues

---

## 🔧 Corrections Recommandées

### Correction 1 : Ajouter latitude/longitude à measurements

**Migration SQL** :
```sql
ALTER TABLE measurements 
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,8),
ADD COLUMN IF NOT EXISTS longitude NUMERIC(11,8);
```

**Modifier l'API** :
```php
INSERT INTO measurements (device_id, timestamp, flowrate, battery, signal_strength, device_status, latitude, longitude)
VALUES (:device_id, :timestamp, :flowrate, :battery, :rssi, :status, :latitude, :longitude)
```

### Correction 2 : Préserver la précision de battery

**Modifier l'API** :
```php
$battery = isset($input['battery_percent']) ? floatval($input['battery_percent']) : null;
```

### Correction 3 : Utiliser null comme défaut

**Modifier l'API** :
```php
$battery = isset($input['battery_percent']) ? floatval($input['battery_percent']) : null;
$rssi = isset($input['rssi']) ? intval($input['rssi']) : null;
```

---

## 📝 Résumé

| Champ | Firmware | API Reçoit | API Stocke | BDD Colonne | API Retourne | Frontend Affiche |
|-------|----------|------------|------------|-------------|--------------|------------------|
| flowrate | `flow_lpm` | `flow_lpm` | `flowrate` | `flowrate` | `flowrate` | `flowrate` ✅ |
| battery | `battery_percent` | `battery_percent` | `battery` (int ❌) | `battery` | `battery` | `battery` ✅ |
| rssi | `rssi` | `rssi` | `signal_strength` | `signal_strength` | `signal_strength` | `signal_strength` ✅ |
| status | `status` | `status` | `device_status` | `device_status` | `device_status` | `device_status` ✅ |
| timestamp | `timestamp` | `timestamp` | `timestamp` | `timestamp` | `timestamp` | `timestamp` ✅ |
| latitude | `latitude` | `latitude` | ❌ **PAS STOCKÉ** | ❌ **N'EXISTE PAS** | `d.latitude` ⚠️ | `latitude` ⚠️ |
| longitude | `longitude` | `longitude` | ❌ **PAS STOCKÉ** | ❌ **N'EXISTE PAS** | `d.longitude` ⚠️ | `longitude` ⚠️ |

**Légende** :
- ✅ Cohérent
- ⚠️ Problème (coordonnées depuis devices, pas measurements)
- ❌ Problème critique

