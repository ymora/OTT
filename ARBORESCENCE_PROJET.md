# 📁 Arborescence du Projet OTT V3.3

**HAPPLYZ MEDICAL SAS** - Organisation et structure du projet

---

## 🎯 Structure Principale

```
maxime/
├── 📱 app/                          # Application Next.js (Frontend)
│   ├── dashboard/                   # Pages du dashboard
│   │   ├── firmware-upload/         # ✨ NOUVEAU : Upload & compilation firmware
│   │   ├── devices/                 # Gestion dispositifs
│   │   ├── patients/                # Gestion patients
│   │   └── ...
│   └── layout.js                    # Layout principal
│
├── 🔧 api.php                       # API Backend PHP (monolithique)
│
├── 📦 components/                   # Composants React réutilisables
│   ├── FlashUSBModal.js             # Modal flash USB
│   ├── Sidebar.js                   # Menu navigation
│   └── ...
│
├── 🎨 contexts/                     # Contextes React (état global)
│   ├── AuthContext.js               # Authentification
│   └── UsbContext.js                 # Gestion USB
│
├── 📚 lib/                          # Bibliothèques utilitaires
│   ├── api.js                       # Helpers API
│   ├── config.js                    # Configuration
│   ├── usbDevices.js                # Mapping USB devices
│   ├── measurementSender.js         # Envoi mesures robuste
│   └── measurementQueue.js           # Queue mesures (IndexedDB)
│
├── 🔌 hardware/                     # Matériel & Firmware
│   ├── firmware/                    # ⚠️ FIRMWARE PRINCIPAL
│   │   ├── fw_ott_optimized/        # ✅ Firmware actuel (à utiliser)
│   │   │   ├── fw_ott_optimized.ino # 📄 Source principale
│   │   │   ├── legacy/              # Anciennes versions
│   │   │   └── README.md
│   │   └── external/                # Dépendances externes (TinyGSM)
│   ├── cad/                         # Plans CAO (STL, PDF)
│   ├── docs/                        # Documentation matériel
│   └── scripts/                     # Scripts build firmware
│       └── build_firmware.ps1       # ⚠️ Script cassé (à corriger)
│
├── 📦 firmwares/                    # Firmwares compilés (.bin)
│   ├── ino/                         # Fichiers .ino uploadés (via dashboard)
│   └── *.bin                        # Firmwares compilés prêts à flasher
│
├── 🗄️ sql/                          # Schémas & migrations base de données
│   ├── schema.sql                   # Schéma principal
│   ├── migration_add_firmware_status.sql  # ✨ NOUVEAU
│   └── ...
│
├── 🛠️ scripts/                      # Scripts utilitaires
│   ├── build_firmware_bin.ps1       # ✅ Compile .ino → .bin
│   ├── flash_firmware.ps1           # ✅ Flash direct
│   ├── deploy_api.sh                # Déploiement API
│   └── ...
│
├── 📄 public/                       # Fichiers statiques
│   ├── DOCUMENTATION_*.html         # Documentation (3 fichiers)
│   ├── screenshots/                  # Captures d'écran
│   └── ...
│
├── 🐳 Dockerfile                    # Image Docker API
├── 📋 README.md                     # Documentation principale
└── ⚙️ package.json                  # Dépendances Node.js
```

---

## ⚠️ Problèmes Identifiés & Corrections

### 1. **Firmware - Double emplacement** ✅ RÉSOLU
- **Problème** : Le firmware est dans `hardware/firmware/fw_ott_optimized/` (correct)
- **Script cassé** : `hardware/scripts/build_firmware.ps1` a des variables non définies
- **Solution** : Utiliser `scripts/build_firmware_bin.ps1` (fonctionnel)

### 2. **Dossiers vides/inutiles**
- `documentation/` → **VIDE** (peut être supprimé)
- `docs/` → Ancien build (peut être ignoré via .gitignore)
- `out/` → Build Next.js (déjà dans .gitignore)

### 3. **Scripts firmware**
- ✅ `scripts/build_firmware_bin.ps1` → **FONCTIONNEL** (utilise `hardware/firmware/`)
- ✅ `scripts/flash_firmware.ps1` → **FONCTIONNEL** (utilise `hardware/firmware/`)
- ⚠️ `hardware/scripts/build_firmware.ps1` → **CASSÉ** (variables non définies)

### 4. **API - Chemins firmwares**
- ✅ `firmwares/` → Dossier racine pour .bin compilés
- ✅ `firmwares/ino/` → Dossier pour .ino uploadés (créé automatiquement)
- ✅ Dockerfile crée `firmwares/` dans le conteneur

---

## 📍 Chemins Importants

### Firmware Source
```
hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino
```
**C'est le fichier source principal à utiliser.**

### Firmwares Compilés
```
firmwares/
├── fw_ott_v3.0-rebuild_20250121.bin    # Compilé via build_firmware_bin.ps1
└── ino/
    └── fw_ott_v3.0-rebuild_1234567890.ino  # Uploadé via dashboard
```

### Scripts de Build
```powershell
# Compiler en .bin
.\scripts\build_firmware_bin.ps1

# Flasher directement
.\scripts\flash_firmware.ps1 -Port COM6
```

---

## 🔄 Workflow Recommandé

### Pour un développeur :
1. **Modifier le firmware** : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino`
2. **Compiler localement** : `.\scripts\build_firmware_bin.ps1`
3. **Tester** : `.\scripts\flash_firmware.ps1 -Port COM6`

### Pour un admin/technicien :
1. **Upload .ino** : Menu "Firmware" → Upload fichier
2. **Compilation automatique** : Logs en direct
3. **Flash** : Page "Dispositifs" → Sélectionner firmware → OTA ou USB

---

## 🗑️ Nettoyage Recommandé

### À supprimer :
- ❌ `documentation/` (vide)
- ⚠️ `hardware/scripts/build_firmware.ps1` (cassé, remplacé par `scripts/build_firmware_bin.ps1`)

### À ignorer (.gitignore) :
- `out/` (build Next.js)
- `docs/` (ancien build)
- `firmwares/*.bin` (firmwares compilés - volumineux)
- `firmwares/ino/*.ino` (firmwares uploadés - volumineux)
- `node_modules/`

---

## ✅ État Actuel

- ✅ Firmware source : `hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino`
- ✅ Scripts build : `scripts/build_firmware_bin.ps1` et `scripts/flash_firmware.ps1`
- ✅ Dossier firmwares : `firmwares/` (créé automatiquement)
- ✅ API utilise : `firmwares/` et `firmwares/ino/`
- ✅ Dockerfile : Crée `firmwares/` dans le conteneur

---

**Dernière mise à jour** : 2025-01-21

