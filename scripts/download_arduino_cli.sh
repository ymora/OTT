#!/usr/bin/env bash
# ================================================================================
# Script de téléchargement d'arduino-cli pour Linux/Mac
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Télécharge arduino-cli et le place dans bin/ du projet
# ================================================================================

set -euo pipefail

echo "🔧 Téléchargement d'arduino-cli pour Linux/Mac..."

# Déterminer l'OS et l'architecture
OS="linux"
ARCH="64bit"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
    ARCH="64bit"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
    ARCH="64bit"
fi

# Créer le dossier bin/ s'il n'existe pas
BIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/bin"
mkdir -p "$BIN_DIR"

# Vérifier si arduino-cli existe déjà
ARDUINO_CLI_PATH="$BIN_DIR/arduino-cli"
if [ -f "$ARDUINO_CLI_PATH" ] && [ -x "$ARDUINO_CLI_PATH" ]; then
    echo "✅ arduino-cli existe déjà dans bin/"
    "$ARDUINO_CLI_PATH" version
    exit 0
fi

# Version stable récente
VERSION="0.35.0"

# URL de téléchargement selon l'OS
if [[ "$OS" == "macOS" ]]; then
    URL="https://github.com/arduino/arduino-cli/releases/download/v${VERSION}/arduino-cli_${VERSION}_macOS_64bit.tar.gz"
    EXT="tar.gz"
elif [[ "$OS" == "Linux" ]]; then
    URL="https://github.com/arduino/arduino-cli/releases/download/v${VERSION}/arduino-cli_${VERSION}_Linux_64bit.tar.gz"
    EXT="tar.gz"
else
    echo "❌ ERREUR: OS non supporté: $OSTYPE"
    exit 1
fi

echo "📥 Téléchargement depuis GitHub..."
echo "   OS: $OS"
echo "   URL: $URL"

# Télécharger dans un dossier temporaire
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

ARCHIVE_NAME="arduino-cli.${EXT}"

# Télécharger
if command -v curl &> /dev/null; then
    curl -fsSL -o "$ARCHIVE_NAME" "$URL"
elif command -v wget &> /dev/null; then
    wget -q -O "$ARCHIVE_NAME" "$URL"
else
    echo "❌ ERREUR: curl ou wget requis pour télécharger"
    exit 1
fi

echo "📦 Extraction de l'archive..."
if [[ "$EXT" == "tar.gz" ]]; then
    tar -xzf "$ARCHIVE_NAME"
elif [[ "$EXT" == "zip" ]]; then
    unzip -q "$ARCHIVE_NAME"
fi

# Trouver le binaire
if [ -f "arduino-cli" ]; then
    BINARY="arduino-cli"
elif [ -f "bin/arduino-cli" ]; then
    BINARY="bin/arduino-cli"
else
    echo "❌ ERREUR: binaire arduino-cli non trouvé dans l'archive"
    exit 1
fi

# Copier vers bin/
cp "$BINARY" "$ARDUINO_CLI_PATH"
chmod +x "$ARDUINO_CLI_PATH"

# Nettoyer
cd - > /dev/null
rm -rf "$TEMP_DIR"

# Vérifier l'installation
echo "🔍 Vérification de l'installation..."
if "$ARDUINO_CLI_PATH" version &> /dev/null; then
    echo "✅ arduino-cli installé avec succès!"
    "$ARDUINO_CLI_PATH" version
    echo ""
    echo "📍 Emplacement: $ARDUINO_CLI_PATH"
    echo "✅ La compilation sera RÉELLE, jamais simulée"
else
    echo "❌ ERREUR: arduino-cli ne fonctionne pas"
    exit 1
fi

