#!/usr/bin/env bash
# ================================================================================
# Script de configuration complète : arduino-cli + core ESP32
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Installe arduino-cli et le core ESP32 dans le projet pour GitHub LFS
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
echo "   1. Vérifiez que .gitattributes contient hardware/arduino-data/**"
echo "   2. Installez Git LFS: git lfs install"
echo "   3. Ajoutez les fichiers: git add hardware/arduino-data/"
echo "   4. Commit: git commit -m 'Add ESP32 core with GitHub LFS'"
echo "   5. Push: git push origin main"
echo ""
echo "✅ Le core ESP32 sera maintenant versionné avec le projet"
echo "✅ Pas besoin de Persistent Disk Render (gratuit !)"

