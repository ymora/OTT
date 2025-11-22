#!/usr/bin/env bash
# ================================================================================
# Script d'installation d'arduino-cli pour Render
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Installe arduino-cli sur le serveur Render pour la compilation des firmwares
# ⚠️ CRITIQUE: La compilation ne doit JAMAIS être simulée
# ================================================================================

set -euo pipefail

echo "🔧 Installation d'arduino-cli (OBLIGATOIRE pour compilation réelle)..."

# Vérifier si arduino-cli est déjà installé et fonctionnel
if command -v arduino-cli &> /dev/null; then
    if arduino-cli version &> /dev/null; then
        echo "✅ arduino-cli est déjà installé et fonctionnel"
        arduino-cli version
        exit 0
    else
        echo "⚠️ arduino-cli trouvé mais non fonctionnel, réinstallation..."
    fi
fi

# Créer le répertoire de destination si nécessaire
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"

# Télécharger et installer arduino-cli
echo "📥 Téléchargement d'arduino-cli..."
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Utiliser le script d'installation officiel
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR="$TEMP_DIR/bin" sh

# Vérifier que le binaire a été téléchargé
if [ ! -f "$TEMP_DIR/bin/arduino-cli" ]; then
    echo "❌ ERREUR: Le binaire arduino-cli n'a pas été téléchargé"
    exit 1
fi

# Déplacer vers un emplacement accessible dans le PATH
echo "📦 Installation d'arduino-cli dans $INSTALL_DIR..."
mv "$TEMP_DIR/bin/arduino-cli" "$INSTALL_DIR/arduino-cli"
chmod +x "$INSTALL_DIR/arduino-cli"

# Nettoyer
rm -rf "$TEMP_DIR"

# Ajouter au PATH pour cette session
export PATH="$INSTALL_DIR:$PATH"

# Ajouter au PATH permanent (pour les sessions futures)
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.bashrc
    echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.profile
fi

# Vérifier l'installation
if command -v arduino-cli &> /dev/null; then
    VERSION=$(arduino-cli version 2>&1 || echo "erreur")
    if echo "$VERSION" | grep -q "arduino-cli"; then
        echo "✅ arduino-cli installé avec succès"
        arduino-cli version
        echo ""
        echo "✅ Installation terminée - La compilation sera RÉELLE, jamais simulée"
    else
        echo "❌ ERREUR: arduino-cli installé mais ne fonctionne pas"
        echo "Sortie: $VERSION"
        exit 1
    fi
else
    echo "❌ ERREUR CRITIQUE: arduino-cli n'a pas pu être installé"
    echo "Le serveur ne pourra PAS compiler les firmwares (compilation refusée, jamais simulée)"
    exit 1
fi

