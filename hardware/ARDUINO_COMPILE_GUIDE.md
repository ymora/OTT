# Guide de compilation Arduino pour OTT Project

## 🎯 Objectif
Compiler les fichiers `.ino` du firmware OTT avec Arduino CLI

## 🔧 Prérequis

### 1. Installer Arduino CLI
```bash
# Windows (PowerShell)
iwr -useb https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | iex

# Ou télécharger depuis : https://arduino.github.io/arduino-cli/latest/installation/
```

### 2. Configurer l'environnement
```powershell
# Exécuter le script de configuration
cd "d:\Windsurf\OTT\hardware"
.\setup-arduino.ps1
```

## 🚀 Compilation des firmwares

### Firmware principal (optimisé)
```bash
# Compiler le firmware principal
arduino-cli compile --fqbn esp32:esp32:ttgo-lora32 .\firmware\fw_ott_optimized\fw_ott_optimized.ino

# Upload sur la carte (si connectée)
arduino-cli upload --fqbn esp32:esp32:ttgo-lora32 --port COM3 .\firmware\fw_ott_optimized\fw_ott_optimized.ino
```

### Firmware v2.5
```bash
# Compiler firmware v2.5 ID1
arduino-cli compile --fqbn esp32:esp32:ttgo-lora32 .\firmware\v2.5\fw_ott_v2.5_id1.ino

# Compiler firmware v2.5 ID5
arduino-cli compile --fqbn esp32:esp32:ttgo-lora32 .\firmware\v2.5\fw_ott_v2.5_id5.ino
```

### Firmware de test
```bash
# Compiler firmware de test simple
arduino-cli compile --fqbn esp32:esp32:ttgo-lora32 .\firmware\test_simple\test_simple.ino
```

## 📋 Bibliothèques requises

Les bibliothèques suivantes sont automatiquement installées par le script :
- **ArduinoJson@6.21.3** : Pour la sérialisation JSON
- **TinyGSM@0.12.0** : Pour la communication 4G/GSM
- **ArduinoHttpClient@0.4.0** : Pour les requêtes HTTP

## 🔍 Vérification

### Lister les plateformes installées
```bash
arduino-cli core list
```

### Lister les bibliothèques installées
```bash
arduino-cli lib list
```

### Vérifier la carte connectée
```bash
arduino-cli board list
```

## 🛠️ Configuration matérielle

### Carte cible
- **Type** : ESP32 Dev Board
- **Variante** : TTGO LoRa32 (compatible avec TTGO T-A7670G)
- **FQBN** : `esp32:esp32:ttgo-lora32`

### Port série
- **Windows** : `COM3`, `COM4`, etc.
- **Linux** : `/dev/ttyUSB0`, `/dev/ttyACM0`
- **macOS** : `/dev/cu.usbserial-*`

## 🚨 Dépannage

### Erreur : Bibliothèque non trouvée
```bash
# Réinstaller les bibliothèques
arduino-cli lib install ArduinoJson TinyGSM ArduinoHttpClient
```

### Erreur : Platforme ESP32 non trouvée
```bash
# Réinstaller la plateforme ESP32
arduino-cli core install esp32:esp32
```

### Erreur : Carte non détectée
```bash
# Vérifier les ports disponibles
arduino-cli board list

# Installer les drivers USB-CDC si nécessaire
```

### Erreur : Compilation échouée
```bash
# Nettoyer et recompiler
arduino-cli compile --clean --fqbn esp32:esp32:ttgo-lora32 .\firmware\fw_ott_optimized\fw_ott_optimized.ino
```

## 📝 Notes importantes

1. **Assurez-vous que les bibliothèques sont dans le bon répertoire** : `./hardware/arduino-data/libraries/`
2. **Le firmware utilise A7670G** qui est compatible avec la configuration SIM7600
3. **Les fichiers .ino incluent automatiquement les bibliothèques** nécessaires
4. **La configuration est spécifique à la carte TTGO T-A7670G**

## 🎉 Résultat

Une fois compilé, le firmware sera disponible dans :
- `./build/` pour les fichiers binaires
- Peut être uploadé directement sur la carte ESP32

Pour plus d'options, voir : `arduino-cli compile --help`
