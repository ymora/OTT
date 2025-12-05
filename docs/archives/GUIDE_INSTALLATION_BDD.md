# 📚 GUIDE INSTALLATION BASE DE DONNÉES - OTT Dashboard

**Version** : 1.0 Production  
**Date** : 4 Décembre 2025  
**Pour** : Nouvelle installation ou migration

---

## 🎯 INSTALLATION COMPLÈTE (BDD Neuve)

### Prérequis
- PostgreSQL 14+ 
- Accès admin à la base
- Connexion sécurisée (SSL)

### Étapes

#### **1. Créer la base** (si pas encore fait)
```sql
CREATE DATABASE ott_data;
CREATE USER ott_data_user WITH PASSWORD 'votre_password';
GRANT ALL PRIVILEGES ON DATABASE ott_data TO ott_data_user;
```

#### **2. Exécuter le schéma de base**
```bash
# Via shell PostgreSQL ou interface Render
psql < sql/schema.sql
```

**OU** copier/coller le contenu de `sql/schema.sql` dans le shell.

#### **3. Exécuter la migration complète**
```bash
psql < sql/MIGRATION_COMPLETE_PRODUCTION.sql
```

**OU** copier/coller le contenu de `sql/MIGRATION_COMPLETE_PRODUCTION.sql`.

#### **4. ✅ Terminé !**

La base contient maintenant :
- ✅ Toutes les tables
- ✅ Soft delete (deleted_at)
- ✅ USB logs
- ✅ GPS
- ✅ Colonnes étendues
- ✅ Index performance
- ✅ Prêt pour production

---

## 🔄 MISE À JOUR (BDD Existante)

Si votre BDD existe déjà (comme actuellement) :

### **Option A - Via Render Dashboard** (recommandé)

1. https://dashboard.render.com
2. Votre PostgreSQL → "Connect" ou "Shell"
3. Copier/coller `sql/MIGRATION_COMPLETE_PRODUCTION.sql`
4. Exécuter
5. ✅ Fait !

### **Option B - Via endpoint PHP** (automatique)

Après déploiement du code :

```powershell
Invoke-RestMethod 'https://ott-jbln.onrender.com/api/migrate_gps_NOW.php?secret=execute-migration-gps-2025'
```

**Note** : Endpoint temporaire, à supprimer après usage.

---

## 📋 CHECKLIST POST-INSTALLATION

Vérifiez que tout fonctionne :

### Backend
- [ ] `GET /api.php/devices` retourne des données
- [ ] `GET /api.php/patients` retourne des données
- [ ] `GET /api.php/users` retourne des données
- [ ] `GET /api.php/devices?include_deleted=true` fonctionne

### Frontend
- [ ] Dashboard → Dispositifs → Éditer device
- [ ] Configuration → Toggle GPS visible
- [ ] Sauvegarder → Modal se ferme
- [ ] Base de Données → Archives → 3 sous-sections

### Firmware
- [ ] Device boot → Fetch commandes
- [ ] UPDATE_CONFIG avec gps_enabled fonctionne
- [ ] Logs verts `✅ [CMD]` visibles

---

## 🗂️ FICHIERS MIGRATIONS DISPONIBLES

### **Production** (à exécuter)
- `schema.sql` - Schéma de base complet
- `MIGRATION_COMPLETE_PRODUCTION.sql` - **TOUT EN UN** ⭐

### **Développement** (optionnel)
- `dev_reset_database.sql` - Nettoyage complet (DEV ONLY)
- `add_test_devices.sql` - Données de test

### **Anciennes migrations** (incluses dans MIGRATION_COMPLETE)
- `migration_optimisations.sql` (deleted_at, phone, etc.)
- `migration_add_usb_logs.sql` (table usb_logs)
- `migration_add_gps_enabled.sql` (GPS)
- `migration_add_last_values.sql` (last_battery, etc.)
- `migration_add_min_max.sql` (min/max configs)
- `migration_add_phone_users.sql` (phone users)
- `migration_firmware_blob.sql` (firmware storage)
- `migration_remove_default_values.sql` (cleanup)

**Note** : Plus besoin d'exécuter ces fichiers individuellement !  
Le script `MIGRATION_COMPLETE_PRODUCTION.sql` les consolide tous.

---

## ⚠️ IMPORTANT - ORDRE D'EXÉCUTION

Pour une installation propre :

1. **schema.sql** (tables de base)
2. **MIGRATION_COMPLETE_PRODUCTION.sql** (tout le reste)

C'est tout ! 🎉

---

## 🔍 VÉRIFICATION

Après migration, exécutez :

```sql
SELECT 
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users,
    (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients,
    (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices,
    (SELECT COUNT(*) FROM device_configurations WHERE gps_enabled IS NOT NULL) as gps_ready,
    (SELECT COUNT(*) FROM usb_logs) as usb_logs;
```

**Résultat attendu** :
- `gps_ready` > 0 → GPS prêt ✅
- Toutes les colonnes retournent des valeurs → Migration OK ✅

---

## 🎉 CONCLUSION

**Prochaine installation BDD** : 2 fichiers SQL, c'est tout !  
**Automatique** : Oui, IF NOT EXISTS partout  
**Idempotent** : Peut être rejoué sans erreur  
**Production-ready** : Oui ✅

---

**Pour MAINTENANT (votre BDD actuelle)** :  
Exécutez juste `MIGRATION_COMPLETE_PRODUCTION.sql` sur Render ! 🚀

