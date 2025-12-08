# État de la Base de Données - Compatibilité Firmware

## 📋 Résumé

**Date de vérification** : 2025-12-08  
**Firmware testé** : v2.0  
**API** : https://ott-jbln.onrender.com

## ✅ Schéma de Base de Données (schema.sql)

### Tables Requises

#### 1. Table `devices`
**Colonnes essentielles** :
- ✅ `id` (SERIAL PRIMARY KEY)
- ✅ `sim_iccid` (VARCHAR(20) UNIQUE NOT NULL) - **Authentification firmware**
- ✅ `device_serial` (VARCHAR(50) UNIQUE)
- ✅ `device_name` (VARCHAR(100))
- ✅ `firmware_version` (VARCHAR(20))
- ✅ `last_seen` (TIMESTAMPTZ)
- ✅ `last_battery` (FLOAT)
- ✅ `last_flowrate` (FLOAT)
- ✅ `last_rssi` (INTEGER)
- ✅ `latitude` (NUMERIC(10,8))
- ✅ `longitude` (NUMERIC(11,8))
- ✅ `min_flowrate`, `max_flowrate` (NUMERIC(5,2))
- ✅ `min_battery`, `max_battery` (NUMERIC(5,2))
- ✅ `min_rssi`, `max_rssi` (INT)

**Statut** : ✅ **Prête pour le firmware**

#### 2. Table `measurements`
**Colonnes essentielles** :
- ✅ `id` (BIGSERIAL PRIMARY KEY)
- ✅ `device_id` (INT NOT NULL REFERENCES devices(id))
- ✅ `timestamp` (TIMESTAMPTZ NOT NULL)
- ✅ `flowrate` (NUMERIC(5,2) NOT NULL) - **Requis, pas NULL**
- ✅ `battery` (NUMERIC(5,2))
- ✅ `signal_strength` (INT)
- ✅ `device_status` (VARCHAR(50))
- ✅ `latitude` (NUMERIC(10,8)) - **GPS par mesure**
- ✅ `longitude` (NUMERIC(11,8)) - **GPS par mesure**

**Index** :
- ✅ `idx_measurements_device_time` (device_id, timestamp DESC)
- ✅ `idx_measurements_location` (latitude, longitude)

**Trigger** :
- ✅ `trg_update_device_min_max` - Met à jour automatiquement min/max dans devices

**Statut** : ✅ **Prête pour le firmware**

#### 3. Table `device_configurations`
**Colonnes essentielles** :
- ✅ `device_id` (INT PRIMARY KEY)
- ✅ `firmware_version` (VARCHAR(20))
- ✅ `sleep_minutes` (INT)
- ✅ `measurement_duration_ms` (INT)
- ✅ `send_every_n_wakeups` (INT DEFAULT 1)
- ✅ `calibration_coefficients` (JSONB)

**Statut** : ✅ **Prête pour le firmware**

#### 4. Table `device_commands`
**Colonnes essentielles** :
- ✅ `id` (BIGSERIAL PRIMARY KEY)
- ✅ `device_id` (INT NOT NULL)
- ✅ `command` (VARCHAR(64) NOT NULL)
- ✅ `payload` (JSONB)
- ✅ `priority` (TEXT CHECK)
- ✅ `status` (TEXT CHECK)
- ✅ `execute_after` (TIMESTAMPTZ)
- ✅ `expires_at` (TIMESTAMPTZ)

**Statut** : ✅ **Prête pour le firmware**

## 🔄 Format Données Firmware → Base de Données

### Mapping des Champs

| Champ Firmware | Champ Base de Données | Table | Notes |
|----------------|----------------------|-------|-------|
| `sim_iccid` | `sim_iccid` | `devices` | Authentification |
| `device_serial` | `device_serial` | `devices` | Identifiant unique |
| `device_name` | `device_name` | `devices` | Nom affiché |
| `firmware_version` | `firmware_version` | `devices` | Version firmware |
| `flow_lpm` | `flowrate` | `measurements` | Débit en L/min |
| `battery_percent` | `battery` | `measurements` | Batterie en % |
| `rssi` | `signal_strength` | `measurements` | Force signal dBm |
| `status` | `device_status` | `measurements` | BOOT/EVENT/TIMER |
| `latitude` | `latitude` | `measurements` | GPS latitude |
| `longitude` | `longitude` | `measurements` | GPS longitude |
| `sleep_minutes` | `sleep_minutes` | `device_configurations` | Durée sleep |
| `measurement_duration_ms` | `measurement_duration_ms` | `device_configurations` | Durée mesure |
| `calibration_coefficients` | `calibration_coefficients` | `device_configurations` | JSONB array |

## ⚠️ Problèmes Identifiés

### 1. API Retourne Erreur 500
**Symptôme** : Toutes les requêtes POST `/api.php/devices/measurements` retournent HTTP 500 avec body vide.

**Causes possibles** :
1. ❓ Connexion à la base de données échouée
2. ❓ Table ou colonne manquante dans la base de production
3. ❓ Erreur fatale PHP non capturée
4. ❓ Problème avec les triggers SQL

**Solution** :
1. ✅ Activer `DEBUG_ERRORS=true` sur Render pour voir les détails
2. ✅ Vérifier les logs Render pour l'erreur exacte
3. ✅ Vérifier que toutes les migrations ont été appliquées

### 2. Migrations à Vérifier

**Migrations importantes** :
- ✅ `migration_add_gps_to_measurements.sql` - Colonnes GPS dans measurements
- ✅ `migration_add_min_max_columns.sql` - Colonnes min/max dans devices

**Note** : Le `schema.sql` inclut déjà ces colonnes, mais si la base a été créée avant, les migrations doivent être appliquées.

## 🧪 Tests Effectués

### Test 1: Health Check API
- ❌ **ÉCHEC** : HTTP 500
- **Conclusion** : L'API ne fonctionne pas correctement

### Test 2: Insertion Mesure (Format Firmware)
- ❌ **ÉCHEC** : HTTP 500, body vide
- **Payload testé** : Format exact du firmware v2.0
- **Conclusion** : Impossible d'insérer une mesure

### Test 3: Vérification Schéma
- ✅ **OK** : Le schéma SQL est complet et compatible
- **Conclusion** : Le problème n'est pas dans le schéma

## 📝 Actions Requises

### Immédiat
1. ✅ **Activer DEBUG_ERRORS sur Render** pour voir les erreurs détaillées
2. ⏳ **Vérifier les logs Render** pour identifier l'erreur exacte
3. ⏳ **Vérifier la connexion à la base de données** sur Render

### Vérifications Base de Données
1. ⏳ Exécuter `scripts/test-database-schema.sql` directement sur PostgreSQL
2. ⏳ Vérifier que toutes les tables existent
3. ⏳ Vérifier que tous les triggers existent
4. ⏳ Vérifier que les colonnes min/max existent dans `devices`

### Tests à Effectuer
1. ⏳ Test insertion mesure directement en SQL
2. ⏳ Test création dispositif automatique
3. ⏳ Test récupération commandes
4. ⏳ Test trigger update_device_min_max

## ✅ Conclusion

**Schéma de base de données** : ✅ **Compatible avec le firmware v2.0**

**API** : ❌ **Non fonctionnelle (erreur 500)**

**Recommandation** : 
- Le schéma est prêt et correct
- Le problème vient de l'API/configuration Render
- Activer DEBUG_ERRORS et vérifier les logs pour identifier la cause exacte

