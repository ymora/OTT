# 📊 Explication des Résultats de l'Audit (12 phases)

Ce document décrit le format des résultats et le calcul du score pour le système d'audit basé sur `audit/audit.ps1`.

## 🔍 Structure de l'audit

L'audit est organisé en **12 phases** (avec dépendances). Chaque phase exécute une ou plusieurs vérifications (modules `Checks-*.ps1`).

Les phases actuellement définies dans `audit.ps1` sont :

| Phase | Nom | Catégorie | Modules |
|------:|-----|-----------|---------|
| 1 | Inventaire Complet | Structure | `Checks-Inventory.ps1` |
| 2 | Architecture Projet | Structure | `Checks-Architecture.ps1`, `Checks-Organization.ps1` |
| 3 | Sécurité | Sécurité | `Checks-Security.ps1` |
| 4 | Configuration | Configuration | `Checks-ConfigConsistency.ps1` |
| 5 | Backend API | Backend | `Checks-API.ps1`, `Checks-StructureAPI.ps1`, `Checks-Database.ps1` |
| 6 | Frontend | Frontend | `Checks-Routes.ps1`, `Checks-UI.ps1` |
| 7 | Qualité Code | Qualité | `Checks-CodeMort.ps1`, `Checks-Duplication.ps1`, `Checks-Complexity.ps1` |
| 8 | Performance | Performance | `Checks-Performance.ps1`, `Checks-Optimizations.ps1` |
| 9 | Documentation | Documentation | `Checks-Documentation.ps1`, `Checks-MarkdownFiles.ps1` |
| 10 | Tests | Tests | `Checks-Tests.ps1`, `Checks-FunctionalTests.ps1` |
| 11 | Déploiement | Déploiement | (aucun module pour le moment) |
| 12 | Hardware/Firmware | Hardware | `Checks-FirmwareInteractive.ps1` |

## 📁 Fichiers générés

Les résultats sont écrits dans `audit/resultats/`.

### 1) Résultat par phase

Pour chaque phase exécutée :

`phase_<ID>_<timestamp>.json`

Ce fichier contient :
- la définition de la phase (id/nom/dépendances/modules)
- l'état de chaque module exécuté (succès / erreur)

Structure (extrait) :
```json
{
  "Phase": {
    "Id": 1,
    "Name": "Inventaire Complet",
    "Dependencies": [],
    "Modules": ["Checks-Inventory.ps1"]
  },
  "Results": [
    {
      "Module": "Checks-Inventory.ps1",
      "Status": "SUCCESS",
      "DurationMs": 1234,
      "Timestamp": "2026-01-04T20:00:00"
    }
  ],
  "Timestamp": "2026-01-04T20:00:00"
}
```

En cas d'erreur module :
```json
{
  "Module": "Checks-MarkdownFiles.ps1",
  "Status": "ERROR",
  "Error": "...",
  "DurationMs": 12
}
```

### 2) Résumé global

En fin d'audit :

`audit_summary_<timestamp>.json`

Structure (extrait) :
```json
{
  "AuditVersion": "2.0.0",
  "Target": "project",
  "ProjectRoot": "...",
  "PhasesExecuted": [1,2,3],
  "Results": [ /* liste des phase_*.json (contenu en mémoire) */ ],
  "Summary": {
    "TotalPhases": 3,
    "SuccessfulModules": 10,
    "FailedModules": 1,
    "GlobalScore": 6.7
  }
}
```

## 📈 Comment fonctionne le scoring

### 1) Où sont stockés les scores ?

Les modules alimentent un dictionnaire :

`$Results.Scores["<Categorie>"] = <note sur 10>`

Exemple :
```json
{
  "Architecture": 10,
  "API": 4.5,
  "Database": 5,
  "CodeMort": 10,
  "Complexity": 8,
  "Security": 10
}
```

### 2) Score global = moyenne pondérée

Le score global est calculé par `Calculate-GlobalScore` (dans `audit/modules/Utils.ps1`).

Les poids proviennent en priorité de :

`$AuditConfig.ScoreWeights`

Puis un jeu de poids par défaut est utilisé si absent.

Formule :
```
Score Global = (Somme(score_categorie × poids_categorie)) / (Somme(poids_categorie))
```

### 3) Pourquoi le score global peut être bas avec beaucoup de 10/10 ?

Parce que :
- certaines catégories ont un poids faible
- d'autres catégories (souvent backend/sécurité/qualité) ont un poids plus fort

Donc une note basse sur une catégorie “fortement pondérée” peut faire baisser significativement le global.

## ✅ Conseils de lecture

- Les fichiers `phase_*.json` permettent de voir rapidement si un module a crashé (statut `ERROR`).
- Le fichier `audit_summary_*.json` permet de savoir :
  - quelles phases ont été exécutées
  - combien de modules ont échoué
  - le score global
- Pour diagnostiquer un module : relancer avec `-Verbose` et ne cibler qu'une phase via `-Phases "<id>"`.

