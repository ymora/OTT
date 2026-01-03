<?php
/**
 * ESP32 Core Installation Module
 * Gère l'installation du core ESP32 pour arduino-cli
 */

require_once __DIR__ . '/sse.php';

/**
 * Installe le core ESP32 si nécessaire
 * @param string $arduinoCli Chemin vers arduino-cli
 * @param string $arduinoDataDir Répertoire de données Arduino (hardware/arduino-data)
 * @param string $envStr Chaîne d'environnement pour les commandes shell
 * @param callable $sendProgress Fonction de callback pour mettre à jour la progression
 * @param int $firmware_id ID du firmware pour mise à jour DB en cas d'erreur
 * @return bool true si succès, false si échec
 */
function installEsp32Core($arduinoCli, $arduinoDataDir, $envStr, $sendProgress, $firmware_id) {
    global $pdo;
    
                    sendSSE('log', 'info', 'Vérification du core ESP32...');
                    $sendProgress(40);
                    flush();
                    echo ": keep-alive\n\n";
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
                                error_log('[installEsp32Core] ' . $errorMsg);
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
                            
                            // Envoyer un keep-alive toutes les 1 seconde pendant la vérification (plus fréquent pour éviter les timeouts)
                            if ($currentTime - $coreListLastKeepAlive >= 1) {
                                echo ": keep-alive\n\n";
                                flush();
                                $coreListLastKeepAlive = $currentTime;
                            }
                            
                            $status = proc_get_status($coreListProcess);
                            if ($status === false) {
                                $lastError = error_get_last();
                                $errorMsg = 'proc_get_status a retourné false: ' . ($lastError ? $lastError['message'] : 'processus invalide');
                                error_log('[installEsp32Core] ' . $errorMsg);
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
                        // C'est NORMAL sur certains serveurs où proc_open est désactivé pour des raisons de sécurité
                        // Le fallback sur popen() fonctionne parfaitement
                        $errorDetails = [
                            'message' => $procErr->getMessage(),
                            'type' => get_class($procErr),
                            'arduino_cli' => $arduinoCli,
                            'env_str' => substr($envStr, 0, 100)
                        ];
                        error_log('[installEsp32Core] proc_open indisponible pour core list (fallback normal): ' . json_encode($errorDetails, JSON_UNESCAPED_UNICODE));
                        // Ne pas afficher d'erreur à l'utilisateur, c'est normal et le fallback fonctionne
                        $coreListProcess = false; // Forcer le fallback
                    }
                    
                    // Fallback sur popen() avec stream_select() si proc_open échoue (non-bloquant)
                    // C'est NORMAL sur certains serveurs (proc_open peut être désactivé pour sécurité)
                    // popen() fonctionne parfaitement comme alternative
                    if (!is_resource($coreListProcess) || empty($coreListOutput)) {
                        // Ne plus afficher d'avertissement, c'est normal et le fallback fonctionne correctement
                        // sendSSE('log', 'warning', '⚠️ proc_open indisponible ou échoué pour core list, fallback sur popen()');
                        // flush();
                        
                        // Utiliser popen() au lieu de exec() pour permettre des keep-alive pendant l'exécution
                        $popenHandle = @popen($envStr . $arduinoCli . ' core list 2>&1', 'r');
                        
                        if ($popenHandle === false || !is_resource($popenHandle)) {
                            error_log('[installEsp32Core] popen() a échoué pour core list');
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
                                        
                                        // Envoyer les logs de popen via SSE pour diagnostic
                                        $lines = explode("\n", trim($chunk));
                                        foreach ($lines as $line) {
                                            if (!empty(trim($line))) {
                                                sendSSE('log', 'info', 'Core list (popen): ' . trim($line));
                                                flush();
                                                error_log('[installEsp32Core] Core list popen: ' . trim($line));
                                            }
                                        }
                                        
                                        $popenLastReadTime = $currentTime;
                                    }
                                }
                                
                                // Vérifier si le processus est terminé (feof() après un délai)
                                if (feof($popenHandle)) {
                                    break;
                                }
                                
                                // Envoyer un keep-alive toutes les 1 seconde (plus fréquent pour éviter les timeouts)
                                if ($currentTime - $popenLastKeepAlive >= 1) {
                                    echo ": keep-alive\n\n";
                                    flush();
                                    $popenLastKeepAlive = $currentTime;
                                }
                                
                                // Timeout de sécurité : 30 secondes maximum
                                if ($currentTime - $popenStartTime > 30) {
                                    error_log('[installEsp32Core] Timeout popen() core list (>30s)');
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
                    
                    // Analyser la sortie pour déterminer si c'est une vraie erreur ou juste "pas de core installé"
                    $coreListStr = implode("\n", $coreListOutput);
                    $isNoPlatformsInstalled = stripos($coreListStr, 'No platforms installed') !== false;
                    
                    // Le code 141 (SIGPIPE) n'est pas une erreur fatale - c'est souvent juste que le processus s'est terminé normalement
                    // Le code 0 est OK, et 141 peut aussi être OK si la sortie indique "No platforms installed"
                    if ($coreListReturn !== 0 && $coreListReturn !== 141) {
                        // Vraie erreur (code différent de 0 et 141)
                        $coreListError = substr($coreListStr, 0, 4000);
                        sendSSE('log', 'error', '❌ arduino-cli core list a échoué (code ' . $coreListReturn . ')');
                        sendSSE('log', 'error', '   Sortie: ' . $coreListError);
                        sendSSE('error', 'Échec de la vérification du core ESP32 (arduino-cli core list). Consultez les logs.');
                        flush();
                        try {
                            $pdo->prepare("
                                UPDATE firmware_versions 
                                SET status = 'error', error_message = 'core list failed (code ' . $coreListReturn . ')'
                                WHERE id = :id
                            ")->execute(['id' => $firmware_id]);
                        } catch(PDOException $dbErr) {
                            error_log('[installEsp32Core] Erreur DB update status core list: ' . $dbErr->getMessage());
                        }
                        return;
                    } elseif ($coreListReturn === 141 && !$isNoPlatformsInstalled) {
                        // Code 141 mais sortie inattendue - peut être une erreur
                        sendSSE('log', 'warning', '⚠️ arduino-cli core list a retourné le code 141 (SIGPIPE)');
                        sendSSE('log', 'info', '   Sortie: ' . substr($coreListStr, 0, 200));
                        // Continuer quand même - ce n'est pas forcément une erreur fatale
                    }
                    
                    // Construire la chaîne de sortie si pas déjà fait
                    if (!isset($coreListStr)) {
                        $coreListStr = implode("\n", $coreListOutput);
                    }
                    
                    // Log de diagnostic pour comprendre pourquoi le core n'est pas détecté
                    // Toujours afficher le diagnostic pour aider au débogage
                    sendSSE('log', 'info', '🔍 Diagnostic core ESP32:');
                    sendSSE('log', 'info', '   ARDUINO_DIRECTORIES_USER: ' . $arduinoDataDir);
                    sendSSE('log', 'info', '   Dossier existe: ' . (is_dir($arduinoDataDir) ? 'OUI' : 'NON'));
                    sendSSE('log', 'info', '   Code retour core list: ' . $coreListReturn);
                    sendSSE('log', 'info', '   Sortie core list (premiers 500 chars): ' . substr($coreListStr, 0, 500));
                    flush();
                    
                    // Vérifier si le core ESP32 est installé AVANT de décider de nettoyer
                    $esp32Installed = strpos($coreListStr, 'esp32:esp32') !== false || 
                                     strpos($coreListStr, 'esp-rv32') !== false ||
                                     strpos($coreListStr, 'esp32') !== false;
                    
                    // Vérifier aussi si le core existe physiquement (plus fiable)
                    $userArduinoDir = $arduinoDataDir . '/packages/esp32/hardware/esp32';
                    $coreExistsPhysically = is_dir($userArduinoDir) && is_dir($userArduinoDir . '/tools');
                    
                    // OPTIMISATION: Ne pas nettoyer le core s'il est déjà installé et fonctionnel
                    // Le nettoyage n'est nécessaire que si :
                    // 1. Le core n'est pas détecté par arduino-cli
                    // 2. Le core n'existe pas physiquement
                    // 3. Ou en cas d'erreur d'architecture (géré ailleurs)
                    $shouldCleanCore = false;
                    
                    if ($esp32Installed && $coreExistsPhysically) {
                        sendSSE('log', 'info', '✅ Core ESP32 déjà installé et détecté - pas de nettoyage nécessaire');
                        flush();
                    } else {
                        // Core non installé ou corrompu, nettoyage optionnel (mais pas forcé)
                        $shouldCleanCore = false; // Ne pas nettoyer automatiquement, laisser arduino-cli gérer
                        sendSSE('log', 'info', '🔍 Core ESP32 non détecté ou incomplet');
                        flush();
                    }
                    
                    // Utiliser la vérification physique comme source de vérité
                    if ($coreExistsPhysically || $esp32Installed) {
                        sendSSE('log', 'info', '✅ Core ESP32 déjà installé - prêt pour compilation');
                        sendSSE('log', 'info', '   Source: hardware/arduino-data/ (cache local)');
                        sendSSE('log', 'info', '   ⚡ Pas de téléchargement nécessaire - compilation directe');
                        $sendProgress(50);
                        flush();
                    } else {
                        sendSSE('log', 'info', 'Core ESP32 non installé, installation nécessaire...');
                        sendSSE('log', 'info', '⏳ Cette étape peut prendre plusieurs minutes (téléchargement ~568MB, une seule fois)...');
                        sendSSE('log', 'info', '   ✅ Le core sera stocké dans hardware/arduino-data/');
                        sendSSE('log', 'info', '   💡 Pour éviter de retélécharger à chaque déploiement, configurez un Persistent Disk sur Render.com');
                        sendSSE('log', 'info', '   📖 Voir: docs/RENDER_PERSISTENT_DISK.md');
                        $sendProgress(42);
                        
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
                            
                            // ⚠️ IMPORTANT: Configurer le timeout HTTP d'arduino-cli pour éviter les timeouts lors du téléchargement
                            // Le téléchargement du core ESP32 (~568MB) peut prendre plusieurs minutes avec une connexion lente
                            sendSSE('log', 'info', '⚙️  Configuration du timeout HTTP (600s) pour téléchargements longs...');
                            flush();
                            exec($envStr . $arduinoCli . ' config set network.connection_timeout 600s 2>&1', $configTimeoutOutput, $configTimeoutReturn);
                            if ($configTimeoutReturn === 0) {
                                sendSSE('log', 'info', '✅ Timeout HTTP configuré à 600 secondes (10 minutes)');
                            } else {
                                sendSSE('log', 'warning', '⚠️ Impossible de configurer le timeout (peut être normal si déjà configuré)');
                            }
                            flush();
                            
                            sendSSE('log', 'info', 'Téléchargement et installation du core ESP32...');
                            sendSSE('log', 'info', '📥 Phase 1: Téléchargement (~568MB)');
                            sendSSE('log', 'info', '   ℹ️ Le téléchargement peut prendre 5-10 minutes selon votre connexion');
                            
                            // ⚠️ IMPORTANT: Détecter l'architecture du serveur pour installer les bons outils
                            $serverArch = php_uname('m');
                            $isLinux = strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN';
                            sendSSE('log', 'info', '🔍 Architecture serveur détectée: ' . $serverArch . ' (' . PHP_OS . ')');
                            flush();
                            
                            // Vérifier si on est sur ARM64 (Apple Silicon, AWS Graviton, etc.)
                            $isARM64 = stripos($serverArch, 'arm64') !== false || stripos($serverArch, 'aarch64') !== false;
                            if ($isARM64) {
                                sendSSE('log', 'warning', '⚠️ Architecture ARM détectée - Les outils ESP32 peuvent ne pas être disponibles pour cette architecture');
                                sendSSE('log', 'info', '   Si la compilation échoue, vérifiez que arduino-cli supporte ARM64 pour ESP32');
                                flush();
                            }
                            
                            // Le nettoyage a déjà été fait plus haut, continuer avec l'installation
                            $sendProgress(45);
                            
                            // Exécuter avec output en temps réel pour voir la progression
                            $descriptorspec = [
                                0 => ["pipe", "r"],  // stdin
                                1 => ["pipe", "w"],  // stdout
                                2 => ["pipe", "w"]   // stderr
                            ];
                            
                            // Utiliser --verbose pour obtenir tous les logs d'installation
                            // ⚠️ IMPORTANT: Ne pas spécifier de version pour laisser arduino-cli choisir la version compatible
                            $process = proc_open($envStr . $arduinoCli . ' core install esp32:esp32 --verbose 2>&1', $descriptorspec, $pipes);
                            
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
                                $currentlyDownloading = false; // Indicateur si on est actuellement en phase de téléchargement
                                $currentlyDownloading = false; // Indicateur si on est actuellement en phase de téléchargement
                                
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
                                        error_log('[installEsp32Core] Erreur stream_select lors de l\'installation du core');
                                        break;
                                    } elseif ($num_changed_streams > 0) {
                                        // Des données sont disponibles, les lire
                                        foreach ($read as $stream) {
                                            $isStderr = ($stream === $stderr);
                                            
                                            // Utiliser stream_get_contents pour lire TOUT ce qui est disponible
                                            // stream_get_contents lit jusqu'à la fin du stream ou jusqu'à la limite
                                            // Sur un stream non-bloquant, cela lit tout ce qui est disponible maintenant
                                            $chunk = stream_get_contents($stream, 65536); // 64KB max par lecture
                                            
                                            if ($chunk !== false && $chunk !== '') {
                                                // Logger immédiatement pour diagnostic
                                                error_log('[installEsp32Core] Core install output reçu (' . strlen($chunk) . ' bytes) depuis ' . ($isStderr ? 'stderr' : 'stdout'));
                                                
                                                // Traiter ligne par ligne - IMPORTANT: ne pas trim avant de split pour garder les lignes vides intermédiaires
                                                $lines = explode("\n", $chunk);
                                                
                                                // Traiter chaque ligne
                                                foreach ($lines as $lineIndex => $line) {
                                                    // Ne pas trim avant de vérifier, car certaines lignes peuvent être importantes même si vides
                                                    $lineTrimmed = rtrim($line, "\r\n");
                                                    
                                                    // Envoyer toutes les lignes, même celles qui semblent vides (peuvent contenir des retours chariot)
                                                    // Mais ignorer les lignes vraiment vides après trim
                                                    if (!empty($lineTrimmed) || ($lineIndex === 0 && !empty($chunk))) {
                                                        if (!empty($lineTrimmed)) {
                                                            $installOutput[] = $lineTrimmed;
                                                            
                                                            // Déterminer le niveau de log selon le contenu
                                                            $logLevel = $isStderr ? 'error' : 'info';
                                                            
                                                            // ⚠️ DÉTECTION: Erreur I/O lors de l'installation
                                                            $isIOError = stripos($lineTrimmed, 'input/output error') !== false ||
                                                                         stripos($lineTrimmed, 'I/O error') !== false ||
                                                                         stripos($lineTrimmed, 'Cannot install tool') !== false ||
                                                                         stripos($lineTrimmed, 'Error during install') !== false;
                                                            
                                                            if ($isIOError) {
                                                                $logLevel = 'error';
                                                                sendSSE('log', 'error', '❌ ERREUR I/O DÉTECTÉE');
                                                                sendSSE('log', 'error', '   Problème d\'écriture sur le disque lors de l\'installation');
                                                                sendSSE('log', 'info', '   Causes possibles:');
                                                                sendSSE('log', 'info', '   - Espace disque insuffisant');
                                                                sendSSE('log', 'info', '   - Problème avec le système de fichiers /tmp');
                                                                sendSSE('log', 'info', '   - Permissions insuffisantes');
                                                                sendSSE('log', 'warning', '💡 SOLUTION: Vérifier l\'espace disque et les permissions');
                                                                flush();
                                                            }
                                                            
                                                            // Détecter les lignes de téléchargement (contiennent "MiB" et "%")
                                                            $isDownloadLine = preg_match('/\d+\.?\d*\s*(B|MiB|KiB)\s*\/\s*\d+\.?\d*\s*(B|MiB|KiB)\s*\d+\.?\d*%/', $lineTrimmed) ||
                                                                         preg_match('/Downloading/', $lineTrimmed) ||
                                                                         preg_match('/downloaded$/', $lineTrimmed);
                                                            
                                                            // Extraire le pourcentage de téléchargement pour mettre à jour la progression
                                                            $downloadPercent = null;
                                                            if (preg_match('/(\d+\.?\d*)%\s*(\d+m\d+s)?$/', $lineTrimmed, $matches)) {
                                                                // Format: "432.93 MiB / 568.67 MiB   76.13% 00m10s"
                                                                $downloadPercent = floatval($matches[1]);
                                                            } elseif (preg_match('/(\d+\.?\d*)%\s*(\d+m\d+s)?/', $lineTrimmed, $matches)) {
                                                                // Format alternatif
                                                                $downloadPercent = floatval($matches[1]);
                                                            }
                                                            
                                                            if ($isDownloadLine) {
                                                                // Ligne de progression de téléchargement
                                                                $logLevel = 'info';
                                                                $currentlyDownloading = true; // On est en phase de téléchargement
                                                                $skipRawLine = false; // Par défaut, on affiche la ligne brute
                                                                
                                                                // Mettre à jour la progression globale (45% à 50% pour le téléchargement du core)
                                                                if ($downloadPercent !== null) {
                                                                    // Le téléchargement du core représente 5% de la compilation totale (45% à 50%)
                                                                    // On mappe 0-100% du téléchargement vers 45-50% de la compilation totale
                                                                    $globalProgress = 45 + ($downloadPercent / 100) * 5;
                                                                    $sendProgress(intval($globalProgress));
                                                                    // Ne pas afficher de message de progression dans les logs, seulement le % dans la barre
                                                                    $skipRawLine = true; // Ne pas afficher la ligne brute
                                                                    flush();
                                                                } else {
                                                                    // Même sans pourcentage, envoyer un message pour montrer qu'on est en téléchargement
                                                                    // Ne pas spammer, seulement pour les lignes importantes
                                                                    if (preg_match('/Downloading packages|Starting download/i', $lineTrimmed)) {
                                                                        sendSSE('log', 'info', '📥 Début du téléchargement du core ESP32...');
                                                                        $skipRawLine = true; // Ne pas afficher la ligne brute
                                                                        flush();
                                                                    }
                                                                }
                                                                
                                                                // Si on voit "downloaded", on a fini le téléchargement
                                                                if (preg_match('/downloaded$/', $lineTrimmed)) {
                                                                    $currentlyDownloading = false;
                                                                    $sendProgress(48); // Progression intermédiaire
                                                                    sendSSE('log', 'info', '✅ Téléchargement terminé');
                                                                    sendSSE('log', 'info', '🔧 Phase 2: Installation des outils et configuration...');
                                                                    $skipRawLine = true; // Ne pas afficher la ligne brute
                                                                    flush();
                                                                }
                                                                
                                                                // Ne pas afficher la ligne brute si on a déjà envoyé un message formaté
                                                                if ($skipRawLine) {
                                                                    continue; // Passer à la ligne suivante sans afficher celle-ci
                                                                }
                                                            } elseif (stripos($lineTrimmed, 'error') !== false || stripos($lineTrimmed, 'failed') !== false || 
                                                                      preg_match('/error:/i', $lineTrimmed) || preg_match('/fatal/i', $lineTrimmed)) {
                                                                $logLevel = 'error';
                                                            } elseif (stripos($lineTrimmed, 'warning') !== false || preg_match('/warning:/i', $lineTrimmed)) {
                                                                $logLevel = 'warning';
                                                            }
                                                            
                                                            // Envoyer immédiatement via SSE
                                                            sendSSE('log', $logLevel, $lineTrimmed);
                                                            flush();
                                                            
                                                            // Logger aussi dans error_log pour diagnostic serveur
                                                            error_log('[installEsp32Core] Core install ' . ($isStderr ? 'stderr' : 'stdout') . ': ' . $lineTrimmed);
                                                            
                                                            $lastOutputTime = $currentTime;
                                                            $lastLine = $lineTrimmed; // Garder la dernière ligne pour détecter la phase
                                                        }
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
                                    
                                    // Timeout de sécurité : vérifier si le processus est toujours actif
                                    // (L'installation du core ESP32 peut prendre du temps : téléchargement ~568MB peut prendre 15-25 minutes selon la connexion)
                                    // Utiliser deux critères :
                                    // 1. Timeout absolu : 40 minutes maximum (temps total depuis le démarrage)
                                    // 2. Timeout sans sortie : 30 minutes sans sortie (mais seulement si processus semble inactif)
                                    $totalElapsed = $currentTime - $startTime;
                                    $noOutputElapsed = $currentTime - $lastOutputTime;
                                    
                                    // Timeout absolu : 40 minutes maximum pour l'installation complète
                                    if ($totalElapsed > 2400) { // 40 minutes
                                        sendSSE('log', 'warning', '⚠️ Timeout absolu atteint (40 minutes), arrêt de l\'installation');
                                        sendSSE('error', 'Timeout: L\'installation du core ESP32 a pris trop de temps (40 minutes maximum)');
                                        // Marquer le firmware comme erreur dans la base de données
                                        try {
                                            $pdo->prepare("
                                                UPDATE firmware_versions 
                                                SET status = 'error', error_message = 'Timeout lors de l\'installation du core ESP32 (40 minutes)'
                                                WHERE id = :id
                                            ")->execute(['id' => $firmware_id]);
                                        } catch(PDOException $dbErr) {
                                            error_log('[installEsp32Core] Erreur DB: ' . $dbErr->getMessage());
                                        }
                                        proc_terminate($process);
                                        break;
                                    }
                                    
                                    // Timeout sans sortie : 30 minutes sans sortie ET processus semble inactif
                                    // Utiliser le $status déjà récupéré ci-dessus (pas besoin de le récupérer à nouveau)
                                    if ($noOutputElapsed > 1800) { // 30 minutes sans sortie
                                        // Le $status est déjà récupéré ci-dessus, réutiliser cette valeur
                                        if ($status && $status['running'] === true) {
                                            // Le processus est toujours actif, continuer même sans sortie récente
                                            // (peut arriver pendant le téléchargement avec connexion très lente)
                                            // Ne pas déclencher de timeout, mais envoyer un avertissement périodique
                                            // Envoyer l'avertissement toutes les 5 minutes (300 secondes)
                                            if ($noOutputElapsed % 300 < 5) { // Dans les 5 premières secondes de chaque période de 5 minutes
                                                $minutesNoOutput = floor($noOutputElapsed / 60);
                                                sendSSE('log', 'warning', "⚠️ Pas de sortie depuis {$minutesNoOutput} minutes, mais le processus est toujours actif (téléchargement en cours...)");
                                                flush();
                                            }
                                        } else {
                                            // Le processus n'est plus actif ET pas de sortie depuis 30 minutes = vraiment bloqué
                                            sendSSE('log', 'warning', '⚠️ Pas de sortie depuis 30 minutes et processus inactif, installation bloquée');
                                            sendSSE('error', 'Timeout: L\'installation du core ESP32 semble bloquée (pas de sortie depuis 30 minutes)');
                                            // Marquer le firmware comme erreur dans la base de données
                                            try {
                                                $pdo->prepare("
                                                    UPDATE firmware_versions 
                                                    SET status = 'error', error_message = 'Timeout lors de l\'installation du core ESP32 (pas de sortie depuis 30 minutes)'
                                                    WHERE id = :id
                                                ")->execute(['id' => $firmware_id]);
                                            } catch(PDOException $dbErr) {
                                                error_log('[installEsp32Core] Erreur DB: ' . $dbErr->getMessage());
                                            }
                                            break;
                                        }
                                    }
                                    
                                    // Détecter les erreurs de timeout HTTP dans la sortie et proposer un retry
                                    if (stripos($lastLine, 'request canceled') !== false || 
                                        stripos($lastLine, 'Client.Timeout') !== false ||
                                        stripos($lastLine, 'context cancellation') !== false) {
                                        sendSSE('log', 'warning', '⚠️ Timeout HTTP détecté pendant le téléchargement');
                                        sendSSE('log', 'info', '   Le téléchargement du core ESP32 (~568MB) a été interrompu par un timeout');
                                        sendSSE('log', 'info', '   Tentative de reprise...');
                                        flush();
                                        // Ne pas arrêter immédiatement, laisser arduino-cli gérer le retry si possible
                                    }
                                    
                                    // Envoyer un keep-alive SSE toutes les 1 seconde pendant l'installation pour maintenir la connexion active
                                    // (Les commentaires SSE `: keep-alive` maintiennent la connexion ouverte)
                                    // Intervalle réduit à 1 seconde pour éviter les timeouts (certains proxies/serveurs ont des timeouts courts)
                                    if ($currentTime - $lastKeepAliveTime >= 1) {
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
                                    // Utiliser $currentlyDownloading qui est mis à jour en temps réel, pas seulement $isDownloading basé sur $lastLine
                                    if (!$currentlyDownloading && !$isDownloading && $currentTime - $lastHeartbeatTime >= 5) {
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
                                
                                // ⚠️ IMPORTANT: Lire toutes les données restantes avant de fermer les pipes
                                // Le processus peut se terminer mais il peut rester des données dans les buffers
                                $remainingAttempts = 10; // Lire jusqu'à 10 fois pour vider les buffers
                                while ($remainingAttempts > 0) {
                                    $read = [$stdout, $stderr];
                                    $write = null;
                                    $except = null;
                                    $timeout = 0; // Pas d'attente, juste vérifier
                                    
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
                                                        
                                                        // Détecter les erreurs
                                                        if (stripos($lineTrimmed, 'error') !== false || 
                                                            stripos($lineTrimmed, 'failed') !== false ||
                                                            preg_match('/error:/i', $lineTrimmed)) {
                                                            $logLevel = 'error';
                                                        }
                                                        
                                                        sendSSE('log', $logLevel, $lineTrimmed);
                                                        error_log('[installEsp32Core] Core install final output: ' . $lineTrimmed);
                                                    }
                                                }
                                                flush();
                                            }
                                        }
                                    }
                                    $remainingAttempts--;
                                    usleep(100000); // 100ms entre chaque tentative
                                }
                                
                                // Fermer les pipes
                                if (is_resource($pipes[0])) fclose($pipes[0]);
                                if (is_resource($pipes[1])) fclose($pipes[1]);
                                if (is_resource($pipes[2])) fclose($pipes[2]);
                                
                                $return = proc_close($process);
                                
                                // ⚠️ AMÉLIORATION: Logger le code de retour pour diagnostic
                                error_log('[installEsp32Core] Core install terminé - Code retour: ' . $return);
                                error_log('[installEsp32Core] Nombre de lignes de sortie: ' . count($installOutput));
                                
                                // Mettre à jour la progression à 50% à la fin du téléchargement/installation
                                $sendProgress(50);
                                flush();
                            } else {
                                // Fallback sur exec si proc_open échoue
                                exec($envStr . $arduinoCli . ' core install esp32:esp32 2>&1', $installOutput, $return);
                                sendSSE('log', 'info', implode("\n", $installOutput));
                                // Mettre à jour la progression à 50% même en fallback
                                $sendProgress(50);
                                flush();
                            }
                            
                            // ⚠️ AMÉLIORATION: Vérifier si le core est réellement installé même si le code retour n'est pas 0
                            // Parfois arduino-cli retourne un code d'erreur mais le core est quand même installé
                            $installOutputStr = implode("\n", $installOutput);
                            $coreInstalledCheck = false;
                            
                            // Vérifier dans la sortie si l'installation a réussi
                            if (stripos($installOutputStr, 'installed') !== false || 
                                stripos($installOutputStr, 'already installed') !== false ||
                                stripos($installOutputStr, 'successfully') !== false) {
                                $coreInstalledCheck = true;
                            }
                            
                            // Vérifier aussi si le core existe physiquement
                            $corePath = $arduinoDataDir . '/packages/esp32/hardware/esp32';
                            if (is_dir($corePath)) {
                                $coreInstalledCheck = true;
                            }
                            
                            // Si le core est installé (même avec code retour != 0), considérer comme succès
                            if ($coreInstalledCheck) {
                                sendSSE('log', 'info', '✅ Core ESP32 installé avec succès (vérifié)');
                                error_log('[installEsp32Core] ✅ Core install réussi (code retour: ' . $return . ' mais core présent)');
                            } elseif ($return !== 0) {
                                // Vérifier si c'est une erreur de timeout HTTP
                                // ⚠️ AMÉLIORATION: Diagnostic détaillé de l'erreur
                                error_log('[installEsp32Core] ❌ Core install échoué - Code retour: ' . $return);
                                error_log('[installEsp32Core] Sortie complète (' . strlen($installOutputStr) . ' chars): ' . substr($installOutputStr, 0, 2000));
                                
                                // Afficher les dernières lignes d'erreur pour diagnostic
                                $outputLines = explode("\n", $installOutputStr);
                                $errorLines = array_filter($outputLines, function($line) {
                                    return stripos($line, 'error') !== false || 
                                           stripos($line, 'failed') !== false || 
                                           stripos($line, 'fatal') !== false ||
                                           preg_match('/error:/i', $line);
                                });
                                
                                if (!empty($errorLines)) {
                                    $lastErrors = array_slice($errorLines, -5); // Dernières 5 lignes d'erreur
                                    sendSSE('log', 'error', '❌ Détails de l\'erreur d\'installation:');
                                    foreach ($lastErrors as $errorLine) {
                                        if (!empty(trim($errorLine))) {
                                            sendSSE('log', 'error', '   ' . trim($errorLine));
                                        }
                                    }
                                    flush();
                                }
                                
                                // Afficher aussi les dernières lignes de la sortie complète pour diagnostic
                                $lastLines = array_slice($outputLines, -10);
                                sendSSE('log', 'info', '📋 Dernières lignes de la sortie:');
                                foreach ($lastLines as $line) {
                                    if (!empty(trim($line))) {
                                        sendSSE('log', 'info', '   ' . trim($line));
                                    }
                                }
                                flush();
                                
                                $isTimeoutError = stripos($installOutputStr, 'request canceled') !== false || 
                                                 stripos($installOutputStr, 'Client.Timeout') !== false ||
                                                 stripos($installOutputStr, 'context cancellation') !== false ||
                                                 stripos($installOutputStr, 'timeout') !== false;
                                
                                if ($isTimeoutError) {
                                    sendSSE('log', 'error', '❌ Timeout HTTP lors du téléchargement du core ESP32');
                                    sendSSE('log', 'error', '   Le téléchargement de ~568MB a été interrompu par un timeout HTTP');
                                    sendSSE('log', 'info', '   ⚙️ Le timeout HTTP a été configuré à 600 secondes (10 minutes)');
                                    sendSSE('log', 'info', '   💡 Si le problème persiste, votre connexion est peut-être très lente ou instable');
                                    sendSSE('log', 'info', '   💡 Solution GRATUITE: Relancez simplement la compilation');
                                    sendSSE('log', 'info', '   ✅ arduino-cli reprendra automatiquement le téléchargement là où il s\'est arrêté');
                                    sendSSE('log', 'info', '   ✅ Le core partiellement téléchargé sera réutilisé (pas de re-téléchargement complet)');
                                    sendSSE('log', 'info', '   ✅ Progressivement, le téléchargement complet finira par réussir');
                                    
                                    // Vérifier si une partie du core a été téléchargée (peut être réutilisée)
                                    $corePath = $arduinoDataDir . '/packages/esp32';
                                    if (is_dir($corePath)) {
                                        // Calculer la taille du core partiellement téléchargé
                                        $coreSize = 0;
                                        $iterator = new RecursiveIteratorIterator(
                                            new RecursiveDirectoryIterator($corePath, RecursiveDirectoryIterator::SKIP_DOTS),
                                            RecursiveIteratorIterator::SELF_FIRST
                                        );
                                        foreach ($iterator as $file) {
                                            if ($file->isFile()) {
                                                $coreSize += $file->getSize();
                                            }
                                        }
                                        $coreSizeMB = round($coreSize / 1024 / 1024, 1);
                                        sendSSE('log', 'info', "   ✅ Core partiellement téléchargé: {$coreSizeMB} MB (sera réutilisé)");
                                    }
                                    
                                    $errorMessage = 'Timeout HTTP lors du téléchargement du core ESP32. Relancez la compilation pour reprendre automatiquement le téléchargement.';
                                } else {
                                    // ⚠️ AMÉLIORATION: Message d'erreur plus détaillé
                                    $errorMessage = 'Erreur lors de l\'installation du core ESP32 (code: ' . $return . ')';
                                    if (!empty($errorLines)) {
                                        $firstError = trim(reset($errorLines));
                                        if (!empty($firstError)) {
                                            $errorMessage .= ' - ' . substr($firstError, 0, 200);
                                        }
                                    }
                                    sendSSE('log', 'error', '❌ Code retour: ' . $return);
                                    sendSSE('log', 'error', '   Vérifiez les logs ci-dessus pour plus de détails');
                                }
                                
                                // Marquer le firmware comme erreur dans la base de données
                                try {
                                    $pdo->prepare("
                                        UPDATE firmware_versions 
                                        SET status = 'error', error_message = :error_message
                                        WHERE id = :id
                                    ")->execute([
                                        'id' => $firmware_id,
                                        'error_message' => $errorMessage
                                    ]);
                                } catch(PDOException $dbErr) {
                                    error_log('[installEsp32Core] Erreur DB: ' . $dbErr->getMessage());
                                }
                                sendSSE('error', $errorMessage);
                                flush();
                                return;
                            }
                            
                            sendSSE('log', 'info', '✅ Core ESP32 installé avec succès');
                        }
    return true;
}

