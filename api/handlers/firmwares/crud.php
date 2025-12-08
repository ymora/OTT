<?php
/**
 * Firmware CRUD Operations
 * List, check, and delete firmware operations
 */

function handleGetFirmwares() {
    global $pdo;
    
    // Nettoyer le buffer de sortie AVANT tout header
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    // Définir le Content-Type JSON AVANT tout autre output
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    
    try {
        requireAdmin();
    } catch (Exception $e) {
        // Si requireAdmin() échoue (ex: non authentifié), retourner une erreur 401
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        return;
    }
    
    try {
        // Vérifier si la colonne status existe
        $hasStatusColumn = false;
        try {
            $checkStmt = $pdo->query("
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'firmware_versions' AND column_name = 'status'
                )
            ");
            $hasStatusColumn = $checkStmt->fetchColumn();
        } catch (Exception $e) {
            error_log('[handleGetFirmwares] ⚠️ Erreur vérification colonne status: ' . $e->getMessage());
        }
        
        // IMPORTANT: Exclure ino_content et bin_content (BYTEA) de la liste car :
        // 1. Elles sont très volumineuses (peuvent être plusieurs MB)
        // 2. Elles ne sont pas nécessaires pour l'affichage de la liste
        // 3. Elles peuvent causer des erreurs JSON (Unexpected end of JSON input)
        // Ces colonnes sont récupérées uniquement via handleGetFirmwareIno() et handleDownloadFirmware()
        $sql = "
            SELECT 
                fv.id, fv.version, fv.file_path, fv.file_size, fv.checksum, 
                fv.release_notes, fv.is_stable, fv.min_battery_pct, 
                fv.uploaded_by" . ($hasStatusColumn ? ", fv.status" : "") . ",
                fv.created_at, fv.updated_at,
                u.email as uploaded_by_email, u.first_name, u.last_name
            FROM firmware_versions fv
            LEFT JOIN users u ON fv.uploaded_by = u.id AND u.deleted_at IS NULL
            ORDER BY fv.created_at DESC
        ";
        
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleGetFirmwares] SQL: ' . substr($sql, 0, 200));
        }
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute();
        $firmwares = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Ajouter status par défaut si la colonne n'existe pas
        if (!$hasStatusColumn) {
            foreach ($firmwares as &$fw) {
                $fw['status'] = 'compiled'; // Valeur par défaut
            }
            unset($fw);
        }
        
        // Vérifier que chaque fichier existe vraiment sur le disque
        // Pour chaque firmware, on doit vérifier :
        // - Si compilé (status = 'compiled') : chercher le .bin
        // - Sinon : chercher le .ino
        $verifiedFirmwares = [];
        $root_dir = getProjectRoot();
        foreach ($firmwares as $firmware) {
            $file_exists = false;
            $file_path_absolute = null;
            $file_size_actual = null;
            $file_type = null; // 'ino' ou 'bin'
            
            $firmware_id = $firmware['id'];
            $firmware_version = $firmware['version'];
            $firmware_status = isset($firmware['status']) ? $firmware['status'] : 'compiled';
            
            // Vérifier que les fonctions helpers retournent des valeurs valides
            $version_dir = getVersionDir($firmware_version);
            if (empty($root_dir)) {
                $root_dir = getProjectRoot();
            }
            
            // Si les fonctions helpers retournent null ou vide, utiliser des valeurs par défaut
            if (empty($version_dir) || !is_string($version_dir)) {
                $version_dir = 'fw_ott_v' . str_replace('.', '_', $firmware_version);
                error_log('[handleGetFirmwares] ⚠️ Version dir invalide, utilisation valeur par défaut: ' . $version_dir);
            }
            if (empty($root_dir) || !is_string($root_dir)) {
                $root_dir = dirname(__DIR__, 3); // Remonter depuis api/handlers/firmwares/
                error_log('[handleGetFirmwares] ⚠️ Project root invalide, utilisation valeur par défaut: ' . $root_dir);
            }
            
            // Déterminer quel type de fichier chercher selon le statut
            if ($firmware_status === 'compiled') {
                // Si compilé, chercher le .bin
                $file_type = 'bin';
                $bin_filename = 'fw_ott_v' . $firmware_version . '.bin';
                $bin_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
                $bin_path = $bin_dir . $bin_filename;
                
                $test_paths = [
                    $bin_path,
                    'hardware/firmware/' . $version_dir . '/' . $bin_filename,
                    $root_dir . '/hardware/firmware/' . $version_dir . '/' . $bin_filename,
                ];
                
                // Aussi vérifier le file_path en DB s'il pointe vers un .bin
                if (!empty($firmware['file_path']) && preg_match('/\.bin$/', $firmware['file_path'])) {
                    $test_paths[] = $firmware['file_path'];
                    $test_paths[] = $root_dir . '/' . $firmware['file_path'];
                }
            } else {
                // Si pas compilé, chercher le .ino avec l'ID
                $file_type = 'ino';
                $ino_filename = 'fw_ott_v' . $firmware_version . '_id' . $firmware_id . '.ino';
                $ino_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
                $ino_path = $ino_dir . $ino_filename;
                
                $test_paths = [
                    $ino_path,
                    'hardware/firmware/' . $version_dir . '/' . $ino_filename,
                    $root_dir . '/hardware/firmware/' . $version_dir . '/' . $ino_filename,
                ];
                
                // Aussi vérifier le file_path en DB s'il pointe vers un .ino
                if (!empty($firmware['file_path']) && preg_match('/\.ino$/', $firmware['file_path'])) {
                    $test_paths[] = $firmware['file_path'];
                    $test_paths[] = $root_dir . '/' . $firmware['file_path'];
                }
            }
            
            // Tester chaque chemin
            foreach ($test_paths as $test_path) {
                if (file_exists($test_path) && is_file($test_path)) {
                    $file_exists = true;
                    $file_path_absolute = $test_path;
                    $file_size_actual = filesize($test_path);
                    
                    // Log pour diagnostic
                    if (getenv('DEBUG_ERRORS') === 'true') {
                        error_log('[handleGetFirmwares] ✅ Fichier ' . $file_type . ' trouvé: ' . $test_path . ' (size: ' . $file_size_actual . ')');
                    }
                    break;
                }
            }
            
            if (!$file_exists) {
                // Log pour diagnostic
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[handleGetFirmwares] ❌ Fichier ' . $file_type . ' NON trouvé pour firmware ID ' . $firmware_id);
                    error_log('[handleGetFirmwares]   Statut: ' . $firmware_status);
                    error_log('[handleGetFirmwares]   Chemins testés: ' . json_encode($test_paths));
                }
            }
            
            // Ajouter les informations de vérification au firmware
            $firmware['file_exists'] = $file_exists;
            $firmware['file_path_absolute'] = $file_path_absolute;
            $firmware['file_type'] = $file_type; // 'ino' ou 'bin'
            $file_size_actual = $file_size_actual ?? null;
            if ($file_size_actual !== null) {
                $firmware['file_size_actual'] = $file_size_actual;
                // Vérifier si la taille correspond à celle en base
                if ($firmware['file_size'] != $file_size_actual) {
                    $firmware['file_size_mismatch'] = true;
                    if (getenv('DEBUG_ERRORS') === 'true') {
                        error_log('[handleGetFirmwares] ⚠️ Taille fichier différente: DB=' . $firmware['file_size'] . ', FS=' . $file_size_actual);
                    }
                }
            }
            
            $verifiedFirmwares[] = $firmware;
        }
        
        // Log récapitulatif
        $total = count($verifiedFirmwares);
        $existing = count(array_filter($verifiedFirmwares, fn($f) => $f['file_exists']));
        $missing = $total - $existing;
        
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleGetFirmwares] 📊 Récapitulatif: ' . $total . ' firmwares, ' . $existing . ' fichiers existants, ' . $missing . ' fichiers manquants');
        }
        
        // IMPORTANT: S'assurer que le Content-Type est JSON avant d'encoder
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        // Encoder en JSON avec gestion d'erreur
        $json = json_encode([
            'success' => true, 
            'firmwares' => $verifiedFirmwares,
            'stats' => [
                'total' => $total,
                'files_existing' => $existing,
                'files_missing' => $missing
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
        if ($json === false) {
            $error = json_last_error_msg();
            error_log('[handleGetFirmwares] ❌ Erreur encodage JSON: ' . $error);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Erreur lors de l\'encodage de la réponse JSON: ' . $error
            ]);
            return;
        }
        
        echo $json;
    } catch(PDOException $e) {
        error_log('[handleGetFirmwares] ❌ Erreur DB: ' . $e->getMessage());
        error_log('[handleGetFirmwares] Stack trace: ' . $e->getTraceAsString());
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        error_log('[handleGetFirmwares] ❌ Erreur inattendue: ' . $e->getMessage());
        error_log('[handleGetFirmwares] Stack trace: ' . $e->getTraceAsString());
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Internal server error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleCheckFirmwareVersion($version) {
    global $pdo;
    requireAuth();
    
    // Décoder la version (au cas où elle serait encodée)
    $version = urldecode($version);
    
    try {
        $stmt = $pdo->prepare("SELECT id, version, file_path, created_at, status FROM firmware_versions WHERE version = :version");
        $stmt->execute(['version' => $version]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            echo json_encode([
                'success' => true,
                'exists' => true,
                'firmware' => $existing
            ]);
        } else {
            echo json_encode([
                'success' => true,
                'exists' => false
            ]);
        }
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleDeleteFirmware($firmware_id) {
    global $pdo;
    requirePermission('firmwares.manage');
    
    try {
        // Récupérer les infos du firmware avant suppression (inclure ino_content et bin_content)
        $stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware introuvable']);
            return;
        }
        
        $firmware_status = $firmware['status'] ?? 'unknown';
        $version_dir = getVersionDir($firmware['version']);
        $root_dir = getProjectRoot();
        
        // Supprimer les fichiers selon le statut
        if ($firmware_status === 'compiled') {
            // Si compilé, supprimer le .bin mais GARDER le .ino et l'entrée DB
            // Cela permet de recompiler plus tard
            $bin_filename = 'fw_ott_v' . $firmware['version'] . '.bin';
            $bin_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
            $bin_path = $bin_dir . $bin_filename;
            
            if (file_exists($bin_path)) {
                @unlink($bin_path);
                error_log('[handleDeleteFirmware] ✅ Fichier .bin supprimé: ' . basename($bin_path));
            }
            
            // Remettre le statut à 'pending_compilation' pour permettre la recompilation
            $pdo->prepare("
                UPDATE firmware_versions 
                SET status = 'pending_compilation', 
                    file_path = NULL,
                    file_size = NULL,
                    checksum = NULL
                WHERE id = :id
            ")->execute(['id' => $firmware_id]);
            
            auditLog('firmware.bin.deleted', 'firmware', $firmware_id, $firmware, ['action' => 'bin_deleted_kept_ino']);
            
            echo json_encode([
                'success' => true,
                'message' => 'Fichier .bin supprimé. Le firmware .ino est conservé et peut être recompilé.',
                'deleted_version' => $firmware['version']
            ]);
        } else {
            // Si pas compilé, supprimer le .ino ET l'entrée DB (suppression complète)
            $ino_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
            if (is_dir($ino_dir)) {
                // Supprimer UNIQUEMENT le fichier avec l'ID (format obligatoire)
                $pattern_with_id = 'fw_ott_v' . $firmware['version'] . '_id' . $firmware_id . '.ino';
                $ino_file_with_id = $ino_dir . $pattern_with_id;
                if (file_exists($ino_file_with_id)) {
                    @unlink($ino_file_with_id);
                    error_log('[handleDeleteFirmware] ✅ Fichier .ino supprimé: ' . basename($ino_file_with_id));
                }
            }
            
            // Supprimer de la base de données
            $deleteStmt = $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id");
            $deleteStmt->execute(['id' => $firmware_id]);
            
            auditLog('firmware.deleted', 'firmware', $firmware_id, $firmware, null);
            
            echo json_encode([
                'success' => true,
                'message' => 'Firmware supprimé avec succès',
                'deleted_version' => $firmware['version']
            ]);
        }
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleDeleteFirmware] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

