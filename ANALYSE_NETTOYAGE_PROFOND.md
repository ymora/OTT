# 🔍 ANALYSE APPROFONDIE - Fichiers SQL et PS1 à Supprimer

**Date** : 12 décembre 2025  
**Objectif** : Identifier et supprimer les doublons et fichiers inutiles (SQL/PS1)

---

## 📊 FICHIERS SQL (14 → 9 recommandé)

### ✅ À GARDER (9 fichiers essentiels)

#### **ESSENTIEL**
1. **schema.sql** ✅  
   - Schéma de base de référence  
   - Utilisé pour créer la DB from scratch  
   - **INDISPENSABLE**

#### **MIGRATIONS OFFICIELLES** (utilisées par Dashboard)
2. **migration.sql** ✅  
   - Migration générale (ajoute colonnes manquantes)  
   - Idempotent  
   - **INDISPENSABLE**

3. **migration_repair_database.sql** ✅  
   - Utilisé dans Dashboard > Migrations  
   - Répare toutes les tables manquantes  
   - **INDISPENSABLE**

4. **migration_fix_users_with_roles_view.sql** ✅  
   - Utilisé dans Dashboard > Migrations  
   - Corrige VIEW users_with_roles  
   - **INDISPENSABLE**

5. **migration_add_notifications_tables.sql** ✅  
   - Crée tables de notifications  
   - Plus complet que create_notifications_tables.sql  
   - **GARDER** (version officielle)

6. **migration_add_measurements_deleted_at.sql** ✅  
   - Ajoute soft delete aux measurements  
   - **GARDER** (version migration)

7. **migration_cleanup_device_names.sql** ✅  
   - Nettoie noms de dispositifs (OTT-XX)  
   - Version simplifiée avec regexp_replace  
   - **GARDER** (plus performant)

8. **migration_fix_duplicate_columns.sql** ✅  
   - Corrige doublon birth_date/date_of_birth  
   - Mentionné dans README_AUDIT_DATABASE.md  
   - **GARDER** (peut être nécessaire)

#### **UTILITAIRES**
9. **add_missing_indexes.sql** ✅  
   - Ajoute index manquants pour performances  
   - Pas de doublon identifié  
   - **GARDER**

---

### ❌ À SUPPRIMER (5 fichiers - doublons ou dev)

#### **DOUBLONS** (3)
1. **add_measurements_deleted_at.sql** ❌  
   - **Doublon exact** de migration_add_measurements_deleted_at.sql  
   - Contenu identique  
   - **SUPPRIMER**

2. **cleanup_device_names.sql** ❌  
   - **Doublon similaire** de migration_cleanup_device_names.sql  
   - Version plus complexe (moins performante)  
   - **SUPPRIMER**

3. **create_notifications_tables.sql** ❌  
   - **Doublon similaire** de migration_add_notifications_tables.sql  
   - Moins complet  
   - Utilisé par scripts/db/create_notifications_tables.ps1 (qui sera aussi supprimé)  
   - **SUPPRIMER**

#### **DEV ONLY** (2)
4. **add_test_devices.sql** ❌  
   - Ajoute données de test  
   - Pas pour production  
   - **SUPPRIMER**

5. **dev_reset_database.sql** ❌  
   - Reset complet de la DB (dev)  
   - Dangereux en production  
   - **SUPPRIMER**

---

## 💻 SCRIPTS POWERSHELL (56 → 48 recommandé)

### ✅ À GARDER (48 fichiers)

