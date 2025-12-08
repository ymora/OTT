# 📚 Explication des Migrations SQL

## 🎯 Vue d'Ensemble

Il y a **2 types de migrations** dans le système :

### 1. 📦 Migration Complète (`complete`)
- **Où** : Code intégré directement dans `api.php` (fonction `handleRunCompleteMigration()`)
- **Quoi** : Applique **tout le schéma de base de données** en une seule fois
- **Quand** : Première installation ou réinitialisation complète
- **Inclut** :
  - ✅ Toutes les tables (users, patients, devices, measurements, etc.)
  - ✅ Colonnes min/max dans `devices` (min_flowrate, max_flowrate, min_battery, max_battery, min_rssi, max_rssi)
  - ✅ Trigger `update_device_min_max()`
  - ✅ Index sur les colonnes importantes
  - ✅ Table `usb_logs`
  - ✅ Colonnes `deleted_at` pour soft delete
  - ❌ **N'inclut PAS** : Colonnes GPS (latitude/longitude) dans `measurements`

### 2. 📄 Migrations Spécifiques (fichiers `.sql`)
- **Où** : Fichiers dans le dossier `sql/`
- **Quoi** : Appliquent **une modification spécifique** à la base de données
- **Quand** : Après la migration complète, pour ajouter des fonctionnalités spécifiques
- **Fichiers disponibles** :
  - `migration_add_min_max_columns.sql` - Ajoute colonnes min/max à devices
  - `migration_add_gps_to_measurements.sql` - Ajoute latitude/longitude à measurements

---

## 📋 Liste des Migrations Disponibles

### Migration Complète
**Nom** : `complete`  
**Fichier** : Intégré dans `api.php`  
**Description** : Applique tout le schéma de base de données

**Ce qui est créé/modifié** :
- Tables principales (users, patients, devices, measurements, device_configurations, etc.)
- Colonnes min/max dans `devices`
- Trigger `update_device_min_max()`
- Index sur deleted_at, last_seen, timestamp
- Table `usb_logs`

**⚠️ Important** : Cette migration **n'inclut PAS** les colonnes GPS dans `measurements`.  
Vous devez appliquer `migration_add_gps_to_measurements.sql` séparément.

---

### Migration: Colonnes min/max (devices)
**Nom** : `migration_add_min_max_columns.sql`  
**Fichier** : `sql/migration_add_min_max_columns.sql`  
**Description** : Ajoute les colonnes min/max à la table `devices`

**Ce qui est créé/modifié** :
- `min_flowrate NUMERIC(5,2)` - Valeur minimale de débit
- `max_flowrate NUMERIC(5,2)` - Valeur maximale de débit
- `min_battery NUMERIC(5,2)` - Batterie minimale
- `max_battery NUMERIC(5,2)` - Batterie maximale
- `min_rssi INT` - Signal minimal
- `max_rssi INT` - Signal maximal
- `min_max_updated_at TIMESTAMPTZ` - Date de dernière mise à jour

**Note** : Ces colonnes sont mises à jour automatiquement par le trigger `update_device_min_max()`.

---

### Migration: GPS dans measurements
**Nom** : `migration_add_gps_to_measurements.sql`  
**Fichier** : `sql/migration_add_gps_to_measurements.sql`  
**Description** : Ajoute les colonnes GPS à la table `measurements`

**Ce qui est créé/modifié** :
- `latitude NUMERIC(10,8)` - Latitude GPS de la mesure
- `longitude NUMERIC(11,8)` - Longitude GPS de la mesure
- Index `idx_measurements_location` - Pour améliorer les requêtes de géolocalisation

**Pourquoi c'est important** :
- Permet de stocker les coordonnées GPS **spécifiques à chaque mesure**
- Permet de tracer le déplacement du dispositif dans le temps
- **Sans cette migration** : Les mesures avec coordonnées GPS échoueront avec une erreur SQL

---

