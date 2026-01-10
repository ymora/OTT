# Installation des bibliothèques Arduino pour OTT Project
# Exécuter ce script pour configurer l'environnement Arduino

Write-Host "Configuration Arduino pour OTT Project..." -ForegroundColor Green

# Vérifier si arduino-cli est installé
try {
    arduino-cli version | Out-Null
    Write-Host "✅ Arduino CLI trouvé" -ForegroundColor Green
} catch {
    Write-Host "❌ Arduino CLI non trouvé. Veuillez l'installer depuis https://arduino.github.io/arduino-cli/latest/installation/" -ForegroundColor Red
    exit 1
}

# Créer les répertoires nécessaires
$arduinoData = ".\hardware\arduino-data"
New-Item -ItemType Directory -Force -Path "$arduinoData\libraries" | Out-Null
New-Item -ItemType Directory -Force -Path "$arduinoData\hardware" | Out-Null

# Installer la plateforme ESP32
Write-Host "📦 Installation de la plateforme ESP32..." -ForegroundColor Yellow
arduino-cli core install esp32:esp32

# Installer les bibliothèques requises
Write-Host "📚 Installation des bibliothèques requises..." -ForegroundColor Yellow
arduino-cli lib install ArduinoJson@6.21.3
arduino-cli lib install TinyGSM@0.12.0
arduino-cli lib install ArduinoHttpClient@0.4.0

# Vérifier l'installation
Write-Host "🔍 Vérification de l'installation..." -ForegroundColor Yellow
arduino-cli core list
arduino-cli lib list

# Configuration des paths
Write-Host "⚙️ Configuration des paths Arduino..." -ForegroundColor Yellow
arduino-cli config init --overwrite
arduino-cli config set directories.data "$PWD\hardware\arduino-data"
arduino-cli config set directories.user "$PWD\hardware\arduino-data"

Write-Host "✅ Configuration Arduino terminée !" -ForegroundColor Green
Write-Host "Vous pouvez maintenant compiler les fichiers .ino avec :" -ForegroundColor Cyan
Write-Host "arduino-cli compile --fqbn esp32:esp32:ttgo-lora32 .\hardware\firmware\fw_ott_optimized\fw_ott_optimized.ino" -ForegroundColor White
