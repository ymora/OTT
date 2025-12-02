# Script de Génération du Suivi de Temps

## Description

Script PowerShell amélioré pour analyser les commits Git et générer automatiquement un rapport de facturation détaillé.

## Améliorations apportées

### ✅ Validation et robustesse
- Vérification que Git est installé et disponible
- Vérification que le répertoire est un dépôt Git valide
- Gestion d'erreurs améliorée avec messages clairs
- Validation des dates et formats

### ✅ Code factorisé
- Fonction `Parse-Commit` pour éviter la duplication
- Fonction `Build-GitCommand` pour construire les commandes Git
- Fonction `Write-Log` pour un logging cohérent

### ✅ Filtrage avancé
- **Par auteur** : `-Author "Nom"`
- **Par période** : `-Since "2024-01-01"` et `-Until "2024-12-31"`
- **Par branches** : `-Branches @("main", "develop")`
- **Format de date relatif** : `-Since "30 days ago"`

### ✅ Catégorisation améliorée
- Patterns plus précis et spécifiques
- Ordre de vérification optimisé (plus spécifique en premier)
- Meilleure distinction entre les catégories

### ✅ Export multi-format
- **Markdown** : Format par défaut (compatible avec la version précédente)
- **CSV** : `-ExportCsv` pour import dans Excel/Google Sheets
- **JSON** : `-ExportJson` pour traitement automatisé

### ✅ Options supplémentaires
- `-Verbose` : Affiche tous les messages de log
- Messages de log colorés et structurés
- Meilleure gestion des cas limites

## Utilisation

### Utilisation de base
```powershell
pwsh scripts/generate_time_tracking.ps1
```

### Avec filtres
```powershell
# Filtrer par auteur
pwsh scripts/generate_time_tracking.ps1 -Author "Maxime"

# Filtrer par période
pwsh scripts/generate_time_tracking.ps1 -Since "2024-01-01" -Until "2024-12-31"

# Filtrer par période relative
pwsh scripts/generate_time_tracking.ps1 -Since "30 days ago"

# Filtrer par branches spécifiques
pwsh scripts/generate_time_tracking.ps1 -Branches @("main", "develop")

# Combinaison de filtres
pwsh scripts/generate_time_tracking.ps1 -Author "Maxime" -Since "2024-01-01" -Until "2024-12-31"
```

### Export multi-format
```powershell
# Générer aussi un CSV
pwsh scripts/generate_time_tracking.ps1 -ExportCsv

# Générer aussi un JSON
pwsh scripts/generate_time_tracking.ps1 -ExportJson

# Générer les deux
pwsh scripts/generate_time_tracking.ps1 -ExportCsv -ExportJson
```

### Mode verbose
```powershell
pwsh scripts/generate_time_tracking.ps1 -Verbose
```

### Options complètes
```powershell
pwsh scripts/generate_time_tracking.ps1 `
    -OutputFile "MON_RAPPORT.md" `
    -Author "Maxime" `
    -Since "2024-01-01" `
    -Until "2024-12-31" `
    -Branches @("main") `
    -ExportCsv `
    -ExportJson `
    -Verbose
```

## Paramètres

| Paramètre | Type | Description | Défaut |
|-----------|------|-------------|--------|
| `OutputFile` | string | Nom du fichier de sortie | `SUIVI_TEMPS_FACTURATION.md` |
| `IncludeAllBranches` | switch | Inclure toutes les branches | `$true` |
| `Author` | string | Filtrer par auteur (regex) | `""` |
| `Since` | string | Date de début (YYYY-MM-DD ou "X days ago") | `""` |
| `Until` | string | Date de fin (YYYY-MM-DD) | `""` |
| `Branches` | string[] | Branches spécifiques | `@()` |
| `ExportCsv` | switch | Exporter aussi en CSV | `$false` |
| `ExportJson` | switch | Exporter aussi en JSON | `$false` |
| `Verbose` | switch | Mode verbose | `$false` |

## Format de sortie

### Markdown (par défaut)
- Fichier : `SUIVI_TEMPS_FACTURATION.md`
- Copie : `public/SUIVI_TEMPS_FACTURATION.md`
- Format : Markdown avec tableaux et sections détaillées

### CSV (optionnel)
- Fichier : `SUIVI_TEMPS_FACTURATION.csv`
- Colonnes : Date, Heures, Commits, Développement, Correction, Test, Documentation, Refactoring, Déploiement
- Encodage : UTF-8 sans BOM

### JSON (optionnel)
- Fichier : `SUIVI_TEMPS_FACTURATION.json`
- Structure :
  ```json
  {
    "period": { "start": "...", "end": "..." },
    "summary": {
      "totalCommits": 537,
      "totalHours": 121.0,
      "daysWorked": 19,
      "averagePerDay": 6.4,
      "categories": { ... }
    },
    "dailyReports": [ ... ]
  }
  ```

## Exemples d'utilisation

### Rapport mensuel
```powershell
pwsh scripts/generate_time_tracking.ps1 -Since "2024-12-01" -Until "2024-12-31" -ExportCsv
```

### Rapport pour un développeur spécifique
```powershell
pwsh scripts/generate_time_tracking.ps1 -Author "Maxime" -ExportJson
```

### Rapport des 30 derniers jours
```powershell
pwsh scripts/generate_time_tracking.ps1 -Since "30 days ago" -ExportCsv -ExportJson
```

### Rapport d'une branche spécifique
```powershell
pwsh scripts/generate_time_tracking.ps1 -Branches @("main") -IncludeAllBranches:$false
```

## Notes techniques

- Le script nécessite PowerShell 5.1 ou supérieur
- Git doit être installé et accessible dans le PATH
- Le script doit être exécuté depuis la racine du dépôt Git
- Les dates sont interprétées selon le fuseau horaire local
- Les commits sont dédupliqués par hash
- L'estimation du temps est basée sur l'analyse des sessions de travail

## Compatibilité

✅ Compatible avec la version précédente du script
✅ Les fichiers générés sont identiques en format Markdown
✅ Toutes les fonctionnalités existantes sont préservées

## Dépannage

### Erreur "Git n'est pas disponible"
- Installer Git : https://git-scm.com/downloads
- Vérifier que Git est dans le PATH : `git --version`

### Erreur "Ce répertoire n'est pas un dépôt Git"
- Exécuter le script depuis la racine du projet
- Vérifier que `.git` existe : `Test-Path .git`

### Aucun commit trouvé
- Vérifier les filtres (auteur, dates, branches)
- Vérifier qu'il y a bien des commits dans le dépôt : `git log --oneline`

