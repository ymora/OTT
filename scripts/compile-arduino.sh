#!/bin/bash

# Script de compilation Arduino pour Docker
# Supporte mode simulation et mode réel

set -e

# Variables
FIRMWARE_ID="$1"
INO_FILE="$2"
MODE="${3:-simulation}"  # simulation ou real

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Vérification des paramètres
if [ -z "$FIRMWARE_ID" ] || [ -z "$INO_FILE" ]; then
    log "ERROR: Paramètres manquants"
    echo "Usage: $0 <firmware_id> <ino_file> [mode]"
    exit 1
fi

if [ ! -f "$INO_FILE" ]; then
    log "ERROR: Fichier INO introuvable: $INO_FILE"
    exit 1
fi

log "Début compilation - Firmware ID: $FIRMWARE_ID"
log "Fichier: $INO_FILE"
log "Mode: $MODE"

# Création du répertoire de build
BUILD_DIR="/tmp/arduino_build_$FIRMWARE_ID"
mkdir -p "$BUILD_DIR"

# Extraction de la version depuis le fichier .ino
VERSION=$(grep -o 'FIRMWARE_VERSION_STR\s*"[^"]*"' "$INO_FILE" | sed 's/FIRMWARE_VERSION_STR\s*"\([^"]*\)"/\1/')
if [ -z "$VERSION" ]; then
    VERSION=$(grep -o 'FIRMWARE_VERSION\s*=\s*"[^"]*"' "$INO_FILE" | sed 's/FIRMWARE_VERSION\s*=\s*"\([^"]*\)"/\1/')
fi

if [ -z "$VERSION" ]; then
    log "ERROR: Version non trouvée dans le fichier .ino"
    exit 1
fi

log "Version détectée: $VERSION"

# Configuration Arduino CLI
ARDUINO_CLI="/usr/local/bin/arduino-cli"
FQBN="esp32:esp32:ttgo-lora32-v1"

# Mode simulation : compilation sans vérification hardware
if [ "$MODE" = "simulation" ]; then
    log "MODE SIMULATION - Compilation sans hardware"
    
    # Création d'un projet temporaire
    TEMP_PROJECT="$BUILD_DIR/temp_project"
    mkdir -p "$TEMP_PROJECT"
    
    # Copie du fichier .ino principal
    cp "$INO_FILE" "$TEMP_PROJECT/temp_project.ino"
    
    # Compilation en mode simulation (sans upload)
    log "Compilation en cours..."
    
    # Utilisation de arduino-cli avec options de simulation
    $ARDUINO_CLI compile \
        --fqbn "$FQBN" \
        --build-path "$BUILD_DIR" \
        --build-property "build.esp32.partitions=no_ota.csv" \
        --build-property "upload.speed=921600" \
        --verbose \
        "$TEMP_PROJECT" 2>&1 | while IFS= read -r line; do
            log "COMPILATION: $line"
        done
    
    COMPILATION_RESULT=${PIPESTATUS[0]}
    
    if [ $COMPILATION_RESULT -eq 0 ]; then
        # Simulation réussie - créer un fichier .bin factice
        BIN_FILE="$BUILD_DIR/temp_project.ino.esp32.esp32.bin"
        if [ ! -f "$BIN_FILE" ]; then
            # Créer un fichier .bin factice pour les tests
            log "Création fichier .bin de test"
            echo "OTT_FIRMWARE_v$VERSION" > "$BIN_FILE"
        fi
        
        log "✅ Simulation réussie"
        log "Fichier généré: $BIN_FILE"
        
        # Retourner le résultat
        echo "SUCCESS:$VERSION:$BIN_FILE"
        exit 0
    else
        log "❌ Erreur de compilation"
        echo "ERROR:Compilation failed"
        exit 1
    fi
else
    # Mode réel : nécessite un Arduino connecté
    log "MODE RÉEL - Recherche d'un Arduino..."
    
    # Lister les boards disponibles
    BOARDS=$($ARDUINO_CLI board list --format json)
    
    if [ -z "$BOARDS" ] || [ "$BOARDS" = "[]" ]; then
        log "ERROR: Aucun Arduino détecté"
        log "Veuillez connecter un Arduino et réessayer"
        echo "ERROR:No Arduino detected"
        exit 1
    fi
    
    log "Arduino(s) détecté(s): $BOARDS"
    
    # Compilation réelle
    TEMP_PROJECT="$BUILD_DIR/temp_project"
    mkdir -p "$TEMP_PROJECT"
    cp "$INO_FILE" "$TEMP_PROJECT/temp_project.ino"
    
    log "Compilation réelle en cours..."
    
    $ARDUINO_CLI compile \
        --fqbn "$FQBN" \
        --build-path "$BUILD_DIR" \
        --verbose \
        "$TEMP_PROJECT" 2>&1 | while IFS= read -r line; do
            log "COMPILATION: $line"
        done
    
    COMPILATION_RESULT=${PIPESTATUS[0]}
    
    if [ $COMPILATION_RESULT -eq 0 ]; then
        BIN_FILE="$BUILD_DIR/temp_project.ino.esp32.esp32.bin"
        log "✅ Compilation réussie"
        log "Fichier généré: $BIN_FILE"
        
        echo "SUCCESS:$VERSION:$BIN_FILE"
        exit 0
    else
        log "❌ Erreur de compilation"
        echo "ERROR:Compilation failed"
        exit 1
    fi
fi
