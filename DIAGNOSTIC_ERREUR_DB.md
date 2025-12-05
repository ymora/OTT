# 🔧 Diagnostic et Résolution - Erreur "Database error"

## 📋 Résumé du problème

**Erreur rencontrée:**
```
[ERROR] Erreur sauvegarde dispositif: Error: Database error
    at fetchJson (api.js:35:13)
    at async handleSubmit (DeviceModal.js:270:9)
```

**Cause probable:** Base de données Render non à jour (migrations manquantes)

---

## ✅ Actions déjà effectuées

### 1. Mode DEBUG activé ✓

Le fichier `api.php` a été modifié pour activer le mode DEBUG:

```php
// ⚠️ MODE DEBUG ACTIVÉ - À DÉSACTIVER EN PRODUCTION ⚠️
putenv('DEBUG_ERRORS=true');
```

**⚠️ IMPORTANT:** Une fois le problème résolu, supprimez cette ligne pour la production !

### 2. Logging amélioré ✓

Les fichiers suivants ont été améliorés pour logger toutes les erreurs SQL:
- `api/handlers/devices.php` - `handleCreateDevice()`
- `api/handlers/devices.php` - `handleUpdateDevice()`

Les logs incluent maintenant:
- ❌ Message d'erreur complet
- 📝 Requête SQL exécutée
- 🔧 Paramètres de la requête
- 📚 Stack trace complet

---

## 🔍 Étape 1: Identifier l'erreur exacte

### Option A: Via la console du navigateur (F12)

1. Ouvrez votre application : https://ymora.github.io/OTT/
2. Ouvrez la console (F12 > Console)
3. Essayez de créer/modifier un dispositif
4. L'erreur complète s'affichera maintenant dans la console

### Option B: Via les logs du serveur Render

