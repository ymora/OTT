# Dossier bin/ - Binaires locaux

Ce dossier contient les binaires nécessaires pour la compilation des firmwares.

## arduino-cli

`arduino-cli` est utilisé pour compiler les firmwares ESP32. Il doit être présent dans ce dossier ou dans le PATH système.

### Installation automatique

**Windows:**
```powershell
.\scripts\download_arduino_cli.ps1
```

**Linux/Mac:**
```bash
chmod +x scripts/download_arduino_cli.sh
./scripts/download_arduino_cli.sh
```

### Installation manuelle

1. Télécharger depuis [GitHub Releases](https://github.com/arduino/arduino-cli/releases)
2. Extraire le binaire
3. Placer `arduino-cli` (ou `arduino-cli.exe` sur Windows) dans ce dossier

### Vérification

```bash
# Windows
.\bin\arduino-cli.exe version

# Linux/Mac
./bin/arduino-cli version
```

## Note

Le binaire `arduino-cli` n'est **PAS** versionné dans Git (via `.gitignore`). Chaque développeur doit le télécharger localement ou l'installer globalement.

