# Configuration Multiprojet pour l'Audit

## 📋 Vue d'ensemble

L'audit supporte maintenant la configuration multiprojet avec des fichiers de configuration par projet (JSON/YAML).

## 🔧 Fichiers de Configuration

### Configuration Globale (Audit)
- **`audit/config/audit.config.ps1`** : Configuration globale par défaut (actuellement configuré pour OTT)

### Configuration par Projet (Recherche automatique)

L'audit cherche automatiquement les fichiers de configuration dans l'ordre suivant :

1. **`[racine-projet]/project_metadata.json`**
   - Métadonnées du projet (type, technologies, endpoints, etc.)
   - Template disponible : `audit/data/project_metadata.example.json`
   - Chargé automatiquement si présent

2. **`[racine-projet]/audit.config.json`**
   - Configuration spécifique au projet (API, endpoints, credentials, etc.)
   - Format JSON simple

3. **`[racine-projet]/audit.config.yaml`**
   - Configuration spécifique au projet en YAML (alternatif)

## 📝 Exemple de `project_metadata.json`

```json
{
  "detectedAt": "2025-01-12 10:00:00",
  "projectRoot": "C:\\Projets\\MonProjet",
  "projectType": "nextjs",
  "technologies": ["Next.js", "React", "PHP"],
  "hasApi": true,
  "hasFrontend": true,
  "hasDatabase": true,
  "hasFirmware": false,
  "project": {
    "name": "Mon Projet",
    "description": "Description du projet",
    "version": "1.0.0",
    "company": "Ma Société"
  },
  "api": {
    "baseUrl": "https://api.monprojet.com",
    "authEndpoint": "/api.php/auth/login",
    "endpoints": [
      "/api.php/users",
      "/api.php/posts"
    ]
  },
  "database": {
    "type": "PostgreSQL",
    "schemaFile": "sql/schema.sql",
    "expectedTables": ["users", "posts"]
  },
  "firmware": {
    "directory": "hardware/firmware",
    "mainFile": "hardware/firmware/main.ino",
    "version": "1.0.0"
  }
}
```

## 📝 Exemple de `audit.config.json`

```json
{
  "Project": {
    "Name": "Mon Projet",
    "Company": "Ma Société",
    "Description": "Description"
  },
  "Api": {
    "BaseUrl": "https://api.monprojet.com",
    "AuthEndpoint": "/api.php/auth/login",
    "Endpoints": [
      { "Path": "/api.php/users", "Name": "Users" },
      { "Path": "/api.php/posts", "Name": "Posts" }
    ]
  },
  "Credentials": {
    "Email": "admin@example.com",
    "Password": "motdepasse"
  },
  "Database": {
    "Type": "PostgreSQL",
    "Host": "localhost",
    "Name": "mabase"
  }
}
```

## 🚀 Utilisation

### Lancement avec `audit.bat`

```batch
REM Audit avec détection automatique
audit.bat

REM Audit d'un projet spécifique
audit.bat "C:\Projets\MonProjet"

REM Audit complet
audit.bat -All

REM Audit de phases spécifiques
audit.bat -Phases "0,1,2"
```

### Lancement avec `audit.ps1`

```powershell
# Audit avec détection automatique
.\audit.ps1

# Audit d'un projet spécifique
.\audit.ps1 "C:\Projets\MonProjet"

# Audit complet
.\audit.ps1 -All
```

## 🔍 Détection Automatique

L'audit détecte automatiquement :
- Le type de projet (Next.js, React, PHP, etc.)
- Les technologies utilisées
- La présence d'API, frontend, base de données, firmware
- Les fichiers de configuration projet

Si `project_metadata.json` n'existe pas, l'audit le génère automatiquement via `Detect-Project.ps1`.

## ⚙️ Priorité de Configuration

1. **Variables d'environnement** (API_URL, AUDIT_EMAIL, etc.)
2. **`[racine-projet]/audit.config.json`** (si existe)
3. **`[racine-projet]/project_metadata.json`** (si existe)
4. **`audit/config/audit.config.ps1`** (config globale par défaut)

## 📚 Pour plus d'informations

- Voir `audit/data/project_metadata.example.json` pour un template complet
- Consulter `audit/config/audit.config.ps1` pour la configuration globale
- Voir `audit/modules/ConfigLoader.ps1` pour la logique de chargement

