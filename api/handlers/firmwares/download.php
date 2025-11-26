<?php
/**
 * Firmware Download Operations
 * Download firmware .bin and get .ino content
 */

function handleDownloadFirmware($firmware_id) {
    global $pdo;
    requireAuth();
    
    try {
        // Inclure ino_content et bin_content pour stockage DB
        $stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware not found']);
            return;
        }
        
        // NOUVEAU: Priorité 1 - Lire depuis la DB (BYTEA)
        if (!empty($firmware['bin_content'])) {
            // PDO retourne les BYTEA comme chaînes binaires brutes (déjà décodées automatiquement)
            // Pas besoin de pg_unescape_bytea() avec PDO
            $bin_content = $firmware['bin_content'];
            
            // Convertir en chaîne si c'est une ressource (stream)
            if (is_resource($bin_content)) {
                $bin_content = stream_get_contents($bin_content);
            }
            
            // Vérifier que le contenu est valide
            if (!is_string($bin_content)) {
                error_log('[handleDownloadFirmware] ❌ bin_content n\'est pas une chaîne (type: ' . gettype($firmware['bin_content']) . ')');
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Format de données invalide']);
                return;
            }
            
            $file_size = strlen($bin_content);
            error_log('[handleDownloadFirmware] ✅ Fichier lu depuis DB (BYTEA), taille: ' . $file_size);
            
            // Envoyer le fichier depuis la DB
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="fw_ott_v' . $firmware['version'] . '.bin"');
            header('Content-Length: ' . $file_size);
            header('Cache-Control: no-cache, must-revalidate');
            header('Pragma: no-cache');
            
            echo $bin_content;
            exit;
        }
        
        // Fallback: Lire depuis le système de fichiers
        $root_dir = getProjectRoot();
        $file_path = $root_dir . '/' . $firmware['file_path'];
        
        if (!file_exists($file_path)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware file not found on server']);
            return;
        }
        
        error_log('[handleDownloadFirmware] ✅ Fichier lu depuis système de fichiers');
        
        // Envoyer le fichier
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="fw_ott_v' . $firmware['version'] . '.bin"');
        header('Content-Length: ' . filesize($file_path));
        header('Cache-Control: no-cache, must-revalidate');
        header('Pragma: no-cache');
        
        readfile($file_path);
        exit;
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    } catch(Exception $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Internal server error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleGetFirmwareIno($firmware_id) {
    global $pdo;
    
    // Log de debug
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleGetFirmwareIno] Appelé avec firmware_id: ' . $firmware_id);
    }
    
    requireAuth();
    
    try {
        // Inclure ino_content et bin_content pour stockage DB
        $stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Stocker firmware_id pour utilisation dans la recherche de fichier
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware introuvable']);
            return;
        }
        
        // NOUVEAU: Priorité 1 - Lire depuis la DB (BYTEA)
        if (!empty($firmware['ino_content'])) {
            // PDO retourne les BYTEA comme chaînes binaires brutes (déjà décodées automatiquement)
            // Pas besoin de pg_unescape_bytea() avec PDO
            $ino_content = $firmware['ino_content'];
            
            // Convertir en chaîne si c'est une ressource (stream)
            if (is_resource($ino_content)) {
                $ino_content = stream_get_contents($ino_content);
            }
            
            // Vérifier que le contenu est valide
            if (!is_string($ino_content)) {
                error_log('[handleGetFirmwareIno] ❌ ino_content n\'est pas une chaîne (type: ' . gettype($firmware['ino_content']) . ')');
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Format de données invalide']);
                return;
            }
            
            error_log('[handleGetFirmwareIno] ✅ Fichier lu depuis DB (BYTEA), taille: ' . strlen($ino_content) . ' bytes');
        } else {
            // Fallback: Lire depuis le système de fichiers
            $ino_path = findFirmwareInoFile($firmware_id, $firmware);
            
            if (!$ino_path || !file_exists($ino_path)) {
                // Diagnostic simple - utiliser le même chemin que findFirmwareInoFile() pour cohérence
                $root_dir = getProjectRoot();
                $absolute_path = !empty($firmware['file_path']) ? $root_dir . '/' . $firmware['file_path'] : null;
                $parent_dir = $absolute_path ? dirname($absolute_path) : null;
                $dir_exists = $parent_dir && is_dir($parent_dir);
                
                error_log('[handleGetFirmwareIno] ❌ Fichier introuvable');
                error_log('[handleGetFirmwareIno]    file_path DB: ' . ($firmware['file_path'] ?? 'N/A'));
                error_log('[handleGetFirmwareIno]    Chemin absolu: ' . ($absolute_path ?? 'N/A'));
                error_log('[handleGetFirmwareIno]    Dossier parent existe: ' . ($dir_exists ? 'OUI' : 'NON'));
                error_log('[handleGetFirmwareIno]    Stocké en DB: NON');
                
                if ($dir_exists) {
                    $files_in_dir = glob($parent_dir . '/*.ino');
                    error_log('[handleGetFirmwareIno]    Fichiers .ino dans le dossier: ' . count($files_in_dir));
                }
                
                http_response_code(404);
                $error_msg = 'Fichier .ino introuvable: ' . ($firmware['file_path'] ?? 'N/A');
                if (getenv('DEBUG_ERRORS') === 'true') {
                    $error_msg .= ' (Version: ' . $firmware['version'] . ', ID: ' . $firmware_id . ')';
                }
                echo json_encode(['success' => false, 'error' => $error_msg]);
                return;
            }
            
            $ino_content = file_get_contents($ino_path);
            if ($ino_content === false) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Impossible de lire le fichier .ino']);
                return;
            }
            error_log('[handleGetFirmwareIno] ✅ Fichier lu depuis système de fichiers');
        }
        
        // Vérifier que le contenu est valide avant l'encodage JSON
        if (!isset($ino_content) || !is_string($ino_content)) {
            error_log('[handleGetFirmwareIno] ❌ Contenu invalide (type: ' . (isset($ino_content) ? gettype($ino_content) : 'non défini') . ')');
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Contenu du fichier invalide']);
            return;
        }
        
        // Encoder la réponse JSON
        $response = [
            'success' => true,
            'content' => $ino_content,
            'version' => $firmware['version'],
            'file_path' => $firmware['file_path'],
            'status' => $firmware['status']
        ];
        
        $json_response = json_encode($response);
        if ($json_response === false) {
            $json_error = json_last_error_msg();
            error_log('[handleGetFirmwareIno] ❌ Erreur encodage JSON: ' . $json_error);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Erreur lors de l\'encodage de la réponse: ' . $json_error]);
            return;
        }
        
        echo $json_response;
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetFirmwareIno] PDOException: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur serveur';
        error_log('[handleGetFirmwareIno] Exception: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}
