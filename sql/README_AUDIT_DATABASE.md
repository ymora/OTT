# 🔍 Audit et Nettoyage de la Base de Données

Ce dossier contient les scripts pour auditer et corriger la base de données OTT.

## 📋 Scripts Disponibles

### 1. Audit du Schéma (`scripts/audit/audit-database-schema.ps1`)

**Détecte :**
- ✅ Tables manquantes vs attendues
- ✅ Colonnes manquantes vs attendues
- ✅ **Colonnes en double** (ex: `birth_date` vs `date_of_birth`)
- ✅ Tables/colonnes orphelines (existent en DB mais pas dans le schéma)
- ✅ Index et contraintes manquants
- ✅ Tables de notifications manquantes

**Utilisation :**
```powershell
# Avec variable d'environnement
$env:DATABASE_URL = "postgresql://user:pass@host:port/dbname"
.\scripts\audit\audit-database-schema.ps1

# Ou directement
.\scripts\audit\audit-database-schema.ps1 -DATABASE_URL "postgresql://..."
```

### 2. Migration - Tables de Notifications (`migration_add_notifications_tables.sql`)

Crée les tables de notifications si elles n'existent pas :
- `user_notifications_preferences`
- `patient_notifications_preferences`
- `notifications_queue`

**Utilisation :**
```bash
psql $DATABASE_URL -f sql/migration_add_notifications_tables.sql
```

### 3. Migration - Correction Doublons (`migration_fix_duplicate_columns.sql`)

Corrige les colonnes en double :
- Supprime `birth_date` et migre les données vers `date_of_birth` dans `patients`

**⚠️ ATTENTION :** Vérifiez les données avant d'exécuter !

**Utilisation :**
```bash
psql $DATABASE_URL -f sql/migration_fix_duplicate_columns.sql
```

### 4. Migration Complète (`migration.sql`)

Migration générale qui ajoute les colonnes manquantes de manière idempotente.

**Utilisation :**
```bash
psql $DATABASE_URL -f sql/migration.sql
```

## 🔄 Workflow Recommandé

### Pour vérifier l'état de la base de données :

1. **Exécuter l'audit :**
   ```powershell
   .\scripts\audit\audit-database-schema.ps1
   ```

2. **Analyser les résultats :**
   - ❌ **Problèmes critiques** : À corriger immédiatement
   - ⚠️ **Avertissements** : À vérifier et corriger si nécessaire

3. **Appliquer les corrections :**
   ```bash
   # 1. Créer les tables de notifications
   psql $DATABASE_URL -f sql/migration_add_notifications_tables.sql
   
   # 2. Corriger les doublons (si détectés)
   psql $DATABASE_URL -f sql/migration_fix_duplicate_columns.sql
   
   # 3. Appliquer les autres migrations
   psql $DATABASE_URL -f sql/migration.sql
   ```

4. **Réexécuter l'audit pour vérifier :**
   ```powershell
   .\scripts\audit\audit-database-schema.ps1
   ```

## 🐛 Problèmes Connus et Solutions

### Problème 1 : Doublon `birth_date` / `date_of_birth`

**Symptôme :** La table `patients` a deux colonnes pour la date de naissance.

**Solution :**
```bash
psql $DATABASE_URL -f sql/migration_fix_duplicate_columns.sql
```

**Explication :** Le schéma original avait `birth_date`, puis `date_of_birth` a été ajouté via migration. Les deux colonnes coexistent.

### Problème 2 : Tables de notifications manquantes

**Symptôme :** Erreur "Notifications table not available" lors du changement de mot de passe.

**Solution :**
```bash
psql $DATABASE_URL -f sql/migration_add_notifications_tables.sql
```

**Note :** Le code crée maintenant automatiquement ces tables si elles n'existent pas, mais il est recommandé de les créer explicitement.

## 📊 Structure des Fichiers

```
sql/
├── schema.sql                              # Schéma complet de référence
├── migration.sql                            # Migration générale (colonnes manquantes)
├── migration_add_notifications_tables.sql  # Création tables notifications
├── migration_fix_duplicate_columns.sql      # Correction doublons
└── README_AUDIT_DATABASE.md                # Ce fichier

scripts/audit/
└── audit-database-schema.ps1               # Script d'audit complet
```

## ✅ Checklist de Vérification

Avant de déployer en production, vérifier :

- [ ] Toutes les tables attendues existent
- [ ] Aucune colonne en double détectée
- [ ] Tables de notifications créées
- [ ] Index critiques présents
- [ ] Contraintes de clés primaires/étrangères OK
- [ ] Aucune table/colonne orpheline non documentée

## 🔧 Maintenance

**Fréquence recommandée :**
- Après chaque migration importante
- Avant chaque déploiement en production
- Mensuellement pour maintenance préventive

**En cas de problème :**
1. Exécuter l'audit pour identifier les problèmes
2. Vérifier les logs de migration
3. Consulter `schema.sql` pour la référence
4. Appliquer les migrations nécessaires
5. Réexécuter l'audit pour vérification


