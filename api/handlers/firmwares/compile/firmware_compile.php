<?php
/**
 * Firmware Compilation Module
 * Gère la compilation du firmware avec arduino-cli
 */

require_once __DIR__ . '/sse.php';
require_once __DIR__ . '/cleanup.php';

/**
 * Compile le firmware
 * @param string $arduinoCli Chemin vers arduino-cli
 * @param string $envStr Chaîne d'environnement pour les commandes shell
 * @param string $build_dir Répertoire de build
 * @param string $sketch_dir Répertoire du sketch
 * @param int $firmware_id ID du firmware
 * @param array $firmware Données du firmware
 * @param callable $sendProgress Fonction de callback pour mettre à jour la progression
 * @param int $compilationStartTime Timestamp de début de compilation
 * @param int $maxCompilationTime Timeout maximum en secondes
 * @param array $env Variables d'environnement (pour erreurs d'architecture)
 * @param string $arduinoDataDir Répertoire de données Arduino
 * @return bool true si succès, false si échec
 */
function compileFirmware($arduinoCli, $envStr, $build_dir, $sketch_dir, $firmware_id, $firmware, $sendProgress, $compilationStartTime, $maxCompilationTime, $env, $arduinoDataDir, $build_dir_created = false, $is_temp_ino = false, $ino_path = null) {
    global $pdo;
    
    $fqbn = 'esp32:esp32:esp32';
    // Utiliser --verbose pour obtenir tous les logs de compilation
    $compile_cmd = $envStr . $arduinoCli . ' compile --verbose --fqbn ' . $fqbn . ' --build-path ' . escapeshellarg($build_dir) . ' ' . escapeshellarg($sketch_dir) . ' 2>&1';
    
    sendSSE('log', 'info', 'Compilation du firmware...');
    sendSSE('log', 'info', 'Commande: ' . $compile_cmd);
    $sendProgress(60);
    flush();
    
    // Logger la commande pour diagnostic
    error_log('[compileFirmware] Démarrage compilation avec commande: ' . $compile_cmd);
    error_log('[compileFirmware] Build dir: ' . $build_dir);
    error_log('[compileFirmware] Sketch dir: ' . $sketch_dir);
    
    
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
        $compile_last_progress_update = $compile_start_time;
        $compile_output_lines = [];
        $compile_phase = 'initialization'; // 'initialization', 'compiling', 'linking', 'archiving'
        $compile_base_progress = 60; // Progression de base au début de la compilation
        
        while (true) {
            $current_time = time();
            $elapsed_seconds = $current_time - $compile_start_time;
            
            // Vérifier le timeout global de sécurité (30 minutes)
            if ($current_time - $compilationStartTime > $maxCompilationTime) {
                sendSSE('log', 'error', '❌ Timeout global: La compilation a dépassé 30 minutes');
                sendSSE('error', 'Timeout: La compilation a pris trop de temps (max 30 minutes)');
                proc_terminate($compile_process, 9); // SIGKILL
                error_log('[compileFirmware] Timeout global déclenché (>30 minutes)');
                break;
            }
            
            // Utiliser stream_select pour vérifier si des données sont disponibles (non-bloquant)
            $read = [$compile_stdout, $compile_stderr];
            $write = null;
            $except = null;
            $timeout = 1; // Attendre 1 seconde maximum
            
            $num_changed_streams = stream_select($read, $write, $except, $timeout);
            
            if ($num_changed_streams === false) {
                // Erreur stream_select
                error_log('[compileFirmware] Erreur stream_select lors de la compilation');
                break;
            } elseif ($num_changed_streams > 0) {
                // Des données sont disponibles, les lire
                foreach ($read as $stream) {
                    $isStderr = ($stream === $compile_stderr);
                    
                    // Utiliser stream_get_contents pour lire TOUT ce qui est disponible
                    $chunk = stream_get_contents($stream, 65536); // 64KB max par lecture
                    
                    if ($chunk !== false && $chunk !== '') {
                        // Logger immédiatement pour diagnostic
                        error_log('[compileFirmware] Compile output reçu (' . strlen($chunk) . ' bytes) depuis ' . ($isStderr ? 'stderr' : 'stdout'));
                        
                        // Traiter ligne par ligne
                        $lines = explode("\n", $chunk);
                        foreach ($lines as $lineIndex => $line) {
                            $lineTrimmed = rtrim($line, "\r\n");
                            
                            // Envoyer toutes les lignes non vides
                            if (!empty($lineTrimmed) || ($lineIndex === 0 && !empty($chunk))) {
                                if (!empty($lineTrimmed)) {
                                    $compile_output_lines[] = $lineTrimmed;
                                    
                                    // Détecter la phase de compilation pour ajuster la progression
                                    $newPhase = $compile_phase;
                                    if (stripos($lineTrimmed, 'compiling') !== false && (stripos($lineTrimmed, '.cpp') !== false || stripos($lineTrimmed, '.c') !== false)) {
                                        $newPhase = 'compiling';
                                        // Phase compilation: 60-70%
                                        $compile_base_progress = 60;
                                    } elseif (stripos($lineTrimmed, 'linking') !== false || stripos($lineTrimmed, 'Linking') !== false) {
                                        $newPhase = 'linking';
                                        // Phase linking: 70-75%
                                        $compile_base_progress = 70;
                                    } elseif (stripos($lineTrimmed, 'archiving') !== false || stripos($lineTrimmed, 'Archiving') !== false) {
                                        $newPhase = 'archiving';
                                        // Phase archiving: 75-78%
                                        $compile_base_progress = 75;
                                    } elseif (stripos($lineTrimmed, 'Building') !== false && stripos($lineTrimmed, 'firmware') !== false) {
                                        $newPhase = 'building';
                                        // Phase building finale: 78-80%
                                        $compile_base_progress = 78;
                                    }
                                    
                                    // Si la phase a changé, mettre à jour la progression immédiatement
                                    if ($newPhase !== $compile_phase) {
                                        $compile_phase = $newPhase;
                                        $sendProgress($compile_base_progress);
                                        flush();
                                    }
                                    
                                    // Déterminer le niveau de log selon le contenu
                                    $logLevel = $isStderr ? 'error' : 'info';
                                    
                                    // ⚠️ DÉTECTION SPÉCIALE: Erreur d'architecture (exec format error)
                                    $isArchitectureError = stripos($lineTrimmed, 'exec format error') !== false ||
                                                           stripos($lineTrimmed, 'cannot execute binary file') !== false ||
                                                           stripos($lineTrimmed, 'wrong ELF class') !== false;
                                    
                                    if ($isArchitectureError) {
                                        $logLevel = 'error';
                                        // Déterminer les emplacements des outils ESP32
                                        $homeArduinoDir = (isset($env['HOME']) ? $env['HOME'] : sys_get_temp_dir() . '/arduino-cli-home') . '/.arduino15/packages/esp32';
                                        $userArduinoDir = $arduinoDataDir . '/packages/esp32';
                                        
                                        sendSSE('log', 'error', '❌ ERREUR D\'ARCHITECTURE DÉTECTÉE');
                                        sendSSE('log', 'error', '   Les outils ESP32 installés ne sont pas compatibles avec l\'architecture du serveur');
                                        sendSSE('log', 'info', '   Architecture serveur: ' . php_uname('m') . ' (' . PHP_OS . ')');
                                        sendSSE('log', 'info', '   💡 Solution: Supprimer les outils ESP32 et les réinstaller');
                                        if (is_dir($homeArduinoDir)) {
                                            sendSSE('log', 'info', '   Commande 1: rm -rf ' . $homeArduinoDir);
                                        }
                                        if (is_dir($userArduinoDir)) {
                                            sendSSE('log', 'info', '   Commande 2: rm -rf ' . $userArduinoDir);
                                        }
                                        sendSSE('log', 'info', '   Puis relancez la compilation pour réinstaller les bons outils');
                                        flush();
                                    }
                                    
                                    // Détecter les erreurs et warnings
                                    if (stripos($lineTrimmed, 'error') !== false || stripos($lineTrimmed, 'failed') !== false || 
                                        stripos($lineTrimmed, '❌') !== false || preg_match('/error:/i', $lineTrimmed) ||
                                        preg_match('/fatal/i', $lineTrimmed)) {
                                        $logLevel = 'error';
                                    } elseif (stripos($lineTrimmed, 'warning') !== false || stripos($lineTrimmed, '⚠️') !== false || 
                                              preg_match('/warning:/i', $lineTrimmed)) {
                                        $logLevel = 'warning';
                                    } elseif (stripos($lineTrimmed, 'compiling') !== false || stripos($lineTrimmed, 'linking') !== false || 
                                              stripos($lineTrimmed, 'archiving') !== false || stripos($lineTrimmed, 'sketch') !== false ||
                                              stripos($lineTrimmed, 'building') !== false) {
                                        $logLevel = 'info';
                                    }
                                    
                                    // Envoyer immédiatement via SSE
                                    sendSSE('log', $logLevel, $lineTrimmed);
                                    flush();
                                    
                                    // Logger aussi dans error_log pour diagnostic serveur
                                    error_log('[compileFirmware] Compile ' . ($isStderr ? 'stderr' : 'stdout') . ': ' . $lineTrimmed);
                                    
                                    $compile_last_output_time = $current_time;
                                }
                            }
                        }
                    }
                }
            }
            
            // PROGRESSION TEMPORELLE : Avancer la barre de progression même sans output
            // Cela évite que la barre reste bloquée pendant les phases longues
            if ($current_time - $compile_last_progress_update >= 2) { // Mise à jour toutes les 2 secondes
                $compile_last_progress_update = $current_time;
                
                // Calculer la progression basée sur le temps écoulé et la phase
                // Estimation: compilation complète prend généralement 2-5 minutes
                // On répartit 60-80% sur cette période
                $estimated_total_seconds = 180; // 3 minutes estimées
                $time_based_progress = min(80, $compile_base_progress + intval(($elapsed_seconds / $estimated_total_seconds) * (80 - $compile_base_progress)));
                
                // Ne pas dépasser 80% avant la fin de la compilation
                $sendProgress($time_based_progress);
                flush();
            }
            
            // Vérifier si le processus est terminé
            $compile_status = proc_get_status($compile_process);
            if (!$compile_status || $compile_status['running'] === false) {
                break;
            }
            
            // Timeout de sécurité : si pas de sortie depuis 10 minutes ET processus semble inactif
            // (La détection des bibliothèques peut prendre 5-10 minutes avec plusieurs bibliothèques)
            $noOutputElapsed = $current_time - $compile_last_output_time;
            if ($noOutputElapsed > 600) { // 10 minutes sans sortie
                // Vérifier que le processus est vraiment inactif avant de déclencher le timeout
                // Réutiliser $compile_status qui a déjà été récupéré plus haut
                if ($compile_status && $compile_status['running'] === true) {
                    // Le processus est toujours actif, continuer même sans sortie récente
                    // (peut arriver pendant la détection des bibliothèques ou compilation)
                    // Envoyer un avertissement toutes les 2 minutes pour rassurer l'utilisateur
                    if ($noOutputElapsed % 120 == 0) { // Toutes les 2 minutes
                        $minutesNoOutput = floor($noOutputElapsed / 60);
                        sendSSE('log', 'warning', "⚠️ Pas de sortie depuis {$minutesNoOutput} minutes, mais le processus est toujours actif (détection bibliothèques en cours...)");
                        flush();
                    }
                } else {
                    // Le processus n'est plus actif ET pas de sortie depuis 10 minutes = vraiment bloqué
                    sendSSE('log', 'warning', '⚠️ Pas de sortie depuis 10 minutes et processus inactif, compilation bloquée');
                    sendSSE('error', 'Timeout: La compilation semble bloquée (pas de sortie depuis 10 minutes)');
                    proc_terminate($compile_process);
                    // Nettoyer le répertoire de build en cas de timeout
                    if (isset($build_dir) && $build_dir_created) {
                        cleanupBuildDir($build_dir);
                    }
                    // Nettoyer le fichier .ino temporaire si créé depuis la DB
                    if (isset($is_temp_ino) && $is_temp_ino && isset($ino_path) && file_exists($ino_path)) {
                        @unlink($ino_path);
                    }
                    break;
                }
            }
            
            // Envoyer un keep-alive SSE toutes les 1 seconde (plus fréquent pour éviter les timeouts)
            if ($current_time - $compile_last_keepalive >= 1) {
                $compile_last_keepalive = $current_time;
                echo ": keep-alive\n\n";
                flush();
            }
            
            // Envoyer un heartbeat toutes les 10 secondes pour maintenir la connexion SSE
            // (moins fréquent car on a déjà la progression temporelle toutes les 2 secondes)
            if ($current_time - $compile_last_heartbeat >= 10) {
                $compile_last_heartbeat = $current_time;
                $elapsed = $current_time - $compile_start_time;
                $minutes = floor($elapsed / 60);
                $seconds = $elapsed % 60;
                $timeStr = $minutes > 0 ? sprintf('%dm %ds', $minutes, $seconds) : sprintf('%ds', $seconds);
                // Ne plus afficher de message de progression dans les logs, seulement le % dans la barre
                flush();
            }
        }
        
        // Fermer les pipes
        if (isset($compile_pipes[0]) && is_resource($compile_pipes[0])) {
            fclose($compile_pipes[0]);
        }
        if (isset($compile_pipes[1]) && is_resource($compile_pipes[1])) {
            fclose($compile_pipes[1]);
        }
        if (isset($compile_pipes[2]) && is_resource($compile_pipes[2])) {
            fclose($compile_pipes[2]);
        }
        
        $compile_return = proc_close($compile_process);
        $compile_output = $compile_output_lines;
        
        error_log('[compileFirmware] Compilation terminée, code de retour: ' . $compile_return);
        error_log('[compileFirmware] Nombre de lignes de sortie: ' . count($compile_output));
    } else {
        // Fallback sur exec si proc_open échoue
        exec($compile_cmd, $compile_output, $compile_return);
        
        foreach ($compile_output as $line) {
            sendSSE('log', 'info', $line);
        }
        flush();
    }
    
    if ($compile_return !== 0) {
        // ⚠️ VÉRIFIER SI C'EST UNE ERREUR D'ARCHITECTURE
        $compile_output_str = implode("\n", $compile_output_lines ?? $compile_output ?? []);
        $isArchitectureError = stripos($compile_output_str, 'exec format error') !== false ||
                              stripos($compile_output_str, 'cannot execute binary file') !== false ||
                              stripos($compile_output_str, 'wrong ELF class') !== false;
        
        $errorMessage = 'Erreur lors de la compilation. Vérifiez les logs ci-dessus.';
        $errorMessageDB = 'Erreur lors de la compilation';
        
        if ($isArchitectureError) {
            $errorMessage = 'Erreur d\'architecture: Les outils ESP32 ne sont pas compatibles avec cette architecture serveur.';
            $errorMessageDB = 'Erreur d\'architecture: Outils ESP32 incompatibles';
            
            // Déterminer les emplacements des outils ESP32
            $homeArduinoDir = (isset($env['HOME']) ? $env['HOME'] : sys_get_temp_dir() . '/arduino-cli-home') . '/.arduino15/packages/esp32';
            $userArduinoDir = $arduinoDataDir . '/packages/esp32';
            
            sendSSE('log', 'error', '❌ ERREUR D\'ARCHITECTURE DÉTECTÉE');
            sendSSE('log', 'error', '   Les outils ESP32 installés ne sont pas compatibles avec l\'architecture du serveur');
            sendSSE('log', 'info', '   Architecture serveur: ' . php_uname('m') . ' (' . PHP_OS . ')');
            sendSSE('log', 'info', '   Emplacements possibles des outils:');
            if (is_dir($homeArduinoDir)) {
                sendSSE('log', 'info', '   - ' . $homeArduinoDir . ' (HOME/.arduino15)');
            }
            if (is_dir($userArduinoDir)) {
                sendSSE('log', 'info', '   - ' . $userArduinoDir . ' (ARDUINO_DIRECTORIES_USER)');
            }
            sendSSE('log', 'warning', '💡 SOLUTION: Supprimer les outils ESP32 et les réinstaller');
            if (is_dir($homeArduinoDir)) {
                sendSSE('log', 'info', '   Commande 1: rm -rf ' . $homeArduinoDir);
            }
            if (is_dir($userArduinoDir)) {
                sendSSE('log', 'info', '   Commande 2: rm -rf ' . $userArduinoDir);
            }
            sendSSE('log', 'info', '   Puis relancez la compilation pour réinstaller les bons outils');
            sendSSE('log', 'info', '   Arduino-cli devrait automatiquement télécharger les outils pour votre architecture');
            flush();
        }
        
        // Marquer le firmware comme erreur dans la base de données même si la connexion SSE est fermée
        try {
            $pdo->prepare("
                UPDATE firmware_versions 
                SET status = 'error', error_message = :error_msg
                WHERE id = :id
            ")->execute([
                'id' => $firmware_id,
                'error_msg' => $errorMessageDB
            ]);
        } catch(PDOException $dbErr) {
            error_log('[compileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
        }
        sendSSE('error', $errorMessage);
        flush();
        // Nettoyer le répertoire de build en cas d'erreur de compilation
        if (isset($build_dir) && isset($build_dir_created) && $build_dir_created) {
            cleanupBuildDir($build_dir);
        }
        // Nettoyer le fichier .ino temporaire si créé depuis la DB
        if (isset($is_temp_ino) && $is_temp_ino && isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        return;
    }
    
    $sendProgress(80);
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
            error_log('[compileFirmware] Erreur DB: ' . $dbErr->getMessage());
        }
        sendSSE('error', 'Fichier .bin introuvable après compilation');
        flush();
        if (isset($build_dir) && $build_dir_created) {
            cleanupBuildDir($build_dir);
        }
        // Nettoyer le fichier .ino temporaire si créé depuis la DB
        if (isset($is_temp_ino) && $is_temp_ino && isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        return;
    }
    
    $compiled_bin = $bin_files[0];
    
    $sendProgress(95);
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
    sendSSE('log', 'info', 'Encodage du fichier .bin pour PostgreSQL...');
    flush();
    
    $bin_content_encoded = encodeByteaForPostgres($bin_content_db);
    
    // Libérer la mémoire immédiatement après encodage
    unset($bin_content_db);
    
    $version_dir = getVersionDir($firmware['version']);
    $bin_filename = 'fw_ott_v' . $firmware['version'] . '.bin';
    
    sendSSE('log', 'info', 'Mise à jour de la base de données...');
    sendSSE('log', 'info', '   Taille: ' . $file_size . ' bytes');
    sendSSE('log', 'info', '   Checksum: ' . substr($checksum, 0, 16) . '...');
    flush();
    
    try {
        $updateStmt = $pdo->prepare("
            UPDATE firmware_versions 
            SET file_path = :file_path, 
                file_size = :file_size, 
                checksum = :checksum,
                bin_content = :bin_content,
                status = 'compiled'
            WHERE id = :id
        ");
        
        $updateResult = $updateStmt->execute([
            'file_path' => 'hardware/firmware/' . $version_dir . '/' . $bin_filename,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'bin_content' => $bin_content_encoded,  // BYTEA encodé pour PostgreSQL
            'id' => $firmware_id
        ]);
        
        if (!$updateResult) {
            $errorInfo = $updateStmt->errorInfo();
            throw new Exception('Erreur UPDATE: ' . ($errorInfo[2] ?? 'Erreur inconnue'));
        }
        
        sendSSE('log', 'info', '✅ Mise à jour DB réussie');
        error_log('[compileFirmware] ✅ Fichier .bin mis à jour en DB - ID: ' . $firmware_id . ', Taille: ' . $file_size);
        
    } catch(PDOException $dbErr) {
        error_log('[compileFirmware] ❌ Erreur DB lors de la mise à jour: ' . $dbErr->getMessage());
        error_log('[compileFirmware] Code erreur: ' . $dbErr->getCode());
        sendSSE('log', 'error', '❌ Erreur lors de la mise à jour en base de données: ' . $dbErr->getMessage());
        sendSSE('error', 'Erreur lors de la sauvegarde du fichier compilé');
        flush();
        // Nettoyer le répertoire de build avant de relancer l'exception
        if (isset($build_dir) && isset($build_dir_created) && $build_dir_created) {
            cleanupBuildDir($build_dir);
        }
        // Nettoyer le fichier .ino temporaire si créé depuis la DB
        if (isset($is_temp_ino) && $is_temp_ino && isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        throw $dbErr;
    }
    
    // Libérer la mémoire de l'encodage immédiatement
    unset($bin_content_encoded);
    
    sendSSE('log', 'info', '✅ Fichier .bin stocké en base de données');
    
    // Nettoyer le répertoire de build immédiatement après stockage en DB
    cleanupBuildDir($build_dir);
    
    // Nettoyer le fichier .ino temporaire si créé depuis la DB
    if (isset($is_temp_ino) && $is_temp_ino && isset($ino_path) && file_exists($ino_path)) {
        @unlink($ino_path);
        error_log('[compileFirmware] ✅ Fichier .ino temporaire nettoyé: ' . $ino_path);
    }
    
    $sendProgress(100);
    sendSSE('log', 'info', '✅ Compilation terminée avec succès !');
    sendSSE('success', 'Firmware v' . $firmware['version'] . ' compilé avec succès', $firmware['version']);
    
    // Fermer la connexion après un court délai pour permettre au client de recevoir les messages
    sleep(1);

    return true;
}




