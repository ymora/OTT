# Configuration Multiprojet pour l'Audit

## Vue d'ensemble

L'audit supporte la configuration multiprojet via :
- des profils d'auto-détection (`audit/projects/<project>/project.ps1`)
- des surcharges de configuration PS1 (`audit.config.ps1` / `audit.config.local.ps1`)
- des overrides de modules (`audit/projects/<project>/modules/`)

## Fichiers de Configuration

### Configuration Globale (Audit)
- **`audit/config/audit.config.ps1`** : Configuration globale par défaut (générique)
- **`audit/config/audit.config.local.ps1`** : surcharge locale (non versionnée)

### Configuration par Projet

Le lanceur `audit/audit.ps1` supporte les surcharges projet via :
- `audit/projects/<project>/config/audit.config.ps1` (versionnée)
- `audit/projects/<project>/config/audit.config.local.ps1` (non versionnée)

La détection automatique est réalisée via des profils dans :
- `audit/projects/<project>/project.ps1`

## 📝 Exemple de profil de détection (`project.ps1`)

Un profil renvoie une hashtable et expose une fonction `Detect` qui retourne un score.
Le profil avec le meilleur score (>0) est sélectionné.

## 🚀 Utilisation

### Lancement avec `audit.bat`

```batch
REM Audit avec détection automatique
audit.bat

REM Audit d'un projet spécifique
audit.bat "C:\Projets\MonProjet"

REM Audit complet
audit.bat -Phases "all" -Verbose

REM Audit de phases spécifiques
audit.bat -Phases "1,2,3" -Verbose
```

### Lancement avec `audit.ps1`

```powershell
# Audit avec détection automatique
.\audit.ps1

# Audit d'un projet spécifique
.\audit.ps1 "C:\Projets\MonProjet"

# Audit complet
.\audit.ps1 -Phases "all" -Verbose
```

## 🔍 Détection Automatique

L'audit détecte automatiquement le projet en testant les profils présents dans `audit/projects/*/project.ps1`.

## ⚙️ Priorité de Configuration

1. **`audit/config/audit.config.ps1`** (config globale)
2. **`audit/config/audit.config.local.ps1`** (surcharge locale)
3. **`audit/projects/<project>/config/audit.config.ps1`** (si projet détecté)
4. **`audit/projects/<project>/config/audit.config.local.ps1`** (surcharge locale projet)

Note : les variables d'environnement peuvent être utilisées directement dans les fichiers `audit.config.ps1`.

## 📚 Pour plus d'informations

- Consulter `audit/config/audit.config.ps1` pour la configuration globale
- Voir `audit/projects/<project>/project.ps1` pour la logique de détection
