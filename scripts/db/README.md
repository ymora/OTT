# Scripts de gestion de base de données OTT

## 🎯 Script principal : Appliquer le schéma SQL

**Script unique et simple pour initialiser la base de données :**

```powershell
.\scripts\db\apply_schema_direct_sql.ps1
```

Ce script :
- Lit le fichier `sql/schema.sql`
- L'envoie à l'API Render via l'endpoint `/admin/migrate-sql`
- Crée automatiquement l'admin `ymora@free.fr` avec le mot de passe `Ym120879`

**Prérequis :**
- `ALLOW_MIGRATION_ENDPOINT=true` configuré sur Render
- L'API Render doit être accessible

---

## 🔧 Scripts utilitaires

### `get_password_hash.ps1`
Génère un hash bcrypt pour un mot de passe (utilitaire).

```powershell
.\scripts\db\get_password_hash.ps1 -Password "monmotdepasse"
```

### `build_database_url.ps1`
Construit une `DATABASE_URL` à partir des composants.

### `test_database_url.ps1`
Teste le format d'une `DATABASE_URL`.

### `check_database_status.ps1`
Vérifie l'état de la base de données.

---

## 📋 Initialisation d'une nouvelle base

1. Créer la base PostgreSQL sur Render
2. Configurer `DATABASE_URL` dans l'API Render
3. Configurer `ALLOW_MIGRATION_ENDPOINT=true` dans l'API Render
4. Exécuter : `.\scripts\db\apply_schema_direct_sql.ps1`
5. Se connecter avec `ymora@free.fr` / `Ym120879`

C'est tout ! 🎉
