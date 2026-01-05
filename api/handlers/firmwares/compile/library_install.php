<?php
/**
 * Arduino Library Installation Module
 * Gère l'installation des bibliothèques requises via arduino-cli
 */

require_once __DIR__ . '/sse.php';

/**
 * Liste des bibliothèques requises pour la compilation
 * Format: ['nom_bibliotheque' => 'version_ou_latest']
 */
function getRequiredLibraries() {
    return [
        'ArduinoJson' => 'latest', // Bibliothèque JSON standard pour Arduino
        // Ajouter d'autres bibliothèques ici si nécessaire
    ];
}

/**
 * Installe les bibliothèques requises si nécessaire
 * @param string $arduinoCli Chemin vers arduino-cli
 * @param string $arduinoDataDir Répertoire de données Arduino (hardware/arduino-data)
 * @param string $envStr Chaîne d'environnement pour les commandes shell
 * @param callable $sendProgress Fonction de callback pour mettre à jour la progression
 * @param int $firmware_id ID du firmware pour mise à jour DB en cas d'erreur
 * @return bool true si succès, false si échec
 */
function installRequiredLibraries($arduinoCli, $arduinoDataDir, $envStr, $sendProgress, $firmware_id) {
    global $pdo;
    
    $requiredLibraries = getRequiredLibraries();
    
    if (empty($requiredLibraries)) {
        sendSSE('log', 'info', '✅ Aucune bibliothèque externe requise');
        flush();
        return true;
    }
    
    sendSSE('log', 'info', 'Vérification des bibliothèques requises...');
    $sendProgress(52);
    flush();
    echo ": keep-alive\n\n";
    flush();
    
    // Vérifier quelles bibliothèques sont déjà installées
    $libListCmd = $envStr . $arduinoCli . ' lib list 2>&1';
    $libListOutput = [];
    $libListReturn = 0;
    
    exec($libListCmd, $libListOutput, $libListReturn);
    $libListStr = implode("\n", $libListOutput);
    
    // Extraire les bibliothèques installées
    $installedLibraries = [];
    foreach ($libListOutput as $line) {
        // Format: "ArduinoJson@6.21.3"
        if (preg_match('/^([^@]+)@(.+)$/', trim($line), $matches)) {
            $installedLibraries[strtolower($matches[1])] = $matches[2];
        }
    }
    
    // Vérifier quelles bibliothèques doivent être installées
    $librariesToInstall = [];
    foreach ($requiredLibraries as $libName => $version) {
        $libNameLower = strtolower($libName);
        if (!isset($installedLibraries[$libNameLower])) {
            $librariesToInstall[$libName] = $version;
        } else {
            sendSSE('log', 'info', '✅ Bibliothèque ' . $libName . ' déjà installée (version ' . $installedLibraries[$libNameLower] . ')');
            flush();
        }
    }
    
    if (empty($librariesToInstall)) {
        sendSSE('log', 'info', '✅ Toutes les bibliothèques requises sont déjà installées');
        $sendProgress(55);
        flush();
        return true;
    }
    
    // Installer les bibliothèques manquantes
    sendSSE('log', 'info', '📚 Installation de ' . count($librariesToInstall) . ' bibliothèque(s) requise(s)...');
    flush();
    
    foreach ($librariesToInstall as $libName => $version) {
        sendSSE('log', 'info', '📥 Installation de ' . $libName . ($version !== 'latest' ? ' (version ' . $version . ')' : '') . '...');
        flush();
        echo ": keep-alive\n\n";
        flush();
        
        // Construire la commande d'installation
        $libSpec = $libName;
        if ($version !== 'latest') {
            $libSpec .= '@' . $version;
        }
        
        $installCmd = $envStr . $arduinoCli . ' lib install "' . $libSpec . '" 2>&1';
        
        // Exécuter l'installation avec output en temps réel
        $descriptorspec = [
            0 => ["pipe", "r"],  // stdin
            1 => ["pipe", "w"],  // stdout
            2 => ["pipe", "w"]   // stderr
        ];
        
        $process = proc_open($installCmd, $descriptorspec, $pipes);
        
        if (is_resource($process)) {
            $stdout = $pipes[1];
            $stderr = $pipes[2];
            
            stream_set_blocking($stdout, false);
            stream_set_blocking($stderr, false);
            
            $installOutput = [];
            $startTime = time();
            $lastKeepAliveTime = $startTime;
            
            while (true) {
                $currentTime = time();
                
                $read = [$stdout, $stderr];
                $write = null;
                $except = null;
                $timeout = 1;
                
                $num_changed = stream_select($read, $write, $except, $timeout);
                
                if ($num_changed > 0) {
                    foreach ($read as $stream) {
                        $isStderr = ($stream === $stderr);
                        $chunk = stream_get_contents($stream, 65536);
                        
                        if ($chunk !== false && $chunk !== '') {
                            $lines = explode("\n", $chunk);
                            foreach ($lines as $line) {
                                $lineTrimmed = rtrim($line, "\r\n");
                                if (!empty($lineTrimmed)) {
                                    $installOutput[] = $lineTrimmed;
                                    
                                    $logLevel = $isStderr ? 'error' : 'info';
                                    if (stripos($lineTrimmed, 'error') !== false || 
                                        stripos($lineTrimmed, 'failed') !== false ||
                                        preg_match('/error:/i', $lineTrimmed)) {
                                        $logLevel = 'error';
                                    } elseif (stripos($lineTrimmed, 'warning') !== false) {
                                        $logLevel = 'warning';
                                    }
                                    
                                    sendSSE('log', $logLevel, $lineTrimmed);
                                    error_log('[installRequiredLibraries] ' . $libName . ' install: ' . $lineTrimmed);
                                }
                            }
                            flush();
                        }
                    }
                }
                
                // Vérifier si le processus est terminé
                $status = proc_get_status($process);
                if (!$status || $status['running'] === false) {
                    break;
                }
                
                // Timeout de sécurité : 5 minutes par bibliothèque
                if ($currentTime - $startTime > 300) {
                    sendSSE('log', 'warning', '⚠️ Timeout lors de l\'installation de ' . $libName . ' (5 minutes)');
                    proc_terminate($process);
                    break;
                }
                
                // Keep-alive toutes les 1 seconde
                if ($currentTime - $lastKeepAliveTime >= 1) {
                    echo ": keep-alive\n\n";
                    flush();
                    $lastKeepAliveTime = $currentTime;
                }
                
                usleep(100000); // 100ms
            }
            
            // Fermer les pipes
            if (is_resource($pipes[0])) fclose($pipes[0]);
            if (is_resource($pipes[1])) fclose($pipes[1]);
            if (is_resource($pipes[2])) fclose($pipes[2]);
            
            $return = proc_close($process);
            $installOutputStr = implode("\n", $installOutput);
            
            // Vérifier si l'installation a réussi
            $installSuccess = ($return === 0) || 
                             (stripos($installOutputStr, 'installed') !== false) ||
                             (stripos($installOutputStr, 'already installed') !== false);
            
            if ($installSuccess) {
                sendSSE('log', 'info', '✅ Bibliothèque ' . $libName . ' installée avec succès');
                flush();
            } else {
                error_log('[installRequiredLibraries] ❌ Échec installation ' . $libName . ' - Code: ' . $return);
                error_log('[installRequiredLibraries] Sortie: ' . substr($installOutputStr, 0, 1000));
                
                sendSSE('log', 'error', '❌ Échec de l\'installation de ' . $libName);
                sendSSE('log', 'error', '   Code retour: ' . $return);
                
                // Afficher les dernières lignes d'erreur
                $errorLines = array_filter($installOutput, function($line) {
                    return stripos($line, 'error') !== false || 
                           stripos($line, 'failed') !== false;
                });
                
                if (!empty($errorLines)) {
                    $lastErrors = array_slice($errorLines, -3);
                    foreach ($lastErrors as $errorLine) {
                        sendSSE('log', 'error', '   ' . trim($errorLine));
                    }
                }
                flush();
                
                // Marquer le firmware comme erreur
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = :error_msg
                        WHERE id = :id
                    ")->execute([
                        'id' => $firmware_id,
                        'error_msg' => 'Échec installation bibliothèque: ' . $libName
                    ]);
                } catch(PDOException $dbErr) {
                    error_log('[installRequiredLibraries] Erreur DB: ' . $dbErr->getMessage());
                }
                
                sendSSE('error', 'Échec de l\'installation de la bibliothèque ' . $libName);
                flush();
                return false;
            }
        } else {
            // Fallback sur exec si proc_open échoue
            exec($installCmd, $installOutput, $return);
            
            if ($return === 0) {
                sendSSE('log', 'info', '✅ Bibliothèque ' . $libName . ' installée avec succès');
                flush();
            } else {
                sendSSE('log', 'error', '❌ Échec de l\'installation de ' . $libName . ' (code: ' . $return . ')');
                sendSSE('error', 'Échec de l\'installation de la bibliothèque ' . $libName);
                flush();
                
                // Marquer le firmware comme erreur
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = :error_msg
                        WHERE id = :id
                    ")->execute([
                        'id' => $firmware_id,
                        'error_msg' => 'Échec installation bibliothèque: ' . $libName
                    ]);
                } catch(PDOException $dbErr) {
                    error_log('[installRequiredLibraries] Erreur DB: ' . $dbErr->getMessage());
                }
                
                return false;
            }
        }
        
        echo ": keep-alive\n\n";
        flush();
    }
    
    $sendProgress(55);
    sendSSE('log', 'info', '✅ Toutes les bibliothèques requises sont installées');
    flush();
    
    return true;
}

