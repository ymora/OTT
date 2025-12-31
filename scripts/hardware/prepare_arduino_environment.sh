#!/bin/bash
# ================================================================================
# Script de préparation de l'environnement Arduino pour compilation
# ================================================================================
# Télécharge et installe tous les fichiers nécessaires pour la compilation :
# - Core ESP32 (arduino-cli core install esp32:esp32)
# - Librairies (TinyGSM depuis hardware/lib/)
# - Met à jour l'index des cores
# ================================================================================

set -e

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Obtenir le répertoire du script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
HARDWARE_DIR="$PROJECT_ROOT/hardware"
ARDUINO_DATA_DIR="$HARDWARE_DIR/arduino-data"

echo -e "${CYAN}🔧 Préparation de l'environnement Arduino pour compilation rapide${NC}"
echo ""

# ================================================================================
# 1. Vérifier que arduino-cli est disponible
# ================================================================================
echo -e "${YELLOW}📋 Étape 1/4: Vérification d'arduino-cli...${NC}"

ARDUINO_CLI=""

# 1. Chercher dans bin/ du projet
if [ -f "$PROJECT_ROOT/bin/arduino-cli" ]; then
    ARDUINO_CLI="$PROJECT_ROOT/bin/arduino-cli"
    echo -e "${GREEN}  ✅ arduino-cli trouvé dans bin/ du projet${NC}"
# 2. Chercher dans ~/.local/bin/ (emplacement standard)
elif [ -f "$HOME/.local/bin/arduino-cli" ]; then
    ARDUINO_CLI="$HOME/.local/bin/arduino-cli"
    echo -e "${GREEN}  ✅ arduino-cli trouvé dans ~/.local/bin/${NC}"
# 3. Chercher dans le PATH système
elif command -v arduino-cli &> /dev/null; then
    ARDUINO_CLI="arduino-cli"
    echo -e "${GREEN}  ✅ arduino-cli trouvé dans le PATH système${NC}"
else
    echo -e "${RED}  ❌ arduino-cli non trouvé !${NC}"
    echo -e "${YELLOW}  💡 Options:${NC}"
    echo -e "${GRAY}     - Téléchargez arduino-cli: ./scripts/hardware/install_arduino_cli.sh${NC}"
    echo -e "${GRAY}     - Ou installez-le globalement: https://arduino.github.io/arduino-cli/latest/installation/${NC}"
    exit 1
fi

# Tester arduino-cli
VERSION=$($ARDUINO_CLI version 2>&1)
echo -e "${GRAY}  ℹ️  Version: $VERSION${NC}"
echo ""

# ================================================================================
# 2. Créer le répertoire hardware/arduino-data si nécessaire
# ================================================================================
echo -e "${YELLOW}📋 Étape 2/4: Configuration du répertoire arduino-data...${NC}"

if [ ! -d "$ARDUINO_DATA_DIR" ]; then
    echo -e "${CYAN}  📁 Création du répertoire hardware/arduino-data...${NC}"
    mkdir -p "$ARDUINO_DATA_DIR"
    echo -e "${GREEN}  ✅ Répertoire créé${NC}"
else
    echo -e "${GREEN}  ✅ Répertoire hardware/arduino-data existe déjà${NC}"
fi

# Définir ARDUINO_DIRECTORIES_USER
export ARDUINO_DIRECTORIES_USER="$ARDUINO_DATA_DIR"
echo -e "${GRAY}  ℹ️  ARDUINO_DIRECTORIES_USER = $ARDUINO_DATA_DIR${NC}"
echo ""

# ================================================================================
# 3. Vérifier et installer le core ESP32
# ================================================================================
echo -e "${YELLOW}📋 Étape 3/4: Vérification du core ESP32...${NC}"

CORE_PATH="$ARDUINO_DATA_DIR/packages/esp32/hardware/esp32"
CORE_INSTALLED=false

if [ -d "$CORE_PATH" ]; then
    CORE_INSTALLED=true
    echo -e "${GREEN}  ✅ Core ESP32 déjà installé dans hardware/arduino-data/${NC}"
    CORE_SIZE=$(du -sh "$CORE_PATH" 2>/dev/null | cut -f1 || echo "N/A")
    echo -e "${GRAY}  ℹ️  Taille: $CORE_SIZE${NC}"
