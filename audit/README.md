# 🔍 Système d'Audit Complet et Portable

Système d'audit ultra-complet, portable et adaptable à tous types de projets.

## 🚀 Lancement Rapide

**Windows** : Double-cliquez sur `audit.bat`

**PowerShell** :
```powershell
.\audit\audit.ps1
```

## 📁 Structure

```
audit/
├── audit.ps1              # Launcher principal
├── audit.bat              # Launcher Windows
├── README.md              # Ce fichier
├── modules/               # Modules de vérification
│   ├── Checks-*.ps1      # Modules de checks
│   ├── ProjectDetector.ps1
│   ├── ConfigLoader.ps1
│   └── Utils.ps1
├── scripts/               # Scripts spécialisés
│   ├── Audit-Phases.ps1   # Définition des phases
│   ├── Audit-Firmware.ps1 # Audit firmware
│   └── Audit-Database.ps1 # Audit base de données
├── config/                # Configurations
│   └── audit.config.example.ps1
├── resultats/             # Résultats (générés)
└── plans/                 # Plans de correction (générés)
```

## ✨ Fonctionnalités

- ✅ Détection automatique du type de projet
- ✅ 21 phases d'audit complètes
- ✅ Support multi-technologies (PHP, Node.js, React, Next.js, etc.)
- ✅ Audit firmware (Arduino/ESP32)
- ✅ Audit base de données
- ✅ Détection code mort et duplication
- ✅ Vérifications sécurité
- ✅ Tests API automatiques
- ✅ Rapports détaillés

## 📖 Documentation

Voir les fichiers dans `audit/` pour plus de détails.

