#!/usr/bin/env bash
# ================================================================================
# Script de préparation du core ESP32 pour arduino-cli
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Télécharge et installe le core ESP32 dans arduino-data/ du projet
# ================================================================================

set -euo pipefail

echo "🔧 Préparation du core ESP32 pour arduino-cli..."

# Vérifier que arduino-cli est installé (chercher dans PATH et ~/.local/bin)
if ! command -v arduino-cli &> /dev/null; then
    # Essayer d'ajouter ~/.local/bin au PATH
    export PATH="${HOME}/.local/bin:${PATH}"
    if ! command -v arduino-cli &> /dev/null; then
        echo "❌ ERREUR: arduino-cli n'est pas installé"
        echo "Exécutez d'abord: bash scripts/install_arduino_cli.sh"
        exit 1
    fi
fi

# Créer le répertoire hardware/arduino-data dans le projet (versionné avec GitHub LFS)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARDUINO_DATA_DIR="$PROJECT_ROOT/hardware/arduino-data"

echo "📁 Création du répertoire arduino-data..."
mkdir -p "$ARDUINO_DATA_DIR"

# Configurer arduino-cli pour utiliser ce répertoire
export ARDUINO_DIRECTORIES_USER="$ARDUINO_DATA_DIR"

# Vérifier si le core ESP32 est déjà installé (format: esp32:esp32 ou esp-rv32)
if arduino-cli core list 2>/dev/null | grep -qE "(esp32:esp32|esp-rv32)"; then
    echo "✅ Core ESP32 déjà installé dans $ARDUINO_DATA_DIR"
    arduino-cli core list
    exit 0
fi

echo "📥 Téléchargement et installation du core ESP32..."
echo "⏳ Cela peut prendre plusieurs minutes (téléchargement ~430MB)..."

# Mettre à jour l'index
echo "📦 Mise à jour de l'index des cores..."
arduino-cli core update-index

# Installer le core ESP32
echo "📥 Installation du core ESP32..."
arduino-cli core install esp32:esp32

# Vérifier l'installation (format: esp32:esp32 ou esp-rv32)
if arduino-cli core list 2>/dev/null | grep -qE "(esp32:esp32|esp-rv32)"; then
    echo "✅ Core ESP32 installé avec succès dans $ARDUINO_DATA_DIR"
    echo ""
    echo "📊 Taille du répertoire arduino-data:"
    du -sh "$ARDUINO_DATA_DIR"
    echo ""
    echo "✅ Le core ESP32 est maintenant disponible localement"
    echo "   Les prochaines compilations utiliseront ce core sans retéléchargement"
else
    echo "❌ ERREUR: Le core ESP32 n'a pas pu être installé"
    exit 1
fi