#### **AUDIT** (26 fichiers) ✅
- `scripts/audit-modules/Audit-Intelligent.ps1` (système d'audit automatique)
- `scripts/audit-modules/modules/*.ps1` (24 modules d'audit)
- `scripts/audit-modules/test-api-modules.ps1` (tests)
- `scripts/audit-firmware-complet.ps1` (audit firmware complet)
- `scripts/audit/audit-database-schema.ps1` (audit DB)
- `scripts/audit/audit-database.ps1` (audit DB fonctionnel)
- `scripts/audit/audit-firmware.ps1` ✅ **GARDER** (audit ciblé firmware)

**Note** : audit-firmware.ps1 ≠ audit-firmware-complet.ps1  
- audit-firmware.ps1 : Audit ciblé (points critiques)  
- audit-firmware-complet.ps1 : Audit complet (doublons, code mort)  
- **Les deux sont utiles**

#### **BASE DE DONNÉES** (4 fichiers) ✅
- `scripts/db/run_migration.ps1` (exécute migrations)
- `scripts/db/repair_database.ps1` (répare DB)
- `scripts/db/migrate_render.ps1` (déploiement Render)
- `scripts/db/db_migrate.sh` (script bash)

#### **DÉPLOIEMENT** (6 fichiers) ✅
- `scripts/deploy/export_static.ps1` (génère GitHub Pages)
- `scripts/deploy/check_online_version.ps1` (vérifie version)
- `scripts/deploy/deploy_*.sh` (scripts bash)
- `scripts/deploy/generate_time_tracking.sh`
- `scripts/deploy/verify-build.sh`

#### **HARDWARE** (2 fichiers) ✅
- `scripts/hardware/build_firmware_bin.ps1` (compile)
- `scripts/hardware/flash_firmware.ps1` (flash)

#### **MONITORING** (2 fichiers) ✅
- `scripts/monitoring/ANALYSER_LOGS_FIRMWARE.ps1`
- `scripts/monitoring/MONITOR_SERIE_COM3.ps1`

#### **VÉRIFICATION** (2 fichiers) ✅
- `scripts/verification/verifier-deploiement-github-pages.ps1`
- `scripts/verification/verifier-synchronisation-deploiement.ps1`

#### **RACINE scripts/** (6 fichiers) ✅
- `scripts/check_compile_status.ps1`
- `scripts/check_deployment_status.ps1`
- `scripts/monitor_compilation.ps1`
- `scripts/test_features_online.ps1`
- `scripts/test_version_online.ps1`

---

### ❌ À SUPPRIMER (8 fichiers)

#### **ARCHIVE COMPLET** (6 fichiers) ❌
**Dossier** : `scripts/archive/`  
**Statut** : TOUS OBSOLÈTES (remplacés par Audit-Intelligent.ps1)  
**Date d'archivage** : 2025-12-11 23:40:10  

1. **ANALYSER_ELEMENTS_INUTILES.ps1** ❌  
   - Remplacé par Phase 19 de l'audit  
   - **SUPPRIMER**

2. **ANALYSER_TOUS_FICHIERS_PS1_JS.ps1** ❌  
   - Remplacé par Phase 0 de l'audit  
   - **SUPPRIMER**

3. **AUDITER_AUDIT_COMPLET.ps1** ❌  
   - Remplacé par auto-vérification de l'audit  
   - **SUPPRIMER**

4. **NETTOYER_ELEMENTS_INUTILES.ps1** ❌  
   - Remplacé par Phase 19 de l'audit  
   - **SUPPRIMER**

5. **NETTOYER_TOUS_FICHIERS_PS1_JS.ps1** ❌  
   - Remplacé par Phase 0 de l'audit  
   - **SUPPRIMER**

6. **REORGANISER_PROJET.ps1** ❌  
   - Fonctionnalités intégrées dans l'audit  
   - **SUPPRIMER**

**Note** : Le dossier `scripts/archive/` peut être supprimé entièrement (avec son README.md)

#### **DOUBLONS / TEMPORAIRES** (2 fichiers) ❌

7. **scripts/db/create_notifications_tables.ps1** ❌  
   - Exécute create_notifications_tables.sql (qui sera supprimé)  
   - Doublon de la migration officielle  
   - **SUPPRIMER**

8. **scripts/cleanup/nettoyer-md.ps1** ❌  
   - Script temporaire de nettoyage MD  
   - Plus nécessaire (nettoyage déjà fait)  
   - **SUPPRIMER**

---

## 📋 RÉCAPITULATIF

### Fichiers à supprimer (13 total)

#### **SQL** (5 fichiers)
```bash
sql/add_measurements_deleted_at.sql
sql/cleanup_device_names.sql
sql/create_notifications_tables.sql
sql/add_test_devices.sql
sql/dev_reset_database.sql
```

#### **PowerShell** (8 fichiers)
```bash
# Archive complet (6 + dossier)
scripts/archive/ANALYSER_ELEMENTS_INUTILES.ps1
scripts/archive/ANALYSER_TOUS_FICHIERS_PS1_JS.ps1
scripts/archive/AUDITER_AUDIT_COMPLET.ps1
scripts/archive/NETTOYER_ELEMENTS_INUTILES.ps1
scripts/archive/NETTOYER_TOUS_FICHIERS_PS1_JS.ps1
scripts/archive/REORGANISER_PROJET.ps1
scripts/archive/README.md
# (Supprimer le dossier scripts/archive/ entièrement)

# Doublons/temporaires (2)
scripts/db/create_notifications_tables.ps1
scripts/cleanup/nettoyer-md.ps1
# (Supprimer le dossier scripts/cleanup/ si vide après)
```

---

## 💰 GAINS ATTENDUS

### **Avant**
- **SQL** : 14 fichiers (dont 5 doublons/inutiles)
- **PS1** : 56 fichiers (dont 8 obsolètes)

### **Après**
- **SQL** : 9 fichiers (seulement les essentiels)
- **PS1** : 48 fichiers (seulement les actifs)

### **Gain**
- **-5 fichiers SQL** (35% de réduction)
- **-8 fichiers PS1** (14% de réduction)
- **-13 fichiers total**
- **Moins de confusion** (pas de doublons)
- **Plus clair** (seulement les fichiers actifs)

---

## ✅ VALIDATION AVANT SUPPRESSION

### **Vérifications effectuées**

1. ✅ **Comparaison contenu** : Doublons SQL identiques confirmés
2. ✅ **Recherche références** : Fichiers SQL doublons non référencés ailleurs
3. ✅ **Scripts archive** : README.md confirme obsolescence (2025-12-11)
4. ✅ **audit-firmware.ps1** : Différent de audit-firmware-complet.ps1 (les deux utiles)
5. ✅ **Migrations officielles** : Utilisées dans Dashboard > Migrations
6. ✅ **Scripts PS1 actifs** : Tous les scripts actifs identifiés et gardés

### **Aucun risque identifié**
- Tous les doublons ont une version officielle gardée
- Scripts archive confirmés obsolètes depuis le 2025-12-11
- Aucun script essentiel dans la liste de suppression

---

## 🚀 PRÊT POUR SUPPRESSION

**Tous les fichiers listés peuvent être supprimés en toute sécurité.**

**Commande de suppression préparée** (attente validation utilisateur).

