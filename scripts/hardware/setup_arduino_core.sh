#!/usr/bin/env bash
# ================================================================================
# Script de configuration complète : arduino-cli + core ESP32
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Installe arduino-cli et le core ESP32 en local (cache non versionné)
# ================================================================================

set -euo pipefail

echo "🚀 Configuration complète arduino-cli + core ESP32"
echo ""

# Étape 1: Installer arduino-cli
echo "📦 Étape 1: Installation d'arduino-cli..."
bash "$(dirname "$0")/download_arduino_cli.sh"
if [ $? -ne 0 ]; then
    echo "❌ Échec de l'installation d'arduino-cli"
    exit 1
fi

echo ""

# Étape 2: Installer le core ESP32
echo "📦 Étape 2: Installation du core ESP32..."
bash "$(dirname "$0")/prepare_arduino_core.sh"
if [ $? -ne 0 ]; then
    echo "❌ Échec de l'installation du core ESP32"
    exit 1
fi

echo ""
echo "✅ Configuration terminée !"
echo ""
echo "📝 Prochaines étapes:"
echo "   1. Vérifiez que .gitignore contient hardware/arduino-data/"
echo "   2. Montez un disque persistant (Render) pointant vers hardware/arduino-data/ pour conserver le cache"
echo "   3. Sinon, relancez ce script à chaque fois que vous nettoyez le dossier"
echo ""
echo "✅ Le core ESP32 est prêt en local"
echo "✅ Configurez Render pour réutiliser ce cache (Persistent Disk recommandé)"

