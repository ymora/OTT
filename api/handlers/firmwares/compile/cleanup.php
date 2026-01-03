<?php
/**
 * Cleanup Utilities for Firmware Compilation
 * Fonctions pour nettoyer les répertoires de build
 */

/**
 * Nettoie les anciens fichiers .ino temporaires pour éviter l'accumulation
 */
function cleanupOldTempInoFiles() {
    $temp_dir = sys_get_temp_dir();
    $pattern = $temp_dir . '/ott_firmware_*.ino';
    
    // Trouver tous les fichiers .ino temporaires de plus de 1 heure
    $temp_files = glob($pattern);
    if (!$temp_files) {
        return;
    }
    
    $now = time();
    $cleaned = 0;
    
    foreach ($temp_files as $file) {
        // Extraire le timestamp du nom du fichier
        // Format: ott_firmware_{firmware_id}_{timestamp}.ino
        if (preg_match('/ott_firmware_\d+_(\d+)\.ino$/', $file, $matches)) {
            $file_time = (int)$matches[1];
            $age = $now - $file_time;
            
            // Supprimer les fichiers de plus de 1 heure
            if ($age > 3600) {
                @unlink($file);
                $cleaned++;
            }
        }
    }
    
    if ($cleaned > 0) {
        error_log("[cleanupOldTempInoFiles] Nettoyé $cleaned ancien(s) fichier(s) .ino temporaire(s)");
    }
}

/**
 * Nettoie les anciens répertoires de build pour éviter l'accumulation
 */
function cleanupOldBuildDirs() {
    $temp_dir = sys_get_temp_dir();
    $pattern = $temp_dir . '/ott_firmware_build_*';
    
    // Trouver tous les répertoires de build de plus de 1 heure
    $build_dirs = glob($pattern, GLOB_ONLYDIR);
    if (!$build_dirs) {
        return;
    }
    
    $now = time();
    $cleaned = 0;
    
    foreach ($build_dirs as $dir) {
        // Extraire le timestamp du nom du répertoire
        if (preg_match('/ott_firmware_build_\d+_(\d+)$/', $dir, $matches)) {
            $build_time = (int)$matches[1];
            $age = $now - $build_time;
            
            // Supprimer les répertoires de plus de 1 heure
            if ($age > 3600) {
                cleanupBuildDir($dir);
                $cleaned++;
            }
        }
    }
    
    if ($cleaned > 0) {
        error_log("[cleanupOldBuildDirs] Nettoyé $cleaned ancien(s) répertoire(s) de build");
    }
    
    // Nettoyer aussi les fichiers .ino temporaires
    cleanupOldTempInoFiles();
}

/**
 * Nettoie un répertoire de build de manière sécurisée
 * @param string $build_dir Chemin du répertoire à nettoyer
 */
function cleanupBuildDir($build_dir) {
    if (empty($build_dir) || !is_dir($build_dir)) {
        return;
    }
    
    // Vérifier que c'est bien un répertoire de build (sécurité)
    if (strpos($build_dir, 'ott_firmware_build_') === false) {
        error_log("[cleanupBuildDir] ⚠️ Tentative de suppression d'un répertoire non autorisé: $build_dir");
        return;
    }
    
    // Supprimer récursivement
    if (is_windows()) {
        // Windows: utiliser rmdir /s /q
        exec('rmdir /s /q ' . escapeshellarg($build_dir) . ' 2>&1', $output, $return_code);
    } else {
        // Linux/Unix: utiliser rm -rf
        exec('rm -rf ' . escapeshellarg($build_dir) . ' 2>&1', $output, $return_code);
    }
    
    if ($return_code !== 0) {
        error_log("[cleanupBuildDir] ⚠️ Erreur lors de la suppression de $build_dir: " . implode("\n", $output));
    }
}
