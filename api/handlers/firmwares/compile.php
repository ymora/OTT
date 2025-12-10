<?php
/**
 * Firmware Compilation Operations
 * Compile firmware and send SSE messages
 */

function sendSSE($type, $message = '', $data = null) {
    $payload = null;
    
    if ($type === 'log') {
        $level = $message;
        $message = $data;
        $payload = ['type' => 'log', 'level' => $level, 'message' => $message];
    } else if ($type === 'progress') {
        $payload = ['type' => 'progress', 'progress' => $message];
    } else if ($type === 'success') {
        $payload = ['type' => 'success', 'message' => $message, 'version' => $data];
    } else if ($type === 'error') {
        $payload = ['type' => 'error', 'message' => $message];
    }
    
    if ($payload !== null) {
        echo "data: " . json_encode($payload) . "\n\n";
        flush();
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
}

/**
 * Nettoie un répertoire de build de manière sécurisée
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

function handleCompileFirmware($firmware_id) {
    global $pdo;
    
    // CRITIQUE: Ignorer l'arrêt du script si la connexion client se ferme
    // Cela garantit que la compilation continue même si l'utilisateur change d'onglet
    ignore_user_abort(true);
    set_time_limit(0); // Pas de limite de temps pour la compilation
    
    // Désactiver la mise en buffer pour SSE
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Vérifier si les headers ont déjà été envoyés
    if (!headers_sent()) {
        // Configurer pour Server-Sent Events (SSE) - DOIT être avant tout output
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no'); // Désactiver la mise en buffer pour nginx
    }
    
    // Envoyer immédiatement pour établir la connexion SSE
    // IMPORTANT: Envoyer plusieurs keep-alive pour maintenir la connexion
    echo ": keep-alive\n\n";
    flush();
    
    // Envoyer un message de connexion immédiatement pour confirmer que la connexion est établie
    sendSSE('log', 'info', 'Connexion SSE établie...');
    flush();
    
    try {
        // Vérifier l'authentification APRÈS avoir envoyé les headers SSE
        // Si l'auth échoue, envoyer une erreur via SSE au lieu d'un JSON avec exit()
        $user = getCurrentUser();
        if (!$user) {
            // Logger pour diagnostic
            error_log('[handleCompileFirmware] Authentification échouée - token: ' . (isset($_GET['token']) ? 'présent (' . strlen($_GET['token']) . ' chars)' : 'absent'));
            sendSSE('error', 'Unauthorized - Veuillez vous reconnecter. Token manquant ou expiré.');
            flush();
            // Attendre un peu avant de fermer pour que le client reçoive le message
            sleep(1);
            return;
        }
        
        // Vérifier que le firmware existe et est en attente de compilation
        try {
            sendSSE('log', 'info', 'Connexion établie, vérification du firmware...');
            flush();
            error_log('[handleCompileFirmware] Vérification firmware ID: ' . $firmware_id);
            
            // Inclure ino_content et bin_content pour stockage DB
            $stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
            $stmt->execute(['id' => $firmware_id]);
            $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
            error_log('[handleCompileFirmware] Firmware récupéré: ' . ($firmware ? 'OUI (version: ' . ($firmware['version'] ?? 'N/A') . ')' : 'NON'));
            
            if (!$firmware) {
                error_log('[handleCompileFirmware] ❌ Firmware ID ' . $firmware_id . ' introuvable');
                sendSSE('log', 'error', '❌ Firmware ID ' . $firmware_id . ' introuvable dans la base de données');
                sendSSE('error', 'Firmware not found');
                flush();
                sleep(1); // Attendre que le client reçoive le message
                return;
            }
            
            // Marquer immédiatement comme "compiling" dans la base de données
            // Cela permet de savoir que la compilation est en cours même si la connexion SSE se ferme
            // Permettre de compiler même si déjà compilé (pour recompiler)
            try {
                $pdo->prepare("UPDATE firmware_versions SET status = 'compiling' WHERE id = :id")->execute(['id' => $firmware_id]);
                error_log('[handleCompileFirmware] ✅ Statut mis à jour à "compiling"');
            } catch(PDOException $dbErr) {
                error_log('[handleCompileFirmware] ⚠️ Erreur lors de la mise à jour du statut: ' . $dbErr->getMessage());
                // Continuer quand même
            }
            
            // Note: On permet maintenant de compiler même si le statut est 'compiled' ou 'error'
            // pour permettre de relancer la compilation
            $previousStatus = $firmware['status'] ?? 'unknown';
            sendSSE('log', 'info', 'Démarrage de la compilation... (statut précédent: ' . $previousStatus . ')');
            flush();
            error_log('[handleCompileFirmware] Démarrage compilation - statut précédent: ' . $previousStatus);
            
            // Trouver le fichier .ino en utilisant la fonction helper simplifiée
            sendSSE('log', 'info', '🔍 Recherche du fichier .ino...');
            flush();
            sendSSE('log', 'info', '   file_path DB: ' . ($firmware['file_path'] ?? 'N/A'));
            flush();
            sendSSE('log', 'info', '   ID firmware: ' . $firmware_id);
            flush();
            sendSSE('log', 'info', '   Stocké en DB (BYTEA): ' . (!empty($firmware['ino_content']) ? 'OUI' : 'NON'));
            flush();
            error_log('[handleCompileFirmware] Recherche fichier .ino pour firmware ID: ' . $firmware_id);
            
            try {
            $ino_path = findFirmwareInoFile($firmware_id, $firmware);
            } catch(Exception $e) {
                error_log('[handleCompileFirmware] Erreur dans findFirmwareInoFile: ' . $e->getMessage());
                sendSSE('log', 'error', '❌ Erreur lors de la recherche du fichier: ' . $e->getMessage());
                sendSSE('error', 'Erreur lors de la recherche du fichier .ino: ' . $e->getMessage());
                flush();
                
                // Marquer le firmware comme erreur
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = :error
                        WHERE id = :id
                    ")->execute([
                        'error' => 'Erreur recherche fichier: ' . $e->getMessage(),
                        'id' => $firmware_id
                    ]);
                } catch(PDOException $dbErr) {
                    error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                }
                return;
            }
            
            if ($ino_path && file_exists($ino_path)) {
                sendSSE('log', 'info', '✅ Fichier trouvé: ' . basename($ino_path));
                sendSSE('log', 'info', '   Chemin: ' . $ino_path);
                
                // Vérifier que le fichier est lisible
                if (!is_readable($ino_path)) {
                    sendSSE('log', 'error', '❌ Fichier trouvé mais non lisible: ' . $ino_path);
                    sendSSE('error', 'Fichier .ino non lisible. Vérifiez les permissions.');
                    flush();
                    
                    // Marquer le firmware comme erreur
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Fichier .ino non lisible'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    return;
                }
                
                // Vérifier que le fichier n'est pas vide
                $file_size = filesize($ino_path);
                if ($file_size === 0 || $file_size === false) {
                    sendSSE('log', 'error', '❌ Fichier trouvé mais vide (taille: ' . ($file_size === false ? 'inconnue' : '0') . ')');
                    sendSSE('error', 'Fichier .ino vide. Ré-uploader le fichier .ino.');
                    flush();
                    
                    // Marquer le firmware comme erreur
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Fichier .ino vide'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    return;
                }
                
                sendSSE('log', 'info', '   Taille: ' . $file_size . ' bytes');
                sendSSE('log', 'info', '   Lisible: OUI');
                flush();
                
                // Continuer avec la compilation
                sendSSE('log', 'info', '✅ Fichier .ino validé, démarrage de la compilation...');
                flush();
            } else {
                // Message simple et clair (version simplifiée)
                // Utiliser le même chemin que findFirmwareInoFile() pour cohérence
                $root_dir = getProjectRoot();
                $absolute_path = !empty($firmware['file_path']) ? $root_dir . '/' . $firmware['file_path'] : null;
                $parent_dir = $absolute_path ? dirname($absolute_path) : null;
                $dir_exists = $parent_dir && is_dir($parent_dir);
                
                sendSSE('log', 'error', '❌ Fichier .ino introuvable');
                sendSSE('log', 'error', '   file_path DB: ' . ($firmware['file_path'] ?? 'N/A'));
                
                if ($dir_exists) {
                    $files_in_dir = glob($parent_dir . '/*.ino');
                    sendSSE('log', 'error', '   Dossier existe mais fichier absent');
                    sendSSE('log', 'error', '   Fichiers .ino dans ce dossier: ' . count($files_in_dir));
                    if (count($files_in_dir) > 0) {
                        $file_list = array_map('basename', array_slice($files_in_dir, 0, 3));
                        sendSSE('log', 'error', '   Liste: ' . implode(', ', $file_list));
                    }
                } else {
                    sendSSE('log', 'error', '   Dossier parent n\'existe pas');
                }
                
                sendSSE('log', 'error', '   ⚠️ Le fichier n\'a jamais été uploadé correctement');
                sendSSE('log', 'error', '   Solution: Ré-uploader le fichier .ino');
                flush();
                
                // Marquer le firmware comme erreur dans la base de données
                $errorMsg = 'Fichier .ino introuvable: ' . ($firmware['file_path'] ?? 'N/A') . ' (fichier n\'existe pas sur le serveur et pas stocké en DB)';
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = :error_msg
                        WHERE id = :id
                    ")->execute([
                        'error_msg' => $errorMsg,
                        'id' => $firmware_id
                    ]);
                } catch(PDOException $dbErr) {
                    error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                }
                
                // Envoyer le message d'erreur SSE explicite
                sendSSE('error', $errorMsg);
                flush();
                
                // Attendre un peu pour que le client reçoive tous les messages avant la fermeture
                sleep(1);
                return;
            }
            
            sendSSE('log', 'info', 'Démarrage de la compilation...');
            sendSSE('progress', 10);
            flush();
            
            // Vérifier si arduino-cli est disponible
            // ⚠️ CRITIQUE: La compilation ne doit JAMAIS être simulée - soit OK, soit ÉCHEC
            $root_dir = getProjectRoot();
            $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            $arduinoCli = null;
            
            // 1. Chercher dans bin/ du projet (priorité absolue)
            $localArduinoCli = $root_dir . '/bin/arduino-cli' . ($isWindows ? '.exe' : '');
            $localArduinoCliAlt = $root_dir . '/' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'arduino-cli' . ($isWindows ? '.exe' : '');
            
            // Essayer les deux formats de chemin (normalisé et avec séparateurs)
            foreach ([$localArduinoCli, $localArduinoCliAlt] as $testPath) {
                if (file_exists($testPath) && is_readable($testPath)) {
                    $arduinoCli = $testPath;
                    sendSSE('log', 'info', '✅ arduino-cli trouvé dans bin/ du projet (versionné)');
                    break;
                }
            }
            
            // 2. Chercher dans ~/.local/bin/ (emplacement standard pour Render)
            if (empty($arduinoCli) && !$isWindows) {
                $homeDir = getenv('HOME');
                if (!empty($homeDir)) {
                    $renderArduinoCli = $homeDir . '/.local/bin/arduino-cli';
                    if (file_exists($renderArduinoCli) && is_readable($renderArduinoCli)) {
                        $arduinoCli = $renderArduinoCli;
                        sendSSE('log', 'info', '✅ arduino-cli trouvé dans ~/.local/bin/');
                    }
                }
            }
            
            // 3. Si pas trouvé localement, chercher dans le PATH système
            if (empty($arduinoCli)) {
                if ($isWindows) {
                    $pathCli = trim(shell_exec('where arduino-cli 2>nul || echo ""'));
                } else {
                    $pathCli = trim(shell_exec('which arduino-cli 2>/dev/null || echo ""'));
                }
                
                if (!empty($pathCli) && file_exists($pathCli)) {
                    $arduinoCli = $pathCli;
                    sendSSE('log', 'info', '✅ arduino-cli trouvé dans le PATH système');
                }
            }
            
            // 3. Vérification finale - ÉCHEC si arduino-cli n'est pas disponible
            if (empty($arduinoCli) || !file_exists($arduinoCli)) {
                sendSSE('error', '❌ ÉCHEC: arduino-cli non trouvé. La compilation réelle est requise.');
                sendSSE('log', 'error', 'Pour activer la compilation, installez arduino-cli:');
                sendSSE('log', 'error', '  - Windows: .\\scripts\\download_arduino_cli.ps1');
                sendSSE('log', 'error', '  - Linux/Mac: ./scripts/download_arduino_cli.sh');
                sendSSE('log', 'error', '  - Ou placez arduino-cli dans bin/ du projet');
                sendSSE('log', 'error', 'Instructions: https://arduino.github.io/arduino-cli/latest/installation/');
                
                // Marquer le firmware comme erreur dans la base de données
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET status = 'error', error_message = 'arduino-cli non trouvé - compilation échouée'
                    WHERE id = :id
                ")->execute(['id' => $firmware_id]);
                
                flush();
                return;
            } else {
                // Compilation réelle avec arduino-cli
                sendSSE('log', 'info', '✅ arduino-cli disponible - démarrage de la compilation réelle');
                sendSSE('progress', 20);
                
                // Nettoyer les anciens répertoires de build au démarrage pour éviter l'accumulation
                cleanupOldBuildDirs();
                
                // Créer un dossier temporaire pour la compilation
                $build_dir = sys_get_temp_dir() . '/ott_firmware_build_' . $firmware_id . '_' . time();
                mkdir($build_dir, 0755, true);
                
                // Variable pour garantir le nettoyage même en cas d'erreur
                $build_dir_created = true;
                
                sendSSE('log', 'info', 'Préparation de l\'environnement de compilation...');
                sendSSE('progress', 30);
                
                // Copier le fichier .ino dans le dossier de build
                $sketch_name = 'fw_ott_optimized';
                $sketch_dir = $build_dir . '/' . $sketch_name;
                mkdir($sketch_dir, 0755, true);
                copy($ino_path, $sketch_dir . '/' . $sketch_name . '.ino');
                
                // Copier les librairies externes (TinyGSM) dans le dossier de compilation
                // Arduino-cli cherche les librairies dans plusieurs emplacements :
                // 1. Le dossier 'libraries' à côté du sketch (pour cette compilation)
                // 2. Le dossier 'libraries' dans ARDUINO_DIRECTORIES_USER (persistant)
                $hardware_lib_dir = $root_dir . '/hardware/lib';
                if (is_dir($hardware_lib_dir)) {
                    $lib_dirs = glob($hardware_lib_dir . '/TinyGSM*', GLOB_ONLYDIR);
                    if (!empty($lib_dirs)) {
                        // 1. Copier dans le dossier libraries à côté du sketch (pour cette compilation)
                        $libraries_dir = $sketch_dir . '/../libraries';
                        if (!is_dir($libraries_dir)) {
                            mkdir($libraries_dir, 0755, true);
                        }
                        
                        // 2. Copier aussi dans hardware/arduino-data/libraries (persistant, réutilisable)
                        $arduinoDataLibrariesDir = $root_dir . '/hardware/arduino-data/libraries';
                        if (!is_dir($arduinoDataLibrariesDir)) {
                            mkdir($arduinoDataLibrariesDir, 0755, true);
                        }
                        
                        foreach ($lib_dirs as $lib_dir) {
                            $lib_name = basename($lib_dir);
                            
                            // Copier dans arduino-data/libraries (persistant, pour réutilisation) - une seule fois
                            $target_lib_dir_persistent = $arduinoDataLibrariesDir . '/' . $lib_name;
                            if (!is_dir($target_lib_dir_persistent)) {
                                sendSSE('log', 'info', '📚 Installation de la librairie ' . $lib_name . '...');
                                flush();
                                
                                // Copier avec keep-alive pour maintenir la connexion SSE
                                copyRecursiveWithKeepAlive($lib_dir, $target_lib_dir_persistent, function() {
                                    echo ": keep-alive\n\n";
                                    flush();
                                });
                                
                                sendSSE('log', 'info', '✅ Librairie ' . $lib_name . ' installée dans arduino-data/libraries');
                                flush();
                            }
                            
                            // Créer un lien symbolique depuis le build vers la librairie persistante (plus rapide que copier)
                            // Si les liens symboliques ne fonctionnent pas, copier seulement si nécessaire
                            $target_lib_dir_build = $libraries_dir . '/' . $lib_name;
                            if (!is_dir($target_lib_dir_build) && !is_link($target_lib_dir_build)) {
                                // Essayer d'abord un lien symbolique (plus rapide)
                                if (!is_windows()) {
                                    if (symlink($target_lib_dir_persistent, $target_lib_dir_build)) {
                                        sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' liée dans le build');
                                        flush();
                                    } else {
                                        // Fallback: copie si le lien symbolique échoue
                                        sendSSE('log', 'info', '📚 Copie de la librairie ' . $lib_name . ' dans le build...');
                                        flush();
                                        copyRecursiveWithKeepAlive($lib_dir, $target_lib_dir_build, function() {
                                            echo ": keep-alive\n\n";
                                            flush();
                                        });
                                        sendSSE('log', 'info', '✅ Librairie ' . $lib_name . ' copiée dans le build');
                                        flush();
                                    }
                                } else {
                                    // Windows: copier directement (pas de liens symboliques fiables)
                                    sendSSE('log', 'info', '📚 Copie de la librairie ' . $lib_name . ' dans le build...');
                                    flush();
                                    copyRecursiveWithKeepAlive($lib_dir, $target_lib_dir_build, function() {
                                        echo ": keep-alive\n\n";
                                        flush();
                                    });
                                    sendSSE('log', 'info', '✅ Librairie ' . $lib_name . ' copiée dans le build');
                                    flush();
                                }
                            }
                        }
                        flush();
                    }
                }
                
                // Utiliser le répertoire hardware/arduino-data du projet (généré automatiquement ou stocké sur disque persistant)
                // Si le core est déjà présent localement, on l'utilise directement (pas de téléchargement)
                $arduinoDataDir = $root_dir . '/hardware/arduino-data';
                if (!is_dir($arduinoDataDir)) {
                    // Créer le répertoire si nécessaire
                        mkdir($arduinoDataDir, 0755, true);
                }
                
                // Définir HOME et ARDUINO_DIRECTORIES_USER pour arduino-cli
                $env = [];
                if (empty(getenv('HOME'))) {
                    $env['HOME'] = sys_get_temp_dir() . '/arduino-cli-home';
                    if (!is_dir($env['HOME'])) {
                        mkdir($env['HOME'], 0755, true);
                    }
                }
                // Utiliser un répertoire persistant pour les données arduino-cli
                $env['ARDUINO_DIRECTORIES_USER'] = $arduinoDataDir;
                
                $envStr = '';
                foreach ($env as $key => $value) {
                    $envStr .= $key . '=' . escapeshellarg($value) . ' ';
                }
                
                sendSSE('log', 'info', 'Vérification du core ESP32...');
                sendSSE('progress', 40);
                flush();
                
                // Définir descriptorspec pour proc_open (nécessaire pour core list)
                $descriptorspec = [
                    0 => ["pipe", "r"],  // stdin
                    1 => ["pipe", "w"],  // stdout
                    2 => ["pipe", "w"]   // stderr
                ];
                
                // Vérifier si le core ESP32 est déjà installé via arduino-cli core list
                // C'est la méthode la plus fiable car elle vérifie la base de données d'arduino-cli
                // La commande 'core list' retourne les cores installés, pas seulement téléchargés
                // Utiliser proc_open avec stream_select pour éviter les blocages
                $coreListProcess = false;
                $coreListPipes = null;
                $coreListOutput = [];
                $coreListReturn = 0;
                
                try {
                    $coreListProcess = @proc_open($envStr . $arduinoCli . ' core list 2>&1', $descriptorspec, $coreListPipes);
                    
                    if ($coreListProcess === false) {
                        throw new Exception('proc_open a retourné false - fonction désactivée ou erreur système');
                    }
                    
                    if (!isset($coreListPipes) || !is_array($coreListPipes) || count($coreListPipes) < 3) {
                        throw new Exception('Pipes non créés par proc_open (count: ' . (isset($coreListPipes) ? count($coreListPipes) : 'null') . ')');
                    }
                    
                    $coreListStdout = $coreListPipes[1];
                    $coreListStderr = $coreListPipes[2];
                    
                    if (!is_resource($coreListStdout) || !is_resource($coreListStderr)) {
                        throw new Exception('Pipes invalides après proc_open (stdout: ' . (is_resource($coreListStdout) ? 'OK' : 'INVALIDE') . ', stderr: ' . (is_resource($coreListStderr) ? 'OK' : 'INVALIDE') . ')');
                    }
                    
                    stream_set_blocking($coreListStdout, false);
                    stream_set_blocking($coreListStderr, false);
                    
                    $coreListStartTime = time();
                    $coreListLastKeepAlive = $coreListStartTime;
                    
                    while (true) {
                        $currentTime = time();
                        $read = [$coreListStdout, $coreListStderr];
                        $write = null;
                        $except = null;
                        $num_changed = stream_select($read, $write, $except, 1);
                        
                        if ($num_changed === false) {
                            $lastError = error_get_last();
                            $errorMsg = 'stream_select a échoué: ' . ($lastError ? $lastError['message'] : 'erreur inconnue');
                            error_log('[handleCompileFirmware] ' . $errorMsg);
                            sendSSE('log', 'error', '❌ Erreur stream_select pendant core list');
                            sendSSE('log', 'error', '   Détails: ' . $errorMsg);
                            $coreListReturn = 1;
                            break;
                        }
                        
                        if ($num_changed > 0) {
                            foreach ($read as $stream) {
                                $output = stream_get_contents($stream, 8192);
                                if (!empty($output)) {
                                    $coreListOutput[] = $output;
                                }
                            }
                        }
                        
                        // Envoyer un keep-alive toutes les 2 secondes pendant la vérification
                        if ($currentTime - $coreListLastKeepAlive >= 2) {
                            echo ": keep-alive\n\n";
                            flush();
                            $coreListLastKeepAlive = $currentTime;
                        }
                        
                        $status = proc_get_status($coreListProcess);
                        if ($status === false) {
                            $lastError = error_get_last();
                            $errorMsg = 'proc_get_status a retourné false: ' . ($lastError ? $lastError['message'] : 'processus invalide');
                            error_log('[handleCompileFirmware] ' . $errorMsg);
                            sendSSE('log', 'error', '❌ Erreur proc_get_status pendant core list');
                            sendSSE('log', 'error', '   Détails: ' . $errorMsg);
                            $coreListReturn = 1;
                            break;
                        }
                        
                        if ($status['running'] === false) {
                            $coreListReturn = $status['exitcode'] ?? 0;
                            break;
                        }
                    }
                    
                    // Fermer les pipes seulement s'ils existent et sont valides
                    if (isset($coreListPipes) && is_array($coreListPipes)) {
                        if (isset($coreListPipes[0]) && is_resource($coreListPipes[0])) {
                            fclose($coreListPipes[0]);
                        }
                        if (isset($coreListPipes[1]) && is_resource($coreListPipes[1])) {
                            fclose($coreListPipes[1]);
                        }
                        if (isset($coreListPipes[2]) && is_resource($coreListPipes[2])) {
                            fclose($coreListPipes[2]);
                        }
                    }
                    if (is_resource($coreListProcess)) {
                        proc_close($coreListProcess);
                    }
                } catch(Exception $procErr) {
                    // Erreur lors de proc_open ou de la gestion des pipes
                    $errorDetails = [
                        'message' => $procErr->getMessage(),
                        'type' => get_class($procErr),
                        'arduino_cli' => $arduinoCli,
                        'env_str' => substr($envStr, 0, 100)
                    ];
                    error_log('[handleCompileFirmware] Erreur proc_open core list: ' . json_encode($errorDetails, JSON_UNESCAPED_UNICODE));
                    sendSSE('log', 'error', '❌ Erreur lors de l\'exécution de arduino-cli core list');
                    sendSSE('log', 'error', '   Type: ' . get_class($procErr));
                    sendSSE('log', 'error', '   Message: ' . $procErr->getMessage());
                    $coreListProcess = false; // Forcer le fallback
                }
                
                // Fallback sur popen() avec stream_select() si proc_open échoue (non-bloquant)
                if (!is_resource($coreListProcess) || empty($coreListOutput)) {
                    sendSSE('log', 'warning', '⚠️ proc_open indisponible ou échoué pour core list, fallback sur popen()');
                    flush();
                    
                    // Utiliser popen() au lieu de exec() pour permettre des keep-alive pendant l'exécution
                    $popenHandle = @popen($envStr . $arduinoCli . ' core list 2>&1', 'r');
                    
                    if ($popenHandle === false || !is_resource($popenHandle)) {
                        error_log('[handleCompileFirmware] popen() a échoué pour core list');
                        sendSSE('log', 'error', '❌ popen() a échoué pour core list');
                        $coreListReturn = 1;
                    } else {
                        // Lire la sortie de manière non-bloquante avec keep-alive
                        stream_set_blocking($popenHandle, false);
                        $popenStartTime = time();
                        $popenLastKeepAlive = $popenStartTime;
                        $popenOutput = '';
                        $popenLastReadTime = $popenStartTime;
                        
                        while (true) {
                            $currentTime = time();
                            
                            // Lire les données disponibles
                            $read = [$popenHandle];
                            $write = null;
                            $except = null;
                            $num_changed = stream_select($read, $write, $except, 1);
                            
                            if ($num_changed > 0 && in_array($popenHandle, $read)) {
                                $chunk = fread($popenHandle, 8192);
                                if ($chunk !== false && $chunk !== '') {
                                    $popenOutput .= $chunk;
                                    $coreListOutput[] = $chunk;
                                    $popenLastReadTime = $currentTime;
                                }
                            }
                            
                            // Vérifier si le processus est terminé (feof() après un délai)
                            if (feof($popenHandle)) {
                                break;
                            }
                            
                            // Envoyer un keep-alive toutes les 2 secondes
                            if ($currentTime - $popenLastKeepAlive >= 2) {
                                echo ": keep-alive\n\n";
                                flush();
                                $popenLastKeepAlive = $currentTime;
                            }
                            
                            // Timeout de sécurité : 30 secondes maximum
                            if ($currentTime - $popenStartTime > 30) {
                                error_log('[handleCompileFirmware] Timeout popen() core list (>30s)');
                                sendSSE('log', 'warning', '⚠️ Timeout lors de la vérification du core (30s)');
                                break;
                            }
                            
                            // Si pas de données depuis 5 secondes, considérer comme terminé
                            if ($currentTime - $popenLastReadTime > 5 && empty($popenOutput)) {
                                break;
                            }
                            
                            usleep(100000); // 100ms
                        }
                        
                        $coreListReturn = pclose($popenHandle);
                        
                        if (empty($coreListOutput) && !empty($popenOutput)) {
                            $coreListOutput = [trim($popenOutput)];
                        }
                        
                        if (empty($coreListOutput)) {
                            sendSSE('log', 'warning', '⚠️ popen() core list n\'a retourné aucune sortie');
                        } else {
                            sendSSE('log', 'info', '✅ Sortie reçue de popen() core list (' . count($coreListOutput) . ' lignes)');
                        }
                        
                        // Envoyer un keep-alive final
                        echo ": keep-alive\n\n";
                        flush();
                    }
                }
                
                if ($coreListReturn !== 0) {
                    $coreListError = substr(implode("\n", $coreListOutput), 0, 4000);
                    sendSSE('log', 'error', '❌ arduino-cli core list a échoué (code ' . $coreListReturn . ')');
                    sendSSE('log', 'error', '   Sortie: ' . $coreListError);
                    sendSSE('error', 'Échec de la vérification du core ESP32 (arduino-cli core list). Consultez les logs.');
                    flush();
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'core list failed'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB update status core list: ' . $dbErr->getMessage());
                    }
                    return;
                }
                
                $coreListStr = implode("\n", $coreListOutput);
                
                // Log de diagnostic pour comprendre pourquoi le core n'est pas détecté
                if (getenv('DEBUG_ERRORS') === 'true') {
                    sendSSE('log', 'info', '🔍 Diagnostic core ESP32:');
                    sendSSE('log', 'info', '   ARDUINO_DIRECTORIES_USER: ' . $arduinoDataDir);
                    sendSSE('log', 'info', '   Dossier existe: ' . (is_dir($arduinoDataDir) ? 'OUI' : 'NON'));
                    sendSSE('log', 'info', '   Sortie core list (premiers 500 chars): ' . substr($coreListStr, 0, 500));
                    flush();
                }
                
                // Vérifier si le core ESP32 apparaît dans la liste (format: esp32:esp32 ou esp-rv32)
                $esp32Installed = strpos($coreListStr, 'esp32:esp32') !== false || strpos($coreListStr, 'esp-rv32') !== false;
                
                if ($esp32Installed) {
                    sendSSE('log', 'info', '✅ Core ESP32 déjà installé - prêt pour compilation');
                    sendSSE('log', 'info', '   Source: hardware/arduino-data/ (cache local ou disque persistant)');
                    sendSSE('progress', 50);
                } else {
                    // Vérifier si le core existe dans hardware/arduino-data/ mais n'est pas encore indexé
                    $corePath = $arduinoDataDir . '/packages/esp32/hardware/esp32';
                    if (is_dir($corePath)) {
                        sendSSE('log', 'info', '✅ Core ESP32 trouvé dans hardware/arduino-data/ (cache local)');
                        sendSSE('log', 'info', '   Le core est déjà dans le projet, pas besoin de téléchargement');
                        sendSSE('log', 'info', '   ⚠️ Note: Le core existe mais n\'est pas indexé par arduino-cli');
                        sendSSE('log', 'info', '   Le core sera utilisé directement sans re-téléchargement');
                        sendSSE('progress', 50);
                    } else {
                        sendSSE('log', 'info', 'Core ESP32 non installé, installation nécessaire...');
                        sendSSE('log', 'info', '⏳ Cette étape peut prendre plusieurs minutes (téléchargement ~568MB, une seule fois)...');
                        sendSSE('log', 'info', '   ✅ Le core sera stocké dans hardware/arduino-data/');
                        sendSSE('log', 'info', '   💡 Pour éviter de retélécharger à chaque déploiement, configurez un Persistent Disk sur Render.com');
                        sendSSE('log', 'info', '   📖 Voir: docs/RENDER_PERSISTENT_DISK.md');
                        sendSSE('progress', 42);
                        
                        // Vérifier si l'index est récent (moins de 24h) avant de le mettre à jour
                        $indexFile = $arduinoDataDir . '/package_index.json';
                        $shouldUpdateIndex = true;
                        if (file_exists($indexFile)) {
                            $indexAge = time() - filemtime($indexFile);
                            // Mettre à jour l'index seulement s'il a plus de 24h
                            if ($indexAge < 86400) {
                                $shouldUpdateIndex = false;
                                sendSSE('log', 'info', '✅ Index des cores récent (moins de 24h), pas besoin de mise à jour');
                            }
                        }
                        
                        // Mettre à jour l'index seulement si nécessaire
                        if ($shouldUpdateIndex) {
                            sendSSE('log', 'info', 'Mise à jour de l\'index des cores Arduino...');
                            exec($envStr . $arduinoCli . ' core update-index 2>&1', $updateIndexOutput, $updateIndexReturn);
                            if ($updateIndexReturn !== 0) {
                                sendSSE('log', 'warning', 'Avertissement lors de la mise à jour de l\'index');
                            }
                        }
                        
                        sendSSE('log', 'info', 'Installation du core ESP32...');
                        sendSSE('progress', 45);
                        
                        // Exécuter avec output en temps réel pour voir la progression
                        $descriptorspec = [
                            0 => ["pipe", "r"],  // stdin
                            1 => ["pipe", "w"],  // stdout
                            2 => ["pipe", "w"]   // stderr
                        ];
                        
                        $process = proc_open($envStr . $arduinoCli . ' core install esp32:esp32 2>&1', $descriptorspec, $pipes);
                        
                        if (is_resource($process)) {
                            // Lire la sortie ligne par ligne pour afficher la progression
                            $installOutput = [];
                            $stdout = $pipes[1];
                            $stderr = $pipes[2];
                            
                            // Configurer les streams en non-bloquant
                            stream_set_blocking($stdout, false);
                            stream_set_blocking($stderr, false);
                            
                            $startTime = time();
                            $lastOutputTime = $startTime;
                            $lastHeartbeatTime = $startTime;
                            $lastKeepAliveTime = $startTime;
                            $lastLine = ''; // Dernière ligne de sortie pour détecter la phase (téléchargement vs installation)
                            
                            while (true) {
                                $currentTime = time();
                                
                                // Utiliser stream_select pour vérifier si des données sont disponibles (non-bloquant)
                                $read = [$stdout, $stderr];
                                $write = null;
                                $except = null;
                                $timeout = 1; // Attendre 1 seconde maximum
                                
                                $num_changed_streams = stream_select($read, $write, $except, $timeout);
                                
                                if ($num_changed_streams === false) {
                                    // Erreur stream_select
                                    error_log('[handleCompileFirmware] Erreur stream_select lors de l\'installation du core');
                                    break;
                                } elseif ($num_changed_streams > 0) {
                                    // Des données sont disponibles, les lire
                                    foreach ($read as $stream) {
                                        $output = stream_get_contents($stream, 8192); // Lire par chunks de 8KB
                                        if (!empty($output)) {
                                            $lines = explode("\n", $output);
                                            foreach ($lines as $line) {
                                    $line = trim($line);
                                    if (!empty($line)) {
                                        $installOutput[] = $line;
                                        sendSSE('log', 'info', $line);
                                        flush();
                                        $lastOutputTime = $currentTime;
                                        $lastLine = $line; // Garder la dernière ligne pour détecter la phase
                                    }
                                }
                                        }
                                    }
                                }
                                
                                // Vérifier si le processus est terminé
                                $status = proc_get_status($process);
                                if (!$status || $status['running'] === false) {
                                    break;
                                }
                                
                                // Timeout de sécurité : si pas de sortie depuis 10 minutes, considérer comme bloqué
                                // (L'installation du core ESP32 peut prendre du temps)
                                if ($currentTime - $lastOutputTime > 600) {
                                    sendSSE('log', 'warning', '⚠️ Pas de sortie depuis 10 minutes, le processus semble bloqué');
                                    sendSSE('error', 'Timeout: L\'installation du core ESP32 a pris trop de temps');
                                    // Marquer le firmware comme erreur dans la base de données
                                    try {
                                        $pdo->prepare("
                                            UPDATE firmware_versions 
                                            SET status = 'error', error_message = 'Timeout lors de l\'installation du core ESP32'
                                            WHERE id = :id
                                        ")->execute(['id' => $firmware_id]);
                                    } catch(PDOException $dbErr) {
                                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                                    }
                                    proc_terminate($process);
                                    break;
                                }
                                
                                // Envoyer un keep-alive SSE toutes les 2 secondes pendant l'installation pour maintenir la connexion active
                                // (Les commentaires SSE `: keep-alive` maintiennent la connexion ouverte)
                                // Réduire l'intervalle pendant l'installation pour éviter les timeouts
                                if ($currentTime - $lastKeepAliveTime >= 2) {
                                    $lastKeepAliveTime = $currentTime;
                                    echo ": keep-alive\n\n";
                                    flush();
                                }
                                
                                // Détecter si on est en phase de téléchargement (ligne contient un pourcentage) ou installation
                                // Pattern de téléchargement: "esp32:xxx@yyy X MiB / Y MiB Z%" (avec ou sans temps à la fin comme "00m02s")
                                // Les lignes de téléchargement contiennent toujours un pourcentage et "MiB /"
                                $isDownloading = preg_match('/\d+\.\d+ MiB \/ \d+\.\d+ MiB \d+\.\d+%/', $lastLine) || 
                                                 preg_match('/\d+ B \/ \d+\.\d+ MiB \d+\.\d+%/', $lastLine) ||
                                                 preg_match('/downloaded$/', $lastLine) ||
                                                 preg_match('/Downloading packages\.\.\./', $lastLine);
                                
                                // Si on voit "Installing" ou "Skipping", on est en phase d'installation (pas de téléchargement)
                                // Ces lignes n'ont PAS de pourcentage de téléchargement
                                $isInstalling = preg_match('/^Installing /', $lastLine) || 
                                                preg_match('/Skipping tool configuration/', $lastLine) ||
                                                (preg_match('/installed$/', $lastLine) && !$isDownloading);
                                
                                // Si on est en installation, ne pas considérer comme téléchargement
                                if ($isInstalling) {
                                    $isDownloading = false;
                                }
                                
                                // Envoyer un heartbeat avec message toutes les 5 secondes UNIQUEMENT si on n'est PAS en phase de téléchargement
                                // (Pendant le téléchargement, on voit déjà la progression, pas besoin du heartbeat)
                                if (!$isDownloading && $currentTime - $lastHeartbeatTime >= 5) {
                                    // Mettre à jour immédiatement pour éviter les multiples envois dans la même seconde
                                    $lastHeartbeatTime = $currentTime;
                                    $elapsedSeconds = $currentTime - $startTime;
                                    $elapsedMinutes = floor($elapsedSeconds / 60);
                                    $elapsedSecondsRemainder = $elapsedSeconds % 60;
                                    
                                    // Message avec timestamp pour montrer que le système est toujours actif
                                    $timeStr = $elapsedMinutes > 0 
                                        ? sprintf('%dm %ds', $elapsedMinutes, $elapsedSecondsRemainder)
                                        : sprintf('%ds', $elapsedSecondsRemainder);
                                    
                                    sendSSE('log', 'info', '⏳ Installation en cours... (temps écoulé: ' . $timeStr . ' - le système est actif)');
                                    flush();
                                }
                                
                                // Attendre un peu avant de relire
                                usleep(100000); // 100ms
                            }
                            
                            // Fermer les pipes
                            fclose($pipes[0]);
                            fclose($pipes[1]);
                            fclose($pipes[2]);
                            
                            $return = proc_close($process);
                        } else {
                            // Fallback sur exec si proc_open échoue
                            exec($envStr . $arduinoCli . ' core install esp32:esp32 2>&1', $installOutput, $return);
                            sendSSE('log', 'info', implode("\n", $installOutput));
                        }
                        
                        if ($return !== 0) {
                            // Marquer le firmware comme erreur dans la base de données
                            try {
                                $pdo->prepare("
                                    UPDATE firmware_versions 
                                    SET status = 'error', error_message = 'Erreur lors de l\'installation du core ESP32'
                                    WHERE id = :id
                                ")->execute(['id' => $firmware_id]);
                            } catch(PDOException $dbErr) {
                                error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                            }
                            sendSSE('error', 'Erreur lors de l\'installation du core ESP32');
                            flush();
                            return;
                        }
                        
                        sendSSE('log', 'info', '✅ Core ESP32 installé avec succès');
                    }
                }
                
                sendSSE('log', 'info', 'Compilation du firmware...');
                sendSSE('progress', 60);
                flush();
                
                $fqbn = 'esp32:esp32:esp32';
                $compile_cmd = $envStr . $arduinoCli . ' compile --fqbn ' . $fqbn . ' --build-path ' . escapeshellarg($build_dir) . ' ' . escapeshellarg($sketch_dir) . ' 2>&1';
                
                // Exécuter avec output en temps réel pour voir la progression et maintenir la connexion SSE
                $descriptorspec = [
                    0 => ["pipe", "r"],  // stdin
                    1 => ["pipe", "w"],  // stdout
                    2 => ["pipe", "w"]   // stderr
                ];
                
                $compile_process = proc_open($compile_cmd, $descriptorspec, $compile_pipes);
                
                if (is_resource($compile_process)) {
                    $compile_stdout = $compile_pipes[1];
                    $compile_stderr = $compile_pipes[2];
                    
                    // Configurer les streams en non-bloquant
                    stream_set_blocking($compile_stdout, false);
                    stream_set_blocking($compile_stderr, false);
                    
                    $compile_start_time = time();
                    $compile_last_heartbeat = $compile_start_time;
                    $compile_last_keepalive = $compile_start_time;
                    $compile_last_output_time = $compile_start_time;
                    $compile_output_lines = [];
                    
                    while (true) {
                        $current_time = time();
                        
                        // Utiliser stream_select pour vérifier si des données sont disponibles (non-bloquant)
                        $read = [$compile_stdout, $compile_stderr];
                        $write = null;
                        $except = null;
                        $timeout = 1; // Attendre 1 seconde maximum
                        
                        $num_changed_streams = stream_select($read, $write, $except, $timeout);
                        
                        if ($num_changed_streams === false) {
                            // Erreur stream_select
                            error_log('[handleCompileFirmware] Erreur stream_select lors de la compilation');
                            break;
                        } elseif ($num_changed_streams > 0) {
                            // Des données sont disponibles, les lire
                            foreach ($read as $stream) {
                                $output = stream_get_contents($stream, 8192); // Lire par chunks de 8KB
                                if (!empty($output)) {
                                    $lines = explode("\n", $output);
                                    foreach ($lines as $line) {
                            $line = trim($line);
                            if (!empty($line)) {
                                $compile_output_lines[] = $line;
                                sendSSE('log', 'info', $line);
                                flush();
                                            $compile_last_output_time = $current_time;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Vérifier si le processus est terminé
                        $compile_status = proc_get_status($compile_process);
                        if (!$compile_status || $compile_status['running'] === false) {
                            break;
                        }
                        
                        // Timeout de sécurité : si pas de sortie depuis 10 minutes
                        if ($current_time - $compile_last_output_time > 600) {
                            sendSSE('log', 'warning', '⚠️ Pas de sortie depuis 10 minutes, la compilation semble bloquée');
                    sendSSE('error', 'Timeout: La compilation a pris trop de temps');
                    proc_terminate($compile_process);
                    // Nettoyer le répertoire de build en cas de timeout
                    if (isset($build_dir) && $build_dir_created) {
                        cleanupBuildDir($build_dir);
                    }
                    break;
                }
                        
                        // Envoyer un keep-alive SSE toutes les 3 secondes
                        if ($current_time - $compile_last_keepalive >= 3) {
                            $compile_last_keepalive = $current_time;
                            echo ": keep-alive\n\n";
                            flush();
                        }
                        
                        // Envoyer un heartbeat toutes les 10 secondes pour maintenir la connexion SSE
                        if ($current_time - $compile_last_heartbeat >= 10) {
                            $compile_last_heartbeat = $current_time;
                            $elapsed = $current_time - $compile_start_time;
                            $minutes = floor($elapsed / 60);
                            $seconds = $elapsed % 60;
                            $timeStr = $minutes > 0 ? sprintf('%dm %ds', $minutes, $seconds) : sprintf('%ds', $seconds);
                            sendSSE('log', 'info', '⏳ Compilation en cours... (temps écoulé: ' . $timeStr . ')');
                            flush();
                        }
                    }
                    
                    // Fermer les pipes
                    fclose($compile_pipes[0]);
                    fclose($compile_pipes[1]);
                    fclose($compile_pipes[2]);
                    
                    $compile_return = proc_close($compile_process);
                    $compile_output = $compile_output_lines;
                } else {
                    // Fallback sur exec si proc_open échoue
                    exec($compile_cmd, $compile_output, $compile_return);
                    
                    foreach ($compile_output as $line) {
                        sendSSE('log', 'info', $line);
                    }
                    flush();
                }
                
                if ($compile_return !== 0) {
                    // Marquer le firmware comme erreur dans la base de données même si la connexion SSE est fermée
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Erreur lors de la compilation'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
                    }
                    sendSSE('error', 'Erreur lors de la compilation. Vérifiez les logs ci-dessus.');
                    flush();
                    // Nettoyer
                    exec('rm -rf ' . escapeshellarg($build_dir));
                    return;
                }
                
                sendSSE('progress', 80);
                sendSSE('log', 'info', 'Recherche du fichier .bin généré...');
                
                // Trouver le fichier .bin
                $bin_files = glob($build_dir . '/*.bin');
                if (empty($bin_files)) {
                    $bin_files = glob($build_dir . '/**/*.bin');
                }
                
                if (empty($bin_files)) {
                    // Marquer le firmware comme erreur dans la base de données
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Fichier .bin introuvable après compilation'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    sendSSE('error', 'Fichier .bin introuvable après compilation');
                    flush();
                    if (isset($build_dir) && $build_dir_created) {
                        cleanupBuildDir($build_dir);
                    }
                    return;
                }
                
                $compiled_bin = $bin_files[0];
                
                sendSSE('progress', 95);
                sendSSE('log', 'info', 'Calcul des checksums et lecture du fichier .bin...');
                
                // Lire directement depuis le répertoire de build (pas de copie sur disque pour économiser l'espace)
                $bin_content_db = file_get_contents($compiled_bin);
                if ($bin_content_db === false) {
                    throw new Exception('Impossible de lire le fichier .bin compilé');
                }
                
                // Calculer les checksums depuis le contenu en mémoire (plus efficace)
                $md5 = hash('md5', $bin_content_db);
                $checksum = hash('sha256', $bin_content_db);
                $file_size = strlen($bin_content_db);
                
                // Mettre à jour la base de données avec le contenu en BYTEA
                // IMPORTANT: Encoder les données BYTEA pour PostgreSQL
                $bin_content_encoded = encodeByteaForPostgres($bin_content_db);
                
                // Libérer la mémoire immédiatement après encodage
                unset($bin_content_db);
                
                $version_dir = getVersionDir($firmware['version']);
                $bin_filename = 'fw_ott_v' . $firmware['version'] . '.bin';
                
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET file_path = :file_path, 
                        file_size = :file_size, 
                        checksum = :checksum,
                        bin_content = :bin_content,
                        status = 'compiled'
                    WHERE id = :id
                ")->execute([
                    'file_path' => 'hardware/firmware/' . $version_dir . '/' . $bin_filename,
                    'file_size' => $file_size,
                    'checksum' => $checksum,
                    'bin_content' => $bin_content_encoded,  // BYTEA encodé pour PostgreSQL
                    'id' => $firmware_id
                ]);
                
                // Libérer la mémoire de l'encodage immédiatement
                unset($bin_content_encoded);
                
                sendSSE('log', 'info', '✅ Fichier .bin stocké en base de données (pas de copie sur disque)');
                
                // Nettoyer le répertoire de build immédiatement après stockage en DB
                cleanupBuildDir($build_dir);
                
                sendSSE('progress', 100);
                sendSSE('log', 'info', '✅ Compilation terminée avec succès !');
                sendSSE('success', 'Firmware v' . $firmware['version'] . ' compilé avec succès', $firmware['version']);
                
                // Fermer la connexion après un court délai pour permettre au client de recevoir les messages
                sleep(1);
            }
        } catch(PDOException $e) {
            // Erreur lors de la vérification du firmware
            $errorMessage = 'Erreur base de données: ' . $e->getMessage();
            sendSSE('log', 'error', '❌ ' . $errorMessage);
            sendSSE('error', $errorMessage);
            error_log('[handleCompileFirmware] Erreur DB: ' . $e->getMessage());
            flush();
            
            // Marquer le firmware comme erreur si on a l'ID
            if (isset($firmware_id)) {
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = :error
                        WHERE id = :id
                    ")->execute([
                        'error' => $errorMessage,
                        'id' => $firmware_id
                    ]);
                } catch(PDOException $dbErr) {
                    error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour: ' . $dbErr->getMessage());
                }
            }
            
            sleep(1);
            return;
        }
        
    } catch(Exception $e) {
        // Logger l'erreur complète avec stack trace
        error_log('[handleCompileFirmware] Exception: ' . $e->getMessage());
        error_log('[handleCompileFirmware] Stack trace: ' . $e->getTraceAsString());
        
        // Envoyer un message d'erreur SSE explicite
        $errorMessage = 'Erreur lors de la compilation: ' . $e->getMessage();
        sendSSE('log', 'error', '❌ ' . $errorMessage);
        sendSSE('error', $errorMessage);
        flush();
        
        // Marquer le firmware comme erreur dans la base de données même si la connexion SSE est fermée
        if (isset($firmware_id)) {
            try {
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET status = 'error', error_message = :error
                    WHERE id = :id
                ")->execute([
                    'error' => $errorMessage,
                    'id' => $firmware_id
                ]);
            } catch(PDOException $dbErr) {
                error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
            }
        }
        
        // Attendre un peu pour que le client reçoive le message avant la fermeture
        sleep(1);
    }
    
    // S'assurer que la sortie est vidée
    flush();
}
