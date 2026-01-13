<?php

/**
 * Handler pour la documentation et le suivi du temps
 * Génère et met à jour les fichiers de suivi
 */

require_once __DIR__ . '/../bootstrap.php';

/**
 * Régénère le fichier de suivi du temps
 */
function regenerateTimeTracking() {
    try {
        // Chemin du script PowerShell
        $scriptPath = __DIR__ . '/../../scripts/Generate-GitStats.ps1';
        
        if (!file_exists($scriptPath)) {
            return [
                'success' => false,
                'error' => 'Script de génération non trouvé',
                'code' => 404
            ];
        }
        
        // Exécuter le script PowerShell
        $command = "powershell.exe -ExecutionPolicy Bypass -File \"{$scriptPath}\"";
        $output = [];
        $returnCode = 0;
        
        exec($command, $output, $returnCode);
        
        if ($returnCode === 0) {
            // Vérifier si les fichiers ont été générés
            $trackingFile = __DIR__ . '/../../public/SUIVI_TEMPS_FACTURATION.md';
            $contributorsFile = __DIR__ . '/../../public/SUIVI_CONTRIBUTEURS.md';
            
            $filesGenerated = file_exists($trackingFile) && file_exists($contributorsFile);
            
            return [
                'success' => true,
                'message' => 'Fichiers de suivi régénérés avec succès',
                'files_generated' => $filesGenerated,
                'output' => implode("\n", array_slice($output, -10)) // Dernières 10 lignes
            ];
        } else {
            return [
                'success' => false,
                'error' => 'Erreur lors de l\'exécution du script',
                'code' => 500,
                'output' => implode("\n", $output)
            ];
        }
        
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => 'Exception: ' . $e->getMessage(),
            'code' => 500
        ];
    }
}

/**
 * Récupère les statistiques de suivi du temps
 */
function getTimeTrackingStats() {
    try {
        $trackingFile = __DIR__ . '/../../public/SUIVI_TEMPS_FACTURATION.md';
        $contributorsFile = __DIR__ . '/../../public/SUIVI_CONTRIBUTEURS.md';
        
        if (!file_exists($trackingFile) || !file_exists($contributorsFile)) {
            return [
                'success' => false,
                'error' => 'Fichiers de suivi non trouvés',
                'code' => 404
            ];
        }
        
        // Lire les fichiers
        $trackingContent = file_get_contents($trackingFile);
        $contributorsContent = file_get_contents($contributorsFile);
        
        return [
            'success' => true,
            'data' => [
                'tracking_file' => $trackingContent,
                'contributors_file' => $contributorsContent,
                'last_updated' => filemtime($trackingFile)
            ]
        ];
        
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => 'Exception: ' . $e->getMessage(),
            'code' => 500
        ];
    }
}