else
    echo -e "${CYAN}  ⏳ Core ESP32 non installé, installation en cours...${NC}"
    echo -e "${YELLOW}  ⚠️  Cette opération peut prendre plusieurs minutes (~568MB à télécharger)...${NC}"
    echo ""
    
    # Mettre à jour l'index des cores (seulement si nécessaire)
    INDEX_FILE="$ARDUINO_DATA_DIR/package_index.json"
    SHOULD_UPDATE_INDEX=true
    if [ -f "$INDEX_FILE" ]; then
        INDEX_AGE=$(( ($(date +%s) - $(stat -c %Y "$INDEX_FILE" 2>/dev/null || echo 0)) / 3600 ))
        if [ "$INDEX_AGE" -lt 24 ]; then
            SHOULD_UPDATE_INDEX=false
            echo -e "${GREEN}  ✅ Index des cores récent (moins de 24h), pas besoin de mise à jour${NC}"
        fi
    fi
    
    if [ "$SHOULD_UPDATE_INDEX" = true ]; then
        echo -e "${CYAN}  🔄 Mise à jour de l'index des cores Arduino...${NC}"
        $ARDUINO_CLI core update-index 2>&1 | grep -v "^$" || true
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            echo -e "${GREEN}  ✅ Index mis à jour${NC}"
        else
            echo -e "${YELLOW}  ⚠️  Avertissement lors de la mise à jour de l'index (continuons quand même)${NC}"
        fi
    fi
    
    echo -e "${CYAN}  📥 Téléchargement et installation du core ESP32...${NC}"
    echo -e "${YELLOW}  ⏳ Veuillez patienter, cette étape peut prendre 5-15 minutes selon votre connexion...${NC}"
    
    # Installer le core ESP32 avec verbose pour voir la progression
    if $ARDUINO_CLI core install esp32:esp32 --verbose 2>&1; then
        echo -e "${GREEN}  ✅ Core ESP32 installé avec succès !${NC}"
        CORE_SIZE=$(du -sh "$CORE_PATH" 2>/dev/null | cut -f1 || echo "N/A")
        echo -e "${GRAY}  ℹ️  Taille finale: $CORE_SIZE${NC}"
    else
        echo -e "${RED}  ❌ Erreur lors de l'installation du core ESP32${NC}"
        exit 1
    fi
fi

echo ""

# ================================================================================
# 4. Copier les librairies nécessaires dans arduino-data/libraries
# ================================================================================
echo -e "${YELLOW}📋 Étape 4/4: Installation des librairies...${NC}"

HARDWARE_LIB_DIR="$HARDWARE_DIR/lib"
ARDUINO_DATA_LIBRARIES_DIR="$ARDUINO_DATA_DIR/libraries"

if [ ! -d "$HARDWARE_LIB_DIR" ]; then
    echo -e "${YELLOW}  ⚠️  Répertoire hardware/lib/ non trouvé, pas de librairies à installer${NC}"
    echo ""
else
    # Créer le répertoire libraries si nécessaire
    mkdir -p "$ARDUINO_DATA_LIBRARIES_DIR"
    
    # Trouver les librairies TinyGSM
    LIB_DIRS=$(find "$HARDWARE_LIB_DIR" -maxdepth 1 -type d -name "TinyGSM*" 2>/dev/null || true)
    
    if [ -z "$LIB_DIRS" ]; then
        echo -e "${YELLOW}  ⚠️  Aucune librairie TinyGSM trouvée dans hardware/lib/${NC}"
    else
        for LIB_DIR in $LIB_DIRS; do
            LIB_NAME=$(basename "$LIB_DIR")
            TARGET_LIB_DIR="$ARDUINO_DATA_LIBRARIES_DIR/$LIB_NAME"
            
            if [ -d "$TARGET_LIB_DIR" ]; then
                echo -e "${GREEN}  ✅ Librairie $LIB_NAME déjà installée dans arduino-data/libraries/${NC}"
            else
                echo -e "${CYAN}  📚 Installation de la librairie $LIB_NAME...${NC}"
                
                # Copier récursivement
                cp -r "$LIB_DIR" "$TARGET_LIB_DIR"
                
                if [ -d "$TARGET_LIB_DIR" ]; then
                    LIB_SIZE=$(du -sh "$TARGET_LIB_DIR" 2>/dev/null | cut -f1 || echo "N/A")
                    echo -e "${GREEN}  ✅ Librairie $LIB_NAME installée ($LIB_SIZE)${NC}"
                else
                    echo -e "${RED}  ❌ Erreur lors de l'installation de $LIB_NAME${NC}"
                fi
            fi
        done
    fi
fi

echo ""

# ================================================================================
# Résumé final
# ================================================================================
echo -e "${GREEN}✅ Préparation terminée !${NC}"
echo ""
echo -e "${CYAN}📊 Résumé:${NC}"
echo -e "${GRAY}  ✅ arduino-cli: $ARDUINO_CLI${NC}"

if [ -d "$CORE_PATH" ]; then
    CORE_SIZE=$(du -sh "$CORE_PATH" 2>/dev/null | cut -f1 || echo "N/A")
    echo -e "${GRAY}  ✅ Core ESP32: Installé ($CORE_SIZE)${NC}"
else
    echo -e "${RED}  ❌ Core ESP32: Non installé${NC}"
fi

INSTALLED_LIBS=""
if [ -d "$ARDUINO_DATA_LIBRARIES_DIR" ]; then
    INSTALLED_LIBS=$(ls -1 "$ARDUINO_DATA_LIBRARIES_DIR" 2>/dev/null | tr '\n' ', ' | sed 's/,$//' || echo "")
fi
if [ -n "$INSTALLED_LIBS" ]; then
    echo -e "${GRAY}  ✅ Librairies: $INSTALLED_LIBS${NC}"
else
    echo -e "${YELLOW}  ⚠️  Librairies: Aucune installée${NC}"
fi

echo ""
echo -e "${GREEN}💡 L'environnement est prêt pour la compilation !${NC}"
echo -e "${GRAY}   Les compilations futures seront plus rapides car tout est déjà téléchargé.${NC}"