1. Connectez-vous à [render.com](https://render.com)
2. Ouvrez votre service Web (API PHP)
3. Cliquez sur "Logs"
4. Cherchez les lignes contenant:
   - `[handleUpdateDevice]`
   - `[handleCreateDevice]`
   - `❌ Erreur DB:`

**Exemple de log attendu:**
```
[handleUpdateDevice] ❌ Erreur DB: SQLSTATE[42703]: Undefined column: 7 ERROR: column "deleted_at" does not exist
[handleUpdateDevice] SQL: UPDATE devices SET device_name = :device_name, updated_at = NOW() WHERE id = :id
[handleUpdateDevice] Params: {"device_name":"OTT-001","id":"123"}
```

---

## 🔧 Étape 2: Vérifier l'état de la base de données

### Méthode automatique (recommandée)

Exécutez le script PowerShell de vérification:

```powershell
cd C:\Users\ymora\Desktop\maxime
.\scripts\VERIFIER_DB_RENDER.ps1
```

Ce script va:
- ✅ Vérifier si toutes les tables existent
- ✅ Vérifier si toutes les colonnes existent
- ✅ Identifier les migrations manquantes
- ✅ Afficher un rapport détaillé

### Méthode manuelle (alternative)

Connectez-vous à votre base PostgreSQL Render et exécutez:

```sql
-- Vérifier les colonnes de la table devices
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'devices' 
ORDER BY ordinal_position;

-- Vérifier si deleted_at existe
SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'devices' 
    AND column_name = 'deleted_at'
);

-- Vérifier si usb_logs existe
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'usb_logs'
);

-- Vérifier si gps_enabled existe
SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'device_configurations' 
    AND column_name = 'gps_enabled'
);
```

---

## 🚀 Étape 3: Appliquer les migrations

### Si la base de données n'est PAS à jour

Vous devez exécuter le script de migration complet sur Render.

#### Méthode 1: Via le Shell Render (recommandée)

1. Connectez-vous à [render.com](https://render.com)
2. Ouvrez votre base de données PostgreSQL
3. Cliquez sur **"Connect"** > **"PSQL Command"**
4. Copiez la commande de connexion affichée
5. Ouvrez votre terminal local et connectez-vous:
   ```bash
   psql postgresql://user:password@host/database
   ```
6. Copiez le contenu de `sql/MIGRATION_COMPLETE_PRODUCTION.sql`
7. Collez-le dans le terminal psql et appuyez sur Entrée

#### Méthode 2: Via fichier SQL

Si vous avez `psql` installé localement:

```powershell
# Remplacez par vos informations Render
$env:PGPASSWORD = "votre_mot_de_passe"
psql -h dpg-xxxxx.oregon-postgres.render.com `
     -U ott_xxxx_user `
     -d ott_xxxx `
     -f sql/MIGRATION_COMPLETE_PRODUCTION.sql
```

#### Méthode 3: Via l'interface Web Render

1. Connectez-vous à [render.com](https://render.com)
2. Ouvrez votre base PostgreSQL
3. Cliquez sur **"Shell"** (onglet en haut)
4. Cela ouvrira un terminal dans le navigateur
5. Exécutez:
   ```bash
   psql $DATABASE_URL
   ```
6. Copiez/collez le contenu de `MIGRATION_COMPLETE_PRODUCTION.sql`

---

## 🔍 Étape 4: Vérifier la résolution

### 1. Vérifier que la migration a réussi

Connectez-vous à votre base et exécutez:

```sql
SELECT 
    'MIGRATION COMPLÈTE' as status,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
    (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
    (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
    (SELECT COUNT(*) FROM device_configurations WHERE gps_enabled IS NOT NULL) as configs_gps_ready,
    (SELECT COUNT(*) FROM usb_logs) as usb_logs_count;
```

Résultat attendu:
```
status             | users_actifs | patients_actifs | devices_actifs | configs_gps_ready | usb_logs_count
-------------------+--------------+-----------------+----------------+-------------------+---------------
MIGRATION COMPLÈTE |            5 |              10 |             15 |                15 |            123
```

### 2. Tester l'application

1. Ouvrez l'application : https://ymora.github.io/OTT/
2. Allez dans "Dispositifs"
3. Essayez de créer ou modifier un dispositif
4. ✅ L'erreur devrait avoir disparu !

### 3. Désactiver le mode DEBUG

Une fois le problème résolu, **DÉSACTIVEZ le mode DEBUG** dans `api.php`:

```php
// Supprimez ou commentez cette ligne:
// putenv('DEBUG_ERRORS=true');
```

---

## 📊 Colonnes ajoutées par la migration

### Table `devices`
- ✅ `deleted_at` - Soft delete
- ✅ `last_battery` - Dernière valeur batterie
- ✅ `last_flowrate` - Dernier débit
- ✅ `last_rssi` - Dernier signal
- ✅ `min_flowrate`, `max_flowrate` - Min/Max débits
- ✅ `min_battery`, `max_battery` - Min/Max batterie
- ✅ `min_rssi`, `max_rssi` - Min/Max signal
- ✅ `modem_imei` - IMEI du modem
- ✅ `timezone` - Fuseau horaire

### Table `device_configurations`
- ✅ `gps_enabled` - GPS activé/désactivé
- ✅ `min_battery_pct` - Seuil batterie faible
- ✅ `max_temp_celsius` - Température maximale

### Table `usb_logs` (nouvelle)
- ✅ Création complète de la table pour les logs USB

### Table `patients`
- ✅ `deleted_at` - Soft delete
- ✅ `timezone` - Fuseau horaire

### Table `users`
- ✅ `deleted_at` - Soft delete
- ✅ `phone` - Numéro de téléphone
- ✅ `timezone` - Fuseau horaire

---

## 🆘 Problèmes courants

### Problème 1: "psql: command not found"

**Solution:** Installez PostgreSQL client:

**Windows:**
1. Téléchargez PostgreSQL: https://www.postgresql.org/download/windows/
2. Installez uniquement "Command Line Tools"
3. Ajoutez au PATH: `C:\Program Files\PostgreSQL\16\bin`

**Alternative:** Utilisez l'interface Web Render (Méthode 3 ci-dessus)

### Problème 2: "Connection refused"

**Vérifications:**
- ✅ Le host Render est correct (`dpg-xxxxx.oregon-postgres.render.com`)
- ✅ Le port est 5432 (par défaut)
- ✅ Votre IP est autorisée (Render > Database > Settings > Allow external connections)

### Problème 3: "Already exists" lors de la migration

**C'est normal !** Le script utilise `IF NOT EXISTS`, il peut être exécuté plusieurs fois sans erreur.

### Problème 4: L'erreur persiste après la migration

1. Videz le cache du navigateur (Ctrl+Shift+Delete)
2. Redémarrez le service Web sur Render
3. Vérifiez les logs avec le mode DEBUG activé
4. Partagez l'erreur exacte pour diagnostic approfondi

---

## 📞 Support

Si le problème persiste après avoir suivi toutes ces étapes:

1. ✅ Assurez-vous que le mode DEBUG est activé
2. ✅ Reproduisez l'erreur
3. ✅ Copiez l'erreur COMPLÈTE depuis:
   - La console du navigateur (F12)
   - Les logs Render
4. ✅ Partagez l'erreur complète pour diagnostic

---

## 🎯 Checklist finale

- [ ] Mode DEBUG activé dans `api.php`
- [ ] Script `VERIFIER_DB_RENDER.ps1` exécuté
- [ ] Migrations identifiées et appliquées
- [ ] Base de données vérifiée
- [ ] Application testée
- [ ] Mode DEBUG désactivé (production)
- [ ] Erreur résolue ✅

---

**Date de création:** 2025-12-05  
**Version:** 1.0  
**Auteur:** Diagnostic automatique OTT Dashboard

