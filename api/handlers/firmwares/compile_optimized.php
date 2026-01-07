<?php
/**
 * Compilation de firmware OPTIMISÉE - Version rapide
 * Saute les vérifications inutiles, réduit les logs, va directement à la compilation
 */

require_once __DIR__ . '/compile/sse.php';
require_once __DIR__ . '/../../helpers.php';

function handleCompileFirmwareOptimized($firmware_id) {
    global $pdo;
    
    // Validation
    $firmware_id = filter_var($firmware_id, FILTER_VALIDATE_INT);
    if (!$firmware_id || $firmware_id <= 0) {
        sendSSE('error', 'ID firmware invalide');
        return;
    }
    
    // Setup SSE
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    if (!headers_sent()) {
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');
    }
    
    establishSSEConnection();
    ignore_user_abort(true);
    set_time_limit(1800); // 30 min max
    
    try {
        // Auth rapide
        $user = getCurrentUser();
        if (!$user) {
            sendSSE('error', 'Authentification requise');
            flush();
            return;
        }
        
        $userRole = $user['role_name'] ?? null;
        if ($userRole && !in_array($userRole, ['admin', 'technicien'])) {
            sendSSE('error', 'Permissions insuffisantes');
            flush();
            return;
        }
        
        sendSSE('log', 'info', '⚡ Compilation démarrée...');
        sendSSE('progress', 5, 'Initialisation');
        sendSSEKeepAlive();
        
        // Récupérer firmware
        $stmt = $pdo->prepare("SELECT *, ino_content FROM firmware_versions WHERE id = ?");
        $stmt->execute([$firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            sendSSE('error', 'Firmware introuvable');
            flush();
            return;
        }
        
        // Mettre à jour statut
        $updateStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'compiling' WHERE id = ?");
        $updateStmt->execute([$firmware_id]);
        
        // Trouver fichier .ino
        $inoFile = findFirmwareInoFile($firmware_id, $firmware);
        if (!$inoFile || !file_exists($inoFile)) {
            sendSSE('error', 'Fichier .ino introuvable');
            $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'Fichier .ino introuvable' WHERE id = ?");
            $errorStmt->execute([$firmware_id]);
            flush();
            return;
        }
        
        sendSSE('log', 'info', '✅ Fichier .ino trouvé');
        sendSSE('progress', 10, 'Fichier source validé');
        sendSSEKeepAlive();
        
        // Trouver arduino-cli (rapide)
        $rootDir = getProjectRoot();
        $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
        $arduinoCli = null;
        
        // Chercher dans bin/ d'abord (le plus rapide)
        $localCli = $rootDir . '/bin/arduino-cli' . ($isWindows ? '.exe' : '');
        if (file_exists($localCli)) {
            $arduinoCli = $localCli;
        } else {
            // PATH système
            $pathCli = $isWindows ? trim(shell_exec('where arduino-cli 2>nul || echo ""')) : trim(shell_exec('which arduino-cli 2>/dev/null || echo ""'));
            if (!empty($pathCli) && file_exists($pathCli)) {
                $arduinoCli = $pathCli;
            }
        }
        
        if (!$arduinoCli) {
            sendSSE('error', 'arduino-cli non trouvé');
            $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'arduino-cli non trouvé' WHERE id = ?");
            $errorStmt->execute([$firmware_id]);
            flush();
            return;
        }
        
        sendSSE('log', 'info', '🔨 Compilation en cours...');
        sendSSEKeepAlive();
        
        // Setup environnement minimal
        // Utiliser le répertoire Arduino standard selon l'OS (système pour utilisateurs locaux, projet pour serveurs)
        $arduinoDataDir = getArduinoUserDirectory();
        // Normaliser les séparateurs de chemin
        $arduinoDataDir = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $arduinoDataDir);
        $arduinoDataDir = realpath($arduinoDataDir) ?: $arduinoDataDir;
        
        // Créer le répertoire s'il n'existe pas
        if (!is_dir($arduinoDataDir)) {
            @mkdir($arduinoDataDir, 0755, true);
        }
        
        // Vérifier que le répertoire existe et est accessible
        if (!is_dir($arduinoDataDir) || !is_writable($arduinoDataDir)) {
            sendSSE('error', 'Impossible de créer/accéder au répertoire Arduino: ' . $arduinoDataDir);
            $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'Répertoire Arduino inaccessible' WHERE id = ?");
            $errorStmt->execute([$firmware_id]);
            flush();
            return;
        }
        
        sendSSE('log', 'info', '📁 Répertoire Arduino: ' . $arduinoDataDir);
        
        $env = [];
        
        // Utiliser un répertoire temporaire système pour HOME (évite les chemins trop longs)
        // Le staging (downloads) sera dans /tmp au lieu de hardware/arduino-data/arduino-cli-home/.arduino15/staging
        if (empty(getenv('HOME'))) {
            $tempHome = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'arduino-cli-' . get_current_user();
            if (!is_dir($tempHome)) {
                @mkdir($tempHome, 0755, true);
            }
            $env['HOME'] = $tempHome;
        }
        
        // Répertoire DATA pour le core ESP32
        // Priorité: 1) /root/.arduino15 (Docker avec tools pré-installés)
        //           2) .arduino15/ du projet (volume monté)
        $arduinoDataCoreDir = null;
        $dockerArduinoDir = '/root/.arduino15';
        $projectArduinoDir = $rootDir . DIRECTORY_SEPARATOR . '.arduino15';
        
        // Vérifier d'abord /root/.arduino15 (Docker avec tools complets)
        if (is_dir($dockerArduinoDir . '/packages/esp32/tools')) {
            $arduinoDataCoreDir = $dockerArduinoDir;
            sendSSE('log', 'info', '📦 Utilisation tools ESP32 Docker: ' . $dockerArduinoDir);
        }
        // Sinon utiliser le répertoire du projet
        elseif (is_dir($projectArduinoDir)) {
            $arduinoDataCoreDir = $projectArduinoDir;
            sendSSE('log', 'info', '📦 Core ESP32 dans ' . $projectArduinoDir);
        }
        
        // TOUJOURS utiliser les variables d'environnement (plus fiable que le fichier de config)
        $configFileArg = '';
        
        // Configurer le répertoire DATA si trouvé
        if ($arduinoDataCoreDir) {
            $env['ARDUINO_DIRECTORIES_DATA'] = $arduinoDataCoreDir;
            
            // Vérifier que le core est bien présent
            $corePath = $arduinoDataCoreDir . DIRECTORY_SEPARATOR . 'packages' . DIRECTORY_SEPARATOR . 'esp32' . DIRECTORY_SEPARATOR . 'hardware' . DIRECTORY_SEPARATOR . 'esp32';
            if (is_dir($corePath)) {
                $versions = glob($corePath . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR);
                if (!empty($versions)) {
                    $version = basename($versions[0]);
                    sendSSE('log', 'info', '✅ Core ESP32 version ' . $version . ' trouvé');
                }
            } else {
                sendSSE('log', 'warning', '⚠️ Répertoire core ESP32 non trouvé dans ' . $corePath);
            }
        } else {
            sendSSE('log', 'warning', '⚠️ Aucun répertoire Arduino trouvé');
        }
        
        // Répertoire utilisateur pour les bibliothèques (persistant)
        $env['ARDUINO_DIRECTORIES_USER'] = $arduinoDataDir;
        
        // Répertoire de téléchargement/staging (temporaire, dans /tmp pour éviter les chemins trop longs)
        $tempDownloads = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'arduino-downloads-' . get_current_user();
        if (!is_dir($tempDownloads)) {
            @mkdir($tempDownloads, 0755, true);
        }
        $env['ARDUINO_DIRECTORIES_DOWNLOADS'] = $tempDownloads;
        
        $envStr = '';
        foreach ($env as $key => $value) {
            $envStr .= $key . '=' . escapeshellarg($value) . ' ';
        }
        
        // Build dir temporaire
        $build_dir = sys_get_temp_dir() . '/ott_firmware_build_' . $firmware_id . '_' . time();
        mkdir($build_dir, 0755, true);
        
        // Copier .ino
        $sketch_name = 'fw_ott_optimized';
        $sketch_dir = $build_dir . '/' . $sketch_name;
        mkdir($sketch_dir, 0755, true);
        copy($inoFile, $sketch_dir . '/' . $sketch_name . '.ino');
        
        // Copier les librairies locales (TinyGSM) - NÉCESSAIRE pour la compilation
        sendSSE('log', 'info', '📚 Vérification des dépendances...');
        sendSSE('progress', 15, 'Vérification dépendances');
        sendSSEKeepAlive();
        
        $hardware_lib_dir = realpath($rootDir) ? realpath($rootDir) . DIRECTORY_SEPARATOR . 'hardware' . DIRECTORY_SEPARATOR . 'lib' : $rootDir . DIRECTORY_SEPARATOR . 'hardware' . DIRECTORY_SEPARATOR . 'lib';
        $hardware_lib_dir = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $hardware_lib_dir);
        $dependenciesFound = [];
        
        if (is_dir($hardware_lib_dir)) {
            $lib_dirs = glob($hardware_lib_dir . DIRECTORY_SEPARATOR . 'TinyGSM*', GLOB_ONLYDIR);
            if (!empty($lib_dirs)) {
                $libraries_dir = $sketch_dir . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'libraries';
                if (!is_dir($libraries_dir)) {
                    mkdir($libraries_dir, 0755, true);
                }
                
                // Copier dans arduino-data/libraries (persistant, réutilisable)
                $arduinoDataLibrariesDir = $arduinoDataDir . DIRECTORY_SEPARATOR . 'libraries';
                if (!is_dir($arduinoDataLibrariesDir)) {
                    mkdir($arduinoDataLibrariesDir, 0755, true);
                }
                
                foreach ($lib_dirs as $lib_dir) {
                    $lib_name = basename($lib_dir);
                    $dependenciesFound[] = $lib_name;
                    $target_lib_persistent = $arduinoDataLibrariesDir . DIRECTORY_SEPARATOR . $lib_name;
                    
                    // Vérifier si TinyGSM doit être mise à jour (version modifiée requise)
                    // On vérifie si le fichier contient GSM_NL (présent dans notre version modifiée)
                    $needsUpdate = false;
                    if (stripos($lib_name, 'TinyGSM') !== false && is_dir($target_lib_persistent)) {
                        $sim7600File = $target_lib_persistent . '/src/TinyGsmClientSIM7600.h';
                        if (file_exists($sim7600File)) {
                            $content = file_get_contents($sim7600File);
                            // Notre version modifiée contient GSM_NL, la version standard non
                            if (strpos($content, 'GSM_NL') === false) {
                                $needsUpdate = true;
                                sendSSE('log', 'info', "🔄 Mise à jour TinyGSM (version modifiée requise)");
                            }
                        }
                    }
                    
                    if ($needsUpdate && is_dir($target_lib_persistent)) {
                        // Supprimer récursivement le dossier existant
                        $it = new RecursiveDirectoryIterator($target_lib_persistent, RecursiveDirectoryIterator::SKIP_DOTS);
                        $files = new RecursiveIteratorIterator($it, RecursiveIteratorIterator::CHILD_FIRST);
                        foreach($files as $file) {
                            if ($file->isDir()) {
                                rmdir($file->getRealPath());
                            } else {
                                unlink($file->getRealPath());
                            }
                        }
                        rmdir($target_lib_persistent);
                    }
                    
                    if (!is_dir($target_lib_persistent)) {
                        sendSSE('log', 'info', "📦 Installation librairie locale: {$lib_name}");
                        copyRecursive($lib_dir, $target_lib_persistent);
                        sendSSE('log', 'info', "✅ {$lib_name} installée");
                    } else {
                        sendSSE('log', 'info', "✅ {$lib_name} déjà installée");
                    }
                    
                    // Lien symbolique ou copie dans le build
                    $target_lib_build = $libraries_dir . DIRECTORY_SEPARATOR . $lib_name;
                    if (!is_dir($target_lib_build) && !is_link($target_lib_build)) {
                        if (!$isWindows && function_exists('symlink')) {
                            @symlink($target_lib_persistent, $target_lib_build);
                        }
                        if (!is_dir($target_lib_build)) {
                            copyRecursive($lib_dir, $target_lib_build);
                        }
                    }
                    sendSSEKeepAlive();
                }
            } else {
                sendSSE('log', 'warning', '⚠️ Aucune librairie locale trouvée dans hardware/lib/');
            }
        } else {
            sendSSE('log', 'warning', '⚠️ Dossier hardware/lib/ introuvable');
        }
        
        if (!empty($dependenciesFound)) {
            sendSSE('log', 'info', '✅ Dépendances trouvées: ' . implode(', ', $dependenciesFound));
        } else {
            sendSSE('log', 'warning', '⚠️ Aucune dépendance locale trouvée');
        }
        sendSSEKeepAlive();
        
        // Vérifier et installer ArduinoJson si nécessaire (bibliothèque requise)
        // Vérification directe dans le répertoire persistant (instantanée, pas d'appel arduino-cli)
        $librariesDir = $arduinoDataDir . DIRECTORY_SEPARATOR . 'libraries';
        $arduinoJsonPath = $librariesDir . DIRECTORY_SEPARATOR . 'ArduinoJson';
        $arduinoJsonDirExists = is_dir($arduinoJsonPath);
        $arduinoJsonHeaderExists = $arduinoJsonDirExists && file_exists($arduinoJsonPath . DIRECTORY_SEPARATOR . 'ArduinoJson.h');
        $arduinoJsonInstalled = $arduinoJsonDirExists && $arduinoJsonHeaderExists;
        
        if ($arduinoJsonInstalled) {
            sendSSE('log', 'info', '✅ ArduinoJson déjà installé dans ' . $librariesDir);
        } else {
            // Log de debug pour comprendre pourquoi la vérification échoue
            if (!$arduinoJsonDirExists) {
                sendSSE('log', 'debug', '🔍 ArduinoJson non trouvé : répertoire inexistant');
            } elseif (!$arduinoJsonHeaderExists) {
                sendSSE('log', 'debug', '🔍 ArduinoJson non trouvé : ArduinoJson.h manquant');
            }
            sendSSE('log', 'info', '📦 Installation ArduinoJson (sera installé dans ' . $librariesDir . ', staging dans /tmp)...');
            sendSSEKeepAlive();
        
            // Créer le répertoire libraries si nécessaire (persistant sur serveur distant)
            if (!is_dir($librariesDir)) {
                mkdir($librariesDir, 0755, true);
            }
            
            // arduino-cli utilise automatiquement ARDUINO_DIRECTORIES_USER pour installer dans hardware/arduino-data/libraries
            $installCmd = $envStr . $configFileArg . $arduinoCli . ' lib install "ArduinoJson" 2>&1';
            exec($installCmd, $installOutput, $installReturn);
            if ($installReturn !== 0) {
                $errorOutput = implode("\n", array_slice($installOutput, -5));
                sendSSE('log', 'error', 'Échec installation ArduinoJson: ' . substr($errorOutput, 0, 200));
                sendSSE('error', 'Échec installation bibliothèque ArduinoJson');
                $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'Échec installation ArduinoJson' WHERE id = ?");
                $errorStmt->execute([$firmware_id]);
                if (is_dir($build_dir)) {
                    exec(($isWindows ? 'rmdir /s /q ' : 'rm -rf ') . escapeshellarg($build_dir) . ' 2>&1');
                }
                flush();
                return;
            }
            
            // Vérifier que l'installation a bien eu lieu dans le répertoire persistant
            if (is_dir($arduinoJsonPath) && file_exists($arduinoJsonPath . '/ArduinoJson.h')) {
                sendSSE('log', 'info', '✅ ArduinoJson installé dans ' . $librariesDir);
            } else {
                sendSSE('log', 'warning', '⚠️ ArduinoJson installé mais non trouvé dans ' . $librariesDir);
            }
        }
        sendSSEKeepAlive();
        
        // Vérifier que le core ESP32 est détecté avant compilation
        sendSSE('log', 'info', '🔍 Vérification core ESP32...');
        sendSSE('progress', 20, 'Vérification ESP32');
        sendSSEKeepAlive();
        $coreCheckCmd = $envStr . $configFileArg . $arduinoCli . ' core list 2>&1';
        exec($coreCheckCmd, $coreListOutput, $coreListReturn);
        $coreListStr = implode("\n", $coreListOutput);
        $hasEsp32 = stripos($coreListStr, 'esp32:esp32') !== false;
        
        if (!$hasEsp32) {
            sendSSE('log', 'error', '❌ Core ESP32 non détecté. Sortie: ' . substr($coreListStr, 0, 200));
            sendSSE('log', 'info', '💡 Tentative d\'installation automatique du core...');
            sendSSEKeepAlive();
            
            // Installer le core ESP32
            $installCoreCmd = $envStr . $configFileArg . $arduinoCli . ' core install esp32:esp32 2>&1';
            exec($installCoreCmd, $installCoreOutput, $installCoreReturn);
            
            if ($installCoreReturn !== 0) {
                $errorOutput = implode("\n", array_slice($installCoreOutput, -10));
                sendSSE('error', 'Échec installation core ESP32: ' . substr($errorOutput, 0, 300));
                $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'Core ESP32 non installé' WHERE id = ?");
                $errorStmt->execute([$firmware_id]);
                if (is_dir($build_dir)) {
                    exec(($isWindows ? 'rmdir /s /q ' : 'rm -rf ') . escapeshellarg($build_dir) . ' 2>&1');
                }
                flush();
                return;
            }
            
            sendSSE('log', 'info', '✅ Core ESP32 installé');
        } else {
            sendSSE('log', 'info', '✅ Core ESP32 détecté');
        }
        sendSSEKeepAlive();
        
        // Compilation directe avec logs en temps réel
        sendSSE('log', 'info', '🔨 Démarrage compilation arduino-cli...');
        sendSSE('progress', 25, 'Lancement arduino-cli');
        sendSSEKeepAlive();
        
        $fqbn = 'esp32:esp32:esp32';
        $compileCmd = $envStr . $configFileArg . $arduinoCli . ' compile --verbose --fqbn ' . $fqbn . ' --build-path ' . escapeshellarg($build_dir) . ' ' . escapeshellarg($sketch_dir) . ' 2>&1';
        
        // Utiliser proc_open pour capturer les logs en temps réel
        $descriptorspec = [
            0 => ["pipe", "r"],  // stdin
            1 => ["pipe", "w"],  // stdout
            2 => ["pipe", "w"]   // stderr
        ];
        
        $process = proc_open($compileCmd, $descriptorspec, $pipes);
        
        if (!is_resource($process)) {
            sendSSE('error', 'Impossible de démarrer la compilation');
            flush();
            return;
        }
        
        // Configurer les streams en non-bloquant
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        
        $startTime = microtime(true);
        $lastKeepAlive = time();
        $output = [];
        $errorOutput = [];
        $currentPhase = 'init';
        $phaseProgress = 10;
        $filesCompiled = 0;
        
        // Lire les logs en temps réel
        while (true) {
            $read = [$pipes[1], $pipes[2]];
            $write = null;
            $except = null;
            
            $changed = stream_select($read, $write, $except, 1);
            
            if ($changed === false) {
                break;
            }
            
            // Lire stdout
            if (in_array($pipes[1], $read)) {
                $line = fgets($pipes[1]);
                if ($line !== false) {
                    $trimmed = trim($line);
                    if (!empty($trimmed)) {
                        $output[] = $trimmed;
                        
                        // Filtrer et envoyer les logs importants
                        $isImportant = false;
                        $level = 'info';
                        
                        // Détecter les phases importantes et mettre à jour la progression
                        
                        if (stripos($trimmed, 'sketch') !== false && stripos($trimmed, 'ino') !== false) {
                            if ($currentPhase !== 'sketch') {
                                $currentPhase = 'sketch';
                                $phaseProgress = 20;
                                sendSSE('progress', $phaseProgress);
                                sendSSE('log', 'info', '📝 Compilation du sketch...');
                            }
                            $isImportant = true;
                        } elseif (stripos($trimmed, 'compiling') !== false && (stripos($trimmed, '.cpp') !== false || stripos($trimmed, '.c') !== false)) {
                            // Phase de compilation des fichiers sources
                            if ($currentPhase !== 'compiling') {
                                $currentPhase = 'compiling';
                                $phaseProgress = 30;
                                sendSSE('progress', $phaseProgress);
                                sendSSE('log', 'info', '⚙️  Compilation des fichiers sources...');
                                $filesCompiled = 0;
                            } else {
                                // Incrémenter progressivement pendant la compilation (30-60%)
                                $filesCompiled++;
                                // Estimer la progression basée sur le nombre de fichiers (max ~30 fichiers)
                                $phaseProgress = min(60, 30 + (int)($filesCompiled * 30 / 30));
                                if ($filesCompiled % 5 === 0) { // Mettre à jour tous les 5 fichiers
                                    sendSSE('progress', $phaseProgress);
                                }
                            }
                            // Extraire le nom du fichier compilé
                            if (preg_match('/compiling\s+([^\s]+)/i', $trimmed, $matches)) {
                                sendSSE('log', 'info', '  → ' . basename($matches[1]));
                            }
                            $isImportant = true;
                        } elseif (stripos($trimmed, 'linking') !== false || stripos($trimmed, 'link') !== false) {
                            if ($currentPhase !== 'linking') {
                                $currentPhase = 'linking';
                                $phaseProgress = 70;
                                sendSSE('progress', $phaseProgress);
                                sendSSE('log', 'info', '🔗 Édition des liens...');
                            }
                            $isImportant = true;
                        } elseif (stripos($trimmed, 'archiving') !== false || stripos($trimmed, 'archive') !== false) {
                            if ($currentPhase !== 'archiving') {
                                $currentPhase = 'archiving';
                                $phaseProgress = 80;
                                sendSSE('progress', $phaseProgress);
                                sendSSE('log', 'info', '📦 Archivage...');
                            }
                            $isImportant = true;
                        } elseif (stripos($trimmed, 'building') !== false && stripos($trimmed, 'firmware') !== false) {
                            if ($currentPhase !== 'building') {
                                $currentPhase = 'building';
                                $phaseProgress = 90;
                                sendSSE('progress', $phaseProgress);
                                sendSSE('log', 'info', '🔨 Génération du firmware...');
                            }
                            $isImportant = true;
                        } elseif (stripos($trimmed, 'error') !== false || stripos($trimmed, 'fatal') !== false) {
                            sendSSE('log', 'error', $trimmed);
                            $isImportant = true;
                        } elseif (stripos($trimmed, 'warning') !== false) {
                            sendSSE('log', 'warning', $trimmed);
                            $isImportant = true;
                        }
                        
                        // Envoyer keep-alive périodiquement
                        if (time() - $lastKeepAlive > 2) {
                            sendSSEKeepAlive();
                            $lastKeepAlive = time();
                        }
                    }
                } else {
                    // EOF
                    break;
                }
            }
            
            // Lire stderr
            if (in_array($pipes[2], $read)) {
                $line = fgets($pipes[2]);
                if ($line !== false) {
                    $trimmed = trim($line);
                    if (!empty($trimmed)) {
                        $errorOutput[] = $trimmed;
                        sendSSE('log', 'error', $trimmed);
                        sendSSEKeepAlive();
                    }
                }
            }
            
            // Vérifier si le processus est terminé
            $status = proc_get_status($process);
            if (!$status['running']) {
                break;
            }
        }
        
        // Fermer les pipes
        fclose($pipes[0]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        
        $returnCode = proc_close($process);
        $duration = round(microtime(true) - $startTime, 2);
        
        // Envoyer un résumé
        sendSSE('log', 'info', "⏱️  Compilation terminée en {$duration}s");
        sendSSEKeepAlive();
        
        if ($returnCode === 0) {
            // Chercher le .bin
            $binFiles = glob($build_dir . '/**/*.bin', GLOB_BRACE);
            $binFile = !empty($binFiles) ? $binFiles[0] : null;
            
            if ($binFile && file_exists($binFile)) {
                // Lire le binaire et le stocker en DB (BYTEA)
                $binContent = file_get_contents($binFile);
                if ($binContent !== false) {
                    // Stocker en DB avec bin_content (BYTEA)
                    $stmt = $pdo->prepare("UPDATE firmware_versions SET status = 'compiled', compiled_at = NOW(), error_message = NULL, bin_content = ? WHERE id = ?");
                    $stmt->execute([$binContent, $firmware_id]);
                    sendSSE('progress', 100); // 100% - Terminé
                    sendSSE('log', 'info', "✅ Compilation réussie ({$duration}s)");
                    sendSSE('log', 'info', "📦 Binaire stocké en DB (" . round(strlen($binContent) / 1024, 2) . " KB)");
                    sendSSE('success', 'Compilation terminée', $firmware['version']);
                } else {
                    sendSSE('error', 'Impossible de lire le binaire généré');
                    $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'Impossible de lire le binaire' WHERE id = ?");
                    $errorStmt->execute([$firmware_id]);
                }
            } else {
                sendSSE('error', 'Binaire non généré');
                $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = 'Binaire non généré' WHERE id = ?");
                $errorStmt->execute([$firmware_id]);
            }
        } else {
            $errorMsg = implode("\n", array_slice($output, -10));
            sendSSE('error', 'Erreur compilation: ' . substr($errorMsg, 0, 200));
            $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = ? WHERE id = ?");
            $errorStmt->execute([substr($errorMsg, 0, 500), $firmware_id]);
        }
        
        // Cleanup
        if (is_dir($build_dir)) {
            exec(($isWindows ? 'rmdir /s /q ' : 'rm -rf ') . escapeshellarg($build_dir) . ' 2>&1');
        }
        
        // Nettoyer le fichier temporaire créé depuis la DB si nécessaire
        if (isset($isTempFromDb) && $isTempFromDb && file_exists($inoFile)) {
            @unlink($inoFile);
        }
        
        sendSSEKeepAlive();
        flush();
        
    } catch (Exception $e) {
        error_log('[compile_optimized] Erreur: ' . $e->getMessage());
        sendSSE('error', 'Erreur: ' . $e->getMessage());
        if (isset($firmware_id)) {
            $errorStmt = $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = ? WHERE id = ?");
            $errorStmt->execute([$e->getMessage(), $firmware_id]);
        }
        flush();
    }
}