## 🔄 Ordre d'Application Recommandé

### Pour une Nouvelle Installation
1. ✅ **Migration Complète** (`complete`)
   - Applique tout le schéma de base
   - Inclut les colonnes min/max dans devices
   
2. ✅ **Migration GPS** (`migration_add_gps_to_measurements.sql`)
   - Ajoute latitude/longitude à measurements
   - **NÉCESSAIRE** pour éviter les erreurs SQL lors de l'envoi de mesures avec GPS

### Pour une Installation Existante
1. ✅ **Migration GPS** (`migration_add_gps_to_measurements.sql`)
   - Si vous voulez stocker les coordonnées GPS par mesure
   
2. ✅ **Migration min/max** (`migration_add_min_max_columns.sql`)
   - Si les colonnes min/max n'existent pas encore dans devices
   - **Note** : La migration complète les inclut déjà

---

## 📊 Ce que les Logs Indiquent

### Migration Complète
Les logs affichent :
```json
{
  "success": true,
  "message": "Migration complète exécutée avec succès",
  "verification": {
    "status": "MIGRATION COMPLÈTE",
    "users_actifs": 3,
    "patients_actifs": 1,
    "devices_actifs": 1,
    "configs_gps_ready": 1,
    "usb_logs_count": 46123
  }
}
```

**Ce que cela signifie** :
- ✅ Migration appliquée avec succès
- ✅ 3 utilisateurs actifs dans la base
- ✅ 1 patient actif
- ✅ 1 dispositif actif
- ✅ 1 configuration GPS prête
- ✅ 46123 logs USB enregistrés

### Migration Spécifique
Les logs affichent :
```json
{
  "success": true,
  "message": "Migration executed"
}
```

**Ce que cela signifie** :
- ✅ Migration appliquée avec succès
- Les colonnes ont été ajoutées (ou existaient déjà grâce à `IF NOT EXISTS`)

---

## 🎯 Résumé Simple

| Migration | Type | Quand l'utiliser | Ce qu'elle fait |
|-----------|------|-----------------|-----------------|
| **Migration Complète** | Intégrée | Première installation | Crée tout le schéma + colonnes min/max |
| **GPS measurements** | Fichier SQL | Après migration complète | Ajoute latitude/longitude à measurements |
| **min/max devices** | Fichier SQL | Si colonnes manquantes | Ajoute colonnes min/max à devices |

---

## ✅ Vérification

Après avoir appliqué les migrations, vous pouvez vérifier :

1. **Colonnes min/max dans devices** :
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'devices' 
   AND column_name LIKE 'min_%' OR column_name LIKE 'max_%';
   ```

2. **Colonnes GPS dans measurements** :
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'measurements' 
   AND column_name IN ('latitude', 'longitude');
   ```

---

## 🚀 Utilisation

### Via la Page Web
1. Allez sur : https://ymora.github.io/OTT/migrate.html
2. Sélectionnez la migration dans le menu déroulant
3. Cliquez sur "Exécuter la Migration"
4. Les logs indiqueront ce qui a été modifié

### Via l'API
```bash
POST https://ott-jbln.onrender.com/api.php/migrate
Content-Type: application/json

{
  "file": "migration_add_gps_to_measurements.sql"
}
```

---

## 📝 Notes Importantes

1. **Toutes les migrations sont idempotentes** : Vous pouvez les exécuter plusieurs fois sans problème (grâce à `IF NOT EXISTS`)

2. **Migration Complète ≠ Migrations Spécifiques** :
   - La migration complète est un script intégré dans `api.php`
   - Les migrations spécifiques sont des fichiers `.sql` séparés

3. **Ordre important** :
   - Migration complète d'abord
   - Puis migrations spécifiques si nécessaire

4. **GPS manquant** :
   - La migration complète **n'inclut PAS** les colonnes GPS
   - Vous **devez** appliquer `migration_add_gps_to_measurements.sql` séparément

