# 🔍 Système d'Audit - Documentation

## 📋 Vue d'ensemble

Système d'audit générique et portable pour analyser la qualité, la sécurité et la structure de projets web (Next.js, React, PHP, etc.).

## 🚀 Utilisation rapide

```powershell
# Audit complet (12 phases, dépendances automatiques)
.\audit\audit.ps1 -Phases "all" -Verbose

# Audit de phases spécifiques (les dépendances sont ajoutées automatiquement)
.\audit\audit.ps1 -Phases "3,7" -Verbose

# Audit d'un fichier spécifique
.\audit\audit.ps1 -Target "file" -Path ".\api.php" -Phases "3,7" -Verbose

# Audit d'un répertoire spécifique
.\audit\audit.ps1 -Target "directory" -Path ".\app" -Phases "2,6,7" -Verbose

# Ou via le script batch
.\audit\audit.bat -Phases "all" -Verbose
```

## 📚 Documentation

- **[EXPLICATION_RESULTATS_AUDIT.md](EXPLICATION_RESULTATS_AUDIT.md)** : Comprendre les scores et résultats de l'audit
- **[INTEGRATION_IA.md](INTEGRATION_IA.md)** : Guide d'intégration IA pour vérification des cas douteux
- **[CONFIGURATION_MULTIPROJET.md](CONFIGURATION_MULTIPROJET.md)** : Configuration multiprojet et détection automatique

## 📁 Structure

```
audit/
├── audit.ps1          # Point d'entrée unique (12 phases)
├── modules/           # Modules de vérification (Invoke-Check-*)
│   ├── Checks-*.ps1         # Modules de vérification
│   ├── AI-*.ps1             # Modules d'intégration IA
│   └── Utils.ps1            # Utilitaires
├── config/            # Configuration
│   ├── audit.config.ps1         # Configuration globale (générique)
│   ├── audit.config.local.ps1   # Surcharge locale (non versionnée)
│   └── audit.config.example.ps1 # Exemple
├── projects/          # Spécificités projet (auto-détection)
│   └── ott/
│       ├── project.ps1               # Détection (retourne un score)
│       ├── config/
│       │   ├── audit.config.ps1       # Surcharge projet (versionnée)
│       │   └── audit.config.local.ps1 # Surcharge locale projet (non versionnée)
│       └── modules/                  # Overrides modules pour ce projet
├── data/              # Données de référence
│   └── expected_tables.txt   # Tables attendues
└── resultats/         # Résultats d'audit (générés, non versionnés)
    ├── phase_<id>_<timestamp>.json
    └── audit_summary_<timestamp>.json
```

## 🎯 Les 12 Phases d'Audit (ordre logique)

1. **Inventaire Complet**
2. **Architecture Projet** (dépendance: 1)
3. **Sécurité** (dépendances: 1,2)
4. **Configuration** (dépendance: 1)
5. **Backend API** (dépendances: 1,2)
6. **Frontend** (dépendances: 1,2)
7. **Qualité Code** (dépendances: 1,2)
8. **Performance** (dépendances: 1,2,5,6)
9. **Documentation** (dépendances: 1,2)
10. **Tests** (dépendances: 1,2,5)
11. **Déploiement** (dépendances: 1,4)
12. **Hardware/Firmware** (dépendance: 1)

## ⚙️ Configuration

Voir [CONFIGURATION_MULTIPROJET.md](CONFIGURATION_MULTIPROJET.md) pour la configuration détaillée.

## 📊 Comprendre les Résultats

Voir [EXPLICATION_RESULTATS_AUDIT.md](EXPLICATION_RESULTATS_AUDIT.md) pour comprendre les scores et leur calcul.

## 🤖 Intégration IA

Voir [INTEGRATION_IA.md](INTEGRATION_IA.md) pour utiliser l'IA pour vérifier les cas douteux détectés par l'audit.

