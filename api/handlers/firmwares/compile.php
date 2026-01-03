<?php
/**
 * Firmware Compilation Operations
 * Compile firmware and send SSE messages
 * 
 * Refactorisé : Fonctions SSE et cleanup extraites dans des modules séparés
 */

// Charger les modules refactorisés
require_once __DIR__ . '/compile/sse.php';
require_once __DIR__ . '/compile/cleanup.php';
require_once __DIR__ . '/compile/core_install.php';
require_once __DIR__ . '/compile/firmware_compile.php';

/**
 * Vérifie et réinitialise les compilations bloquées (status='compiling' depuis trop longtemps)
 * @param int $firmware_id ID du firmware à vérifier (null pour tous)
 * @param int $maxAgeMinutes Âge maximum en minutes avant de considérer une compilation comme bloquée (défaut: 30)
 * @return int Nombre de compilations réinitialisées
 */
/**
 * Vérifie et réinitialise les compilations bloquées (status='compiling' depuis trop longtemps)
 * @param int|null $firmware_id ID du firmware à vérifier (null pour tous)
 * @param int $maxAgeMinutes Âge maximum en minutes avant de considérer une compilation comme bloquée (défaut: 30)
 * @return int Nombre de compilations réinitialisées
 */
function recoverStuckCompilations($firmware_id = null, $maxAgeMinutes = 30) {
    global $pdo;
    
    try {
        $maxAgeSeconds = $maxAgeMinutes * 60;
        $cutoffTime = date('Y-m-d H:i:s', time() - $maxAgeSeconds);
        
        if ($firmware_id) {
            // Vérifier un firmware spécifique
            // Note: La table n'a pas de colonne error_message, donc on met juste le statut à 'error'
            $stmt = $pdo->prepare("
                UPDATE firmware_versions 
                SET status = 'error'
                WHERE id = :id 
                  AND status = 'compiling' 
                  AND updated_at < :cutoff_time
            ");
            $stmt->execute([
                'id' => $firmware_id,
                'cutoff_time' => $cutoffTime
            ]);
            $recovered = $stmt->rowCount();
        } else {
            // Vérifier tous les firmwares bloqués
            $stmt = $pdo->prepare("
                UPDATE firmware_versions 
                SET status = 'error'
                WHERE status = 'compiling' 
                  AND updated_at < :cutoff_time
            ");
            $stmt->execute([
                'cutoff_time' => $cutoffTime
            ]);
            $recovered = $stmt->rowCount();
        }
        
        if ($recovered > 0) {
            error_log("[recoverStuckCompilations] Réinitialisé $recovered compilation(s) bloquée(s)");
        }
        
        return $recovered;
    } catch(PDOException $e) {
        error_log('[recoverStuckCompilations] Erreur DB: ' . $e->getMessage());
        return 0;
    }
}

function handleCompileFirmware($firmware_id) {
    global $pdo;
    
    // ⚠️ SÉCURITÉ: Validation stricte du firmware_id
    $firmware_id = filter_var($firmware_id, FILTER_VALIDATE_INT);
    if (!$firmware_id || $firmware_id <= 0) {
        sendSSE('error', 'Invalid firmware ID');
        error_log('[handleCompileFirmware] ❌ firmware_id invalide: ' . var_export($firmware_id, true));
        return;
    }
    
    // Variables pour le cleanup en cas de crash
    $build_dir = null;
    $build_dir_created = false;
    $is_temp_ino = false;
    $ino_path = null;
    $compilation_started = false;
    
    // Fonction de cleanup en cas de crash/erreur fatale
    $cleanupOnShutdown = function() use (&$firmware_id, &$build_dir, &$build_dir_created, &$is_temp_ino, &$ino_path, &$compilation_started) {
        global $pdo;
        
        // Nettoyer le répertoire de build si créé
        if ($build_dir_created && $build_dir && is_dir($build_dir)) {
            cleanupBuildDir($build_dir);
        }
        
        // Nettoyer le fichier .ino temporaire si créé
        if ($is_temp_ino && $ino_path && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        // Réinitialiser le statut si la compilation avait commencé
        if ($compilation_started && $firmware_id) {
            try {
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET status = 'error', 
                        error_message = 'Compilation interrompue - erreur fatale ou timeout'
                    WHERE id = :id AND status = 'compiling'
                ")->execute(['id' => $firmware_id]);
                error_log("[handleCompileFirmware] Cleanup: Statut réinitialisé pour firmware ID $firmware_id (crash/timeout)");
            } catch(PDOException $e) {
                error_log('[handleCompileFirmware] Cleanup: Erreur DB: ' . $e->getMessage());
            }
        }
    };
    
    register_shutdown_function($cleanupOnShutdown);
    
    // Variable pour suivre la progression maximale (éviter les retours en arrière)
    static $maxProgress = 0;
    
    // Fonction helper pour envoyer la progression en s'assurant qu'elle ne recule jamais
    $sendProgress = function($progress) use (&$maxProgress) {
        $progress = intval($progress);
        if ($progress > $maxProgress) {
            $maxProgress = $progress;
            sendSSE('progress', $maxProgress);
            return true;
        }
        // Ne pas envoyer si la progression recule
        return false;
    };
    
    // CRITIQUE: Ignorer l'arrêt du script si la connexion client se ferme
    // Cela garantit que la compilation continue même si l'utilisateur change d'onglet
    ignore_user_abort(true);
    
    // Timeout de sécurité : 30 minutes maximum pour éviter les compilations infinies
    // (set_time_limit(0) désactive le timeout, mais on veut un timeout de sécurité)
    $maxCompilationTime = 30 * 60; // 30 minutes en secondes
    $compilationStartTime = time();
    set_time_limit($maxCompilationTime);
    
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
    // Envoyer 3 keep-alive immédiatement pour établir la connexion
    for ($i = 0; $i < 3; $i++) {
        echo ": keep-alive\n\n";
        flush();
        usleep(100000); // 100ms entre chaque keep-alive
    }
    
    // TEST: Envoyer un message DIRECTEMENT sans passer par sendSSE() pour voir si ça fonctionne
    echo "data: " . json_encode(['type' => 'log', 'level' => 'info', 'message' => 'TEST DIRECT - Connexion SSE etablie']) . "\n\n";
    flush();
    error_log('[handleCompileFirmware] Message TEST DIRECT envoye');
    
    // Envoyer un message de connexion immédiatement pour confirmer que la connexion est établie
    sendSSE('log', 'info', 'Connexion SSE établie...');
    flush();
    echo ": keep-alive\n\n";
    flush();
    
    // Logger pour diagnostic
    error_log('[handleCompileFirmware] Démarrage compilation firmware ID: ' . $firmware_id);
    
    // TEST: Envoyer un autre message DIRECTEMENT
    echo "data: " . json_encode(['type' => 'log', 'level' => 'info', 'message' => 'TEST DIRECT 2 - Demarrage processus']) . "\n\n";
    flush();
    error_log('[handleCompileFirmware] Message TEST DIRECT 2 envoye');
    
    // Envoyer un message de diagnostic immédiatement
    sendSSE('log', 'info', 'Démarrage du processus de compilation...');
    flush();
    echo ": keep-alive\n\n";
    flush();
    
    try {
        // Vérifier l'authentification APRÈS avoir envoyé les headers SSE
        // Si l'auth échoue, envoyer une erreur via SSE au lieu d'un JSON avec exit()
        // Mode test: permettre le test sans auth si AUTH_DISABLED est activé
        $user = null;
        if (defined('AUTH_DISABLED') && AUTH_DISABLED) {
            // Mode test sans auth - créer un utilisateur factice pour les tests
            $user = ['id' => 0, 'email' => 'test@test.com', 'role_id' => 1];
            sendSSE('log', 'warning', '⚠️ Mode test activé - authentification désactivée');
            flush();
            echo ": keep-alive\n\n";
            flush();
        } else {
            sendSSE('log', 'info', 'Vérification de l\'authentification...');
            flush();
            echo ": keep-alive\n\n";
            flush();
            
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
            
            sendSSE('log', 'info', '✅ Authentification réussie');
            flush();
            echo ": keep-alive\n\n";
            flush();
            error_log('[handleCompileFirmware] User: ' . ($user['email'] ?? 'unknown'));
        }
        
        // Vérifier que le firmware existe et est en attente de compilation
        try {
            sendSSE('log', 'info', 'Connexion établie, vérification du firmware...');
            flush();
            echo ": keep-alive\n\n";
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
            
            // Vérifier et récupérer les compilations bloquées AVANT de démarrer une nouvelle compilation
            // Si ce firmware est bloqué depuis plus de 30 minutes, le réinitialiser
            $recovered = recoverStuckCompilations($firmware_id, 30);
            if ($recovered > 0) {
                sendSSE('log', 'warning', '⚠️ Compilation précédente bloquée détectée et réinitialisée');
                flush();
                error_log("[handleCompileFirmware] Compilation précédente réinitialisée pour firmware ID $firmware_id");
                
                // Recharger le firmware pour avoir le nouveau statut
                $stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
                $stmt->execute(['id' => $firmware_id]);
                $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            
            // Marquer immédiatement comme "compiling" dans la base de données
            // Cela permet de savoir que la compilation est en cours même si la connexion SSE se ferme
            // Permettre de compiler même si déjà compilé (pour recompiler)
            try {
                $pdo->prepare("UPDATE firmware_versions SET status = 'compiling' WHERE id = :id")->execute(['id' => $firmware_id]);
                $compilation_started = true; // Marquer que la compilation a commencé (pour cleanup)
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
            
            // Envoyer un keep-alive immédiat pour confirmer la connexion
            echo ": keep-alive\n\n";
            flush();
            
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
            
            // Keep-alive après chaque message important
            echo ": keep-alive\n\n";
            flush();
            
            sendSSE('log', 'info', 'Appel de findFirmwareInoFile()...');
            flush();
            echo ": keep-alive\n\n";
            flush();
            error_log('[handleCompileFirmware] Avant findFirmwareInoFile');
            
            try {
                $ino_path = findFirmwareInoFile($firmware_id, $firmware);
                error_log('[handleCompileFirmware] Après findFirmwareInoFile - résultat: ' . ($ino_path ?? 'NULL'));
                sendSSE('log', 'info', 'findFirmwareInoFile() terminé');
                flush();
                echo ": keep-alive\n\n";
                flush();
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
                // ⚠️ SÉCURITÉ: Validation du chemin pour éviter path traversal
                // Accepter les fichiers dans hardware/ du projet OU dans les répertoires temporaires légitimes
                $root_dir = getProjectRoot();
                $realPath = realpath($ino_path);
                $allowedPath = realpath($root_dir . '/hardware');
                $tempDir = realpath(sys_get_temp_dir());
                
                $isValidPath = false;
                
                // Vérifier si le chemin est dans hardware/ du projet
                if ($allowedPath && $realPath && strpos($realPath, $allowedPath) === 0) {
                    $isValidPath = true;
                }
                // Vérifier si le chemin est dans le répertoire temporaire système (fichiers extraits de la DB)
                elseif ($tempDir && $realPath && strpos($realPath, $tempDir) === 0) {
                    // Vérifier que le nom du fichier commence par ott_firmware_ pour éviter les fichiers arbitraires
                    $fileName = basename($realPath);
                    if (strpos($fileName, 'ott_firmware_') === 0 || strpos($fileName, 'fw_ott') === 0) {
                        $isValidPath = true;
                    }
                }
                
                if (!$isValidPath) {
                    sendSSE('log', 'error', '❌ Chemin de fichier invalide (sécurité): ' . $ino_path);
                    sendSSE('log', 'error', '   Chemin réel: ' . ($realPath ?: 'N/A'));
                    sendSSE('log', 'error', '   Chemin autorisé hardware: ' . ($allowedPath ?: 'N/A'));
                    sendSSE('log', 'error', '   Chemin temporaire: ' . ($tempDir ?: 'N/A'));
                    sendSSE('error', 'Chemin de fichier invalide. Sécurité.');
                    flush();
                    
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Chemin de fichier invalide (sécurité)'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    return;
                }
                
                sendSSE('log', 'info', '✅ Fichier trouvé: ' . basename($ino_path));
                sendSSE('log', 'info', '   Chemin: ' . $ino_path);
                
                // ⚠️ SÉCURITÉ: Limite de taille (10MB max)
                $file_size = filesize($ino_path);
                if ($file_size === false) {
                    sendSSE('log', 'error', '❌ Impossible de déterminer la taille du fichier');
                    sendSSE('error', 'Impossible de lire le fichier .ino.');
                    flush();
                    return;
                }
                
                $maxFileSize = 10 * 1024 * 1024; // 10MB
                if ($file_size > $maxFileSize) {
                    sendSSE('log', 'error', '❌ Fichier trop volumineux (taille: ' . round($file_size / 1024 / 1024, 2) . ' MB, max: 10 MB)');
                    sendSSE('error', 'Fichier .ino trop volumineux (max 10MB). Réduisez la taille du fichier.');
                    flush();
                    
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Fichier .ino trop volumineux (max 10MB)'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    return;
                }
                
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
                if ($file_size === 0) {
                    sendSSE('log', 'error', '❌ Fichier trouvé mais vide (taille: 0)');
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
                
                // Déterminer si le fichier .ino est temporaire (extrait de la DB)
                $is_temp_ino = $tempDir && $realPath && strpos($realPath, $tempDir) === 0;
                
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
            $sendProgress(5); // Commencer plus bas pour avoir plus de marge
            flush();
            echo ": keep-alive\n\n";
            flush();
            
            // Logger immédiatement pour diagnostic
            error_log('[handleCompileFirmware] Étape: Démarrage compilation');
            error_log('[handleCompileFirmware] Firmware ID: ' . $firmware_id);
            error_log('[handleCompileFirmware] Version: ' . ($firmware['version'] ?? 'N/A'));
            
            sendSSE('log', 'info', 'Recherche de arduino-cli...');
            flush();
            echo ": keep-alive\n\n";
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
            
            // 4. Pour Docker : vérifier /usr/local/bin/arduino-cli (installé par le Dockerfile)
            if (empty($arduinoCli) && !$isWindows) {
                $dockerArduinoCli = '/usr/local/bin/arduino-cli';
                if (file_exists($dockerArduinoCli) && is_readable($dockerArduinoCli)) {
                    $arduinoCli = $dockerArduinoCli;
                    sendSSE('log', 'info', '✅ arduino-cli trouvé dans /usr/local/bin/ (Docker)');
                }
            }
            
            // 3. Vérification finale - ÉCHEC si arduino-cli n'est pas disponible
            if (empty($arduinoCli) || !file_exists($arduinoCli)) {
                error_log('[handleCompileFirmware] ❌ arduino-cli non trouvé');
                sendSSE('error', '❌ ÉCHEC: arduino-cli non trouvé. La compilation réelle est requise.');
                sendSSE('log', 'error', 'Pour activer la compilation, installez arduino-cli:');
                sendSSE('log', 'error', '  - Windows: .\\scripts\\download_arduino_cli.ps1');
                sendSSE('log', 'error', '  - Linux/Mac: ./scripts/download_arduino_cli.sh');
                sendSSE('log', 'error', '  - Ou placez arduino-cli dans bin/ du projet');
                sendSSE('log', 'error', 'Instructions: https://arduino.github.io/arduino-cli/latest/installation/');
                flush();
                
                // Marquer le firmware comme erreur dans la base de données
                try {
                    $pdo->prepare("
                        UPDATE firmware_versions 
                        SET status = 'error', error_message = 'arduino-cli non trouvé - compilation échouée'
                        WHERE id = :id
                    ")->execute(['id' => $firmware_id]);
                } catch(PDOException $e) {
                    error_log('[handleCompileFirmware] Erreur DB: ' . $e->getMessage());
                }
                
                sleep(1);
                return;
            } else {
                // Compilation réelle avec arduino-cli
                error_log('[handleCompileFirmware] ✅ arduino-cli trouvé: ' . $arduinoCli);
                error_log('[handleCompileFirmware] Étape: arduino-cli disponible');
                sendSSE('log', 'info', '✅ arduino-cli disponible - démarrage de la compilation réelle');
                sendSSE('log', 'info', '   Chemin: ' . $arduinoCli);
                $sendProgress(15);
                flush();
                echo ": keep-alive\n\n";
                flush();
                
                // Définir HOME temporairement pour le test (avant la définition complète de $envStr)
                $testEnv = [];
                if (empty(getenv('HOME'))) {
                    $testEnv['HOME'] = sys_get_temp_dir() . '/arduino-cli-home';
                    if (!is_dir($testEnv['HOME'])) {
                        mkdir($testEnv['HOME'], 0755, true);
                    }
                }
                $testEnvStr = '';
                foreach ($testEnv as $key => $value) {
                    $testEnvStr .= $key . '=' . escapeshellarg($value) . ' ';
                }
                
                // Tester arduino-cli immédiatement avec HOME défini
                try {
                    $testCmd = $testEnvStr . $arduinoCli . ' version 2>&1';
                    $testOutput = shell_exec($testCmd);
                    // Filtrer les avertissements HOME répétés pour un affichage plus propre
                    $testOutputLines = explode("\n", trim($testOutput));
                    $filteredOutput = [];
                    $homeWarningCount = 0;
                    foreach ($testOutputLines as $line) {
                        if (stripos($line, 'Unable to get user home dir') !== false) {
                            $homeWarningCount++;
                            // Ne garder qu'un seul avertissement au lieu de 3
                            if ($homeWarningCount === 1) {
                                $filteredOutput[] = $line;
                            }
                        } else {
                            $filteredOutput[] = $line;
                        }
                    }
                    $cleanOutput = implode("\n", $filteredOutput);
                    error_log('[handleCompileFirmware] Test arduino-cli version: ' . trim($cleanOutput));
                    sendSSE('log', 'info', '   Version: ' . trim($cleanOutput));
                    flush();
                } catch (Exception $e) {
                    error_log('[handleCompileFirmware] ⚠️ Erreur test arduino-cli: ' . $e->getMessage());
                    sendSSE('log', 'warning', '   ⚠️ Impossible de tester arduino-cli: ' . $e->getMessage());
                    flush();
                }
                
                // Nettoyer les anciens répertoires de build au démarrage pour éviter l'accumulation
                cleanupOldBuildDirs();
                
                // Créer un dossier temporaire pour la compilation
                $build_dir = sys_get_temp_dir() . '/ott_firmware_build_' . $firmware_id . '_' . time();
                mkdir($build_dir, 0755, true);
                
                // Variable pour garantir le nettoyage même en cas d'erreur
                $build_dir_created = true;
                
                sendSSE('log', 'info', 'Préparation de l\'environnement de compilation...');
                $sendProgress(30);
                flush();
                echo ": keep-alive\n\n";
                flush();
                
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
                    // Utiliser le répertoire persistant au lieu de /tmp pour éviter les erreurs I/O
                    $env['HOME'] = $arduinoDataDir . '/arduino-cli-home';
                    if (!is_dir($env['HOME'])) {
                        mkdir($env['HOME'], 0755, true);
                    }
                }
                // Utiliser un répertoire persistant pour les données arduino-cli
                $env['ARDUINO_DIRECTORIES_USER'] = $arduinoDataDir;
                
                // ⚠️ NETTOYAGE: Nettoyer le répertoire temporaire d'arduino-cli pour éviter les erreurs I/O
                $arduinoTmpDir = $env['HOME'] . '/.arduino15/tmp';
                if (is_dir($arduinoTmpDir)) {
                    sendSSE('log', 'info', '🧹 Nettoyage du répertoire temporaire arduino-cli...');
                    flush();
                    exec('rm -rf ' . escapeshellarg($arduinoTmpDir) . '/* 2>&1', $tmpCleanOutput, $tmpCleanReturn);
                    if ($tmpCleanReturn === 0) {
                        sendSSE('log', 'info', '   ✅ Répertoire temporaire nettoyé');
                    } else {
                        sendSSE('log', 'warning', '   ⚠️ Impossible de nettoyer le répertoire temporaire (peut être normal)');
                    }
                    flush();
                }
                
                // Vérifier l'espace disque disponible
                $freeSpace = disk_free_space($arduinoDataDir);
                $freeSpaceMB = round($freeSpace / 1024 / 1024, 2);
                sendSSE('log', 'info', '💾 Espace disque disponible: ' . $freeSpaceMB . ' MB');
                if ($freeSpaceMB < 1000) {
                    sendSSE('log', 'warning', '⚠️ Espace disque faible (< 1GB) - L\'installation peut échouer');
                }
                flush();
                
                $envStr = '';
                foreach ($env as $key => $value) {
                    $envStr .= $key . '=' . escapeshellarg($value) . ' ';
                }
                }
                
                // Installation du core ESP32 (refactorisé)
                if (!installEsp32Core($arduinoCli, $arduinoDataDir, $envStr, $sendProgress, $firmware_id)) {
                    // Erreur lors de l'installation, la fonction a déjà géré l'erreur et le cleanup
                    return;
                }
                
                // Compilation du firmware (refactorisé)
                if (!compileFirmware($arduinoCli, $envStr, $build_dir, $sketch_dir, $firmware_id, $firmware, $sendProgress, $compilationStartTime, $maxCompilationTime, $env, $arduinoDataDir, $build_dir_created, $is_temp_ino, $ino_path)) {
                    // Erreur lors de la compilation, la fonction a déjà géré l'erreur et le cleanup
                            return;
                        }
                        
                // Compilation réussie - les fonctions modulaires ont déjà géré le nettoyage
        } catch(PDOException $e) {
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
        
        // Nettoyer le répertoire de build si créé (CRITIQUE pour éviter l'accumulation de fichiers)
        if (isset($build_dir) && isset($build_dir_created) && $build_dir_created) {
            cleanupBuildDir($build_dir);
        }
        // Nettoyer le fichier .ino temporaire si créé depuis la DB
        if (isset($is_temp_ino) && $is_temp_ino && isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
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

