#!/usr/bin/env python3
"""
Script pour extraire la version du firmware depuis un fichier .bin compilé.

Usage:
    python extract_version.py firmware.bin
    python extract_version.py firmware.bin --json

Le script recherche la section .version dans le binaire qui contient:
    OTT_FW_VERSION=<version>

Si la section n'est pas trouvée, il essaie de chercher la chaîne FIRMWARE_VERSION
dans le binaire.
"""

import sys
import re
import argparse
import json

def extract_version_from_bin(bin_path):
    """
    Extrait la version du firmware depuis un fichier .bin.
    
    Retourne:
        str: Version trouvée ou None si non trouvée
    """
    try:
        with open(bin_path, 'rb') as f:
            data = f.read()
    except FileNotFoundError:
        print(f"Erreur: Fichier {bin_path} introuvable", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Erreur lors de la lecture: {e}", file=sys.stderr)
        return None
    
    # Méthode 1: Chercher la section .version avec OTT_FW_VERSION=
    # Format: "OTT_FW_VERSION=<version>\0"
    pattern1 = rb'OTT_FW_VERSION=([^\x00]+)'
    match = re.search(pattern1, data)
    if match:
        version = match.group(1).decode('utf-8', errors='ignore').strip()
        return version
    
    # Méthode 2: Chercher directement la chaîne de version dans le binaire
    # Format: "3.0-rebuild" ou similaire
    # On cherche des patterns de version comme X.Y ou X.Y-Z
    version_patterns = [
        rb'(\d+\.\d+[-\w]*)',  # Format: 3.0-rebuild, 1.2.3, etc.
        rb'v(\d+\.\d+[-\w]*)',  # Format: v3.0-rebuild
    ]
    
    for pattern in version_patterns:
        matches = re.findall(pattern, data)
        if matches:
            # Prendre la première correspondance qui ressemble à une version
            for match in matches:
                version = match.decode('utf-8', errors='ignore').strip()
                # Valider que ça ressemble à une version
                if re.match(r'^\d+\.\d+', version):
                    return version
    
    # Méthode 3: Chercher FIRMWARE_VERSION dans les strings
    # Format: "FIRMWARE_VERSION" suivi de la version
    firmware_version_pattern = rb'FIRMWARE_VERSION[^\x00]*?([\d\.\-]+)'
    match = re.search(firmware_version_pattern, data)
    if match:
        version = match.group(1).decode('utf-8', errors='ignore').strip()
        return version
    
    return None

def main():
    parser = argparse.ArgumentParser(
        description='Extrait la version du firmware depuis un fichier .bin compilé'
    )
    parser.add_argument(
        'bin_file',
        help='Chemin vers le fichier .bin du firmware'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Afficher le résultat en JSON'
    )
    parser.add_argument(
        '--field',
        default='version',
        help='Nom du champ JSON (défaut: version)'
    )
    
    args = parser.parse_args()
    
    version = extract_version_from_bin(args.bin_file)
    
    if version is None:
        if args.json:
            print(json.dumps({args.field: None, 'error': 'Version non trouvée'}))
        else:
            print("Version non trouvée dans le binaire", file=sys.stderr)
        sys.exit(1)
    
    if args.json:
        result = {args.field: version}
        print(json.dumps(result))
    else:
        print(version)
    
    sys.exit(0)

if __name__ == '__main__':
    main()

