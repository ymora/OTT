<?php
/**
 * Firmware Helpers
 * Helper functions for firmware operations
 */

function extractVersionFromBin($bin_path) {
    // Tente d'extraire la version depuis le fichier .bin
    // Cherche la section .version avec OTT_FW_VERSION=
    $data = file_get_contents($bin_path);
    if ($data === false) {
        return null;
    }
    
    // Méthode 1: Chercher OTT_FW_VERSION=<version>
    if (preg_match('/OTT_FW_VERSION=([^\x00]+)/', $data, $matches)) {
        return trim($matches[1]);
    }
    
    // Méthode 2: Chercher des patterns de version (X.Y ou X.Y-Z)
    if (preg_match('/(\d+\.\d+[-\w]*)/', $data, $matches)) {
        $version = trim($matches[1]);
        if (preg_match('/^\d+\.\d+/', $version)) {
            return $version;
        }
    }
    
    return null;
}

