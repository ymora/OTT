# Scripts de gestion de base de données OTT

Ce répertoire contient les scripts PowerShell pour gérer la base de données PostgreSQL du projet OTT.

## 📋 Scripts disponibles

### 0. Configuration nouvelle base Render (`setup_new_render_db.ps1`)

Guide et script pour créer et initialiser une nouvelle base PostgreSQL sur Render.

**Usage :**
```powershell
.\scripts\db\setup_new_render_db.ps1 -DatabaseUrl "postgresql://user:pass@host:port/dbname"
```

**Options :**
- `-DatabaseUrl` : URL de connexion PostgreSQL (requis)
- `-SkipSchema` : Ne pas exécuter le schéma SQL (juste tester la connexion)
- `-Help` : Afficher le guide complet

**Exemple :**
```powershell
.\scripts\db\setup_new_render_db.ps1 -DatabaseUrl "postgresql://ott_user:password@dpg-xxxxx-a.frankfurt-postgres.render.com:5432/ott_data"
```

**Ce que fait le script :**
1. Vérifie que `psql` est installé
2. Teste la connexion à la base de données
3. Vérifie l'état de la base (vide ou existante)
4. Applique le schéma SQL (`sql/schema.sql`)
5. Vérifie les tables créées
6. Affiche les instructions pour configurer Render

**📖 Guide complet :** Voir `docs/SETUP_NEW_RENDER_DB.md`

---

### 1. Sauvegarde des données (`backup_data.ps1`)

Sauvegarde toutes les données importantes (utilisateurs, dispositifs, patients, mesures, etc.) dans un fichier JSON.

**Usage :**
```powershell
.\scripts\db\backup_data.ps1 -DATABASE_URL "postgresql://user:pass@host:port/dbname"
```

**Options :**
- `-DATABASE_URL` : URL de connexion PostgreSQL (requis)
- `-OutputFile` : Nom du fichier de sauvegarde (optionnel, défaut : `backup_YYYYMMDD_HHmmss.json`)

**Exemple :**
```powershell
.\scripts\db\backup_data.ps1 -DATABASE_URL "postgresql://postgres:password@localhost:5432/ott_data" -OutputFile "backup_production.json"
```

**Données sauvegardées :**
- ✅ Utilisateurs (avec mots de passe hashés)
- ✅ Patients
- ✅ Dispositifs
- ✅ Mesures
- ✅ Alertes
- ✅ Configurations de dispositifs
- ✅ Versions de firmware
- ✅ Préférences de notifications
- ✅ Commandes de dispositifs
- ✅ Rôles et permissions

**Fichier de sortie :**
Le fichier JSON est sauvegardé dans le répertoire `backups/` à la racine du projet.

---

### 2. Réinitialisation de la base (`reset_database.ps1`)

⚠️ **ATTENTION** : Ce script supprime **TOUTES** les données de la base de données mais conserve la structure des tables.

**Usage :**
```powershell
.\scripts\db\reset_database.ps1 -DATABASE_URL "postgresql://user:pass@host:port/dbname" -Confirm
```

**Options :**
- `-DATABASE_URL` : URL de connexion PostgreSQL (requis)
- `-Confirm` : Confirmer sans prompt interactif (optionnel)

**Exemple :**
```powershell
.\scripts\db\reset_database.ps1 -DATABASE_URL "postgresql://postgres:password@localhost:5432/ott_data"
```

**Ce que fait le script :**
1. ⚠️ Demande confirmation (sauf si `-Confirm` est utilisé)
2. Désactive temporairement les contraintes de clés étrangères
3. Vide toutes les tables (TRUNCATE)
4. Réinitialise les séquences (IDs recommencent à 1)
5. Réactive les contraintes
6. Réinsère les données de base (rôles et permissions depuis `schema.sql`)

**⚠️ ATTENTION :** Cette opération est **irréversible** ! Assurez-vous d'avoir fait une sauvegarde avant.

---

### 3. Restauration des données (`restore_data.ps1`)

Restaure les données depuis un fichier de sauvegarde JSON.

**Usage :**
```powershell
.\scripts\db\restore_data.ps1 -DATABASE_URL "postgresql://user:pass@host:port/dbname" -BackupFile "backups/backup_20241215_120000.json"
```

**Options :**
- `-DATABASE_URL` : URL de connexion PostgreSQL (requis)
- `-BackupFile` : Chemin vers le fichier de sauvegarde JSON (requis)
- `-Confirm` : Confirmer sans prompt interactif (optionnel)

**Exemple :**
```powershell
.\scripts\db\restore_data.ps1 -DATABASE_URL "postgresql://postgres:password@localhost:5432/ott_data" -BackupFile "backups/backup_production.json"
```

**Ce que fait le script :**
1. ⚠️ Demande confirmation (sauf si `-Confirm` est utilisé)
2. Charge le fichier de sauvegarde JSON
3. Désactive temporairement les contraintes de clés étrangères
4. Restaure les données dans l'ordre (pour respecter les contraintes)
5. Réactive les contraintes
6. Vérifie l'intégrité des données restaurées

**Ordre de restauration :**
1. Rôles
2. Permissions
3. Associations role_permissions
4. Utilisateurs
5. Patients
6. Dispositifs
7. Mesures
8. Alertes
9. Configurations
10. Firmwares
11. Préférences de notifications
12. Commandes

---

### 4. Nettoyage des migrations (`cleanup_migrations.ps1`)

Supprime les fichiers de migration SQL qui ont déjà été exécutés.

**Usage :**
```powershell
.\scripts\db\cleanup_migrations.ps1
```

**Options :**
- `-Confirm` : Confirmer sans prompt interactif (optionnel)

**Fichiers supprimés :**
- `migration.sql`
- `migration_*.sql` (tous les fichiers de migration)
- `add_missing_indexes.sql`

**Fichiers conservés :**
- `schema.sql` (schéma de base)
- `README_AUDIT_DATABASE.md` (documentation)

---

## 🔄 Workflow recommandé

### Sauvegarde avant réinitialisation

```powershell
# 1. Sauvegarder les données
.\scripts\db\backup_data.ps1 -DATABASE_URL "postgresql://..." -OutputFile "backup_avant_reset.json"

# 2. Réinitialiser la base
.\scripts\db\reset_database.ps1 -DATABASE_URL "postgresql://..."

# 3. Restaurer les données
.\scripts\db\restore_data.ps1 -DATABASE_URL "postgresql://..." -BackupFile "backups/backup_avant_reset.json"
```

### Nettoyage après migrations

```powershell
# Supprimer les fichiers de migration exécutés
.\scripts\db\cleanup_migrations.ps1
```

---

## 📝 Notes importantes

1. **Prérequis** : PostgreSQL client (`psql`) doit être installé et dans le PATH
2. **Sauvegarde** : Toujours faire une sauvegarde avant toute opération destructive
3. **Environnement** : Utilisez des URLs différentes pour dev/prod
4. **Sécurité** : Les mots de passe sont sauvegardés sous forme de hash bcrypt (non réversibles)

---

## 🔗 Voir aussi

- `sql/schema.sql` : Schéma de base de données
- `sql/README_AUDIT_DATABASE.md` : Documentation audit base de données

