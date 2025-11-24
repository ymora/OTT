    if ($user['role_name'] !== 'admin' && $user['role_name'] !== 'technicien') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin ou technicien requis.']);
        return;
    }
    
    try {
        // Récupérer le body JSON
        $body = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($body['content']) || empty($body['content'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Contenu du fichier .ino manquant']);
            return;
        }
        
        $ino_content = $body['content'];
        
        // Vérifier la version dans le contenu
        $version = null;
        if (preg_match('/FIRMWARE_VERSION_STR\s+"([^"]+)"/', $ino_content, $matches)) {
            $version = $matches[1];
        } else if (preg_match('/FIRMWARE_VERSION\s*=\s*"([^"]+)"/', $ino_content, $matches)) {
            $version = $matches[1];
        }
        
        if (!$version) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.']);
            return;
        }
        
        // Récupérer le firmware existant
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware introuvable']);
            return;
        }
        
        // Vérifier que la version n'a pas changé (ou la mettre à jour si elle a changé)
        if ($firmware['version'] !== $version) {
            // Vérifier si la nouvelle version existe déjà
            $checkStmt = $pdo->prepare("SELECT id FROM firmware_versions WHERE version = :version AND id != :id");
            $checkStmt->execute(['version' => $version, 'id' => $firmware_id]);
            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'La version ' . $version . ' existe déjà']);
                return;
            }
        }
        
        // Trouver le chemin du fichier .ino
        // Utiliser la nouvelle version si elle a changé
        $target_version = $version;
        
        // D'abord, chercher le fichier .ino existant (peut être avec l'ancienne version)
        $ino_path = null;
        
        // Vérifier le file_path original s'il existe et est un .ino
        if (!empty($firmware['file_path']) && preg_match('/\.ino$/', $firmware['file_path'])) {
            $test_path = $firmware['file_path'];
            if (!file_exists($test_path)) {
                $test_path = __DIR__ . '/' . $firmware['file_path'];
            }
            if (file_exists($test_path) && preg_match('/\.ino$/', $test_path)) {
                $ino_path = $test_path;
            }
        }
        
        // Si pas trouvé, chercher dans le dossier de l'ancienne version avec l'ID
        if (!$ino_path) {
            $old_version_dir = getVersionDir($firmware['version']);
            $old_ino_dir = __DIR__ . '/hardware/firmware/' . $old_version_dir . '/';
            if (is_dir($old_ino_dir)) {
                // Chercher UNIQUEMENT avec l'ID (format obligatoire)
                $pattern_with_id = 'fw_ott_v' . $firmware['version'] . '_id' . $firmware_id . '.ino';
                $old_ino_path_with_id = $old_ino_dir . $pattern_with_id;
                if (file_exists($old_ino_path_with_id)) {
                    $ino_path = $old_ino_path_with_id;
                    error_log('[handleUpdateFirmwareIno] ✅ Fichier trouvé dans ancienne version avec ID: ' . basename($ino_path));
                }
            }
        }
        
        // Si la version a changé ou si pas de fichier trouvé, créer/utiliser le dossier de la nouvelle version
        $version_dir = getVersionDir($target_version);
        $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
        
        if (!is_dir($ino_dir)) {
            mkdir($ino_dir, 0755, true);
        }
        
        // Si la version a changé ou si pas de fichier trouvé, utiliser le nouveau dossier
        if ($firmware['version'] !== $target_version || !$ino_path) {
            // Chercher UNIQUEMENT le fichier avec l'ID exact (format obligatoire)
            $pattern_with_id = 'fw_ott_v' . $target_version . '_id' . $firmware_id . '.ino';
            $ino_path_with_id = $ino_dir . $pattern_with_id;
            
            if (file_exists($ino_path_with_id)) {
                $ino_path = $ino_path_with_id;
                error_log('[handleUpdateFirmwareIno] ✅ Fichier trouvé avec ID: ' . basename($ino_path));
            } else {
                // Créer un nouveau fichier dans le nouveau dossier avec l'ID (format obligatoire)
                $ino_filename = 'fw_ott_v' . $target_version . '_id' . $firmware_id . '.ino';
                $ino_path = $ino_dir . $ino_filename;
                error_log('[handleUpdateFirmwareIno] Nouveau fichier créé avec ID: ' . $ino_filename);
            }
        }
        
        // Sauvegarder le contenu
        if (file_put_contents($ino_path, $ino_content) === false) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible d\'enregistrer le fichier .ino']);
            return;
        }
        
        // Mettre à jour la base de données
        $file_size = filesize($ino_path);
        $checksum = hash_file('sha256', $ino_path);
        
        // Calculer le chemin relatif
        $relative_path = str_replace(__DIR__ . '/', '', $ino_path);
        // Normaliser les séparateurs pour la base de données
        $relative_path = str_replace('\\', '/', $relative_path);
        
        $updateStmt = $pdo->prepare("
            UPDATE firmware_versions 
            SET version = :version,
                file_path = :file_path,
                file_size = :file_size,
                checksum = :checksum,
                status = 'pending_compilation'
            WHERE id = :id
        ");
        $updateStmt->execute([
            'version' => $target_version,
            'file_path' => $relative_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'id' => $firmware_id
        ]);
        
        auditLog('firmware.ino.updated', 'firmware', $firmware_id, $firmware, [
            'version' => $version,
            'file_size' => $file_size
        ]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Fichier .ino mis à jour avec succès',
            'version' => $target_version,
            'firmware_id' => $firmware_id
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleUpdateFirmwareIno] Error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function extractVersionFromBin($bin_path) {
    // Tente d'extraire la version depuis le fichier .bin
    // Cherche la section .version avec OTT_FW_VERSION=
    $data = file_get_contents($bin_path);
    if ($data === false) {
        return null;
    }
    
    // Méthode 1: Chercher OTT_FW_VERSION=<version>
    if (preg_match('/OTT_FW_VERSION=([^\x00]+)/', $data, $matches)) {
        return trim($matches[1]);
    }
    
    // Méthode 2: Chercher des patterns de version (X.Y ou X.Y-Z)
    if (preg_match('/(\d+\.\d+[-\w]*)/', $data, $matches)) {
        $version = trim($matches[1]);
        if (preg_match('/^\d+\.\d+/', $version)) {
            return $version;
        }
    }
    
    return null;
}

function handleUploadFirmware() {
    global $pdo;
    $user = requireAdmin();
    
    if (!isset($_FILES['firmware'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No file uploaded']);
        return;
    }
    
    $file = $_FILES['firmware'];
    $version = $_POST['version'] ?? '';
    $release_notes = $_POST['release_notes'] ?? '';
    $is_stable = isset($_POST['is_stable']) && $_POST['is_stable'] === 'true';
    
    if (pathinfo($file['name'], PATHINFO_EXTENSION) !== 'bin') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid file type: .bin required']);
        return;
    }
    
    // Sauvegarder temporairement pour extraire la version
    $tmp_path = $file['tmp_name'];
    
    // Si version non fournie, tenter de l'extraire depuis le .bin
    if (empty($version)) {
        $extracted_version = extractVersionFromBin($tmp_path);
        if ($extracted_version) {
            $version = $extracted_version;
        } else {
            http_response_code(400);
            echo json_encode([
                'success' => false, 
                'error' => 'Version not found in binary and not provided. Please provide version or ensure firmware contains OTT_FW_VERSION section.'
            ]);
            return;
        }
    }
    
    $version_dir = getVersionDir($version);
    $upload_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
    
    $file_path = 'hardware/firmware/' . $version_dir . '/fw_ott_v' . $version . '.bin';
    $full_path = __DIR__ . '/' . $file_path;
    
    if (!move_uploaded_file($tmp_path, $full_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save file']);
        return;
    }
    
    // Calculer MD5 pour validation OTA (en plus du SHA256)
    $md5 = hash_file('md5', $full_path);
    $checksum = hash_file('sha256', $full_path);
    $file_size = filesize($full_path);
    
    try {
        $pdo->prepare("
            INSERT INTO firmware_versions (version, file_path, file_size, checksum, release_notes, is_stable, uploaded_by)
            VALUES (:version, :file_path, :file_size, :checksum, :release_notes, :is_stable, :uploaded_by)
        ")->execute([
            'version' => $version,
            'file_path' => $file_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'release_notes' => $release_notes,
            'is_stable' => $is_stable ? 1 : 0,
            'uploaded_by' => $user['id']
        ]);
        
        $firmware_id = $pdo->lastInsertId();
        auditLog('firmware.uploaded', 'firmware', $firmware_id, null, [
            'version' => $version, 
            'file_size' => $file_size,
            'extracted_from_bin' => empty($_POST['version'])
        ]);
        
        echo json_encode([
            'success' => true, 
            'firmware_id' => $firmware_id, 
            'version' => $version,
            'checksum' => $checksum,
            'md5' => $md5,
            'extracted_from_bin' => empty($_POST['version'])
        ]);
        
    } catch(PDOException $e) {
        unlink($full_path);
        http_response_code($e->getCode() == 23000 ? 409 : 500);
        echo json_encode(['success' => false, 'error' => $e->getCode() == 23000 ? 'Version exists' : 'Database error']);
    }
}

function handleDownloadFirmware($firmware_id) {
    global $pdo;
    requireAuth();
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch();
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware not found']);
            return;
        }
        
        $file_path = __DIR__ . '/' . $firmware['file_path'];
        
        if (!file_exists($file_path)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware file not found on server']);
            return;
        }
        
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
    }
}

function handleUploadFirmwareIno() {
    global $pdo;
    
    // Log de debug
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleUploadFirmwareIno] Début - Method: ' . $_SERVER['REQUEST_METHOD']);
        error_log('[handleUploadFirmwareIno] FILES: ' . json_encode(array_keys($_FILES)));
    }
    
    // Définir Content-Type JSON immédiatement (AVANT requireAuth qui peut exit())
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    
    // Authentification (requireAuth peut exit() directement)
    $user = requireAuth();
    
    // Vérifier que l'utilisateur est admin ou technicien
    if ($user['role_name'] !== 'admin' && $user['role_name'] !== 'technicien') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin ou technicien requis.']);
        return;
    }
    
    // Vérifier que le fichier est présent (AVANT tout traitement)
    if (!isset($_FILES['firmware_ino'])) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] ❌ Fichier non reçu');
            error_log('[handleUploadFirmwareIno] FILES: ' . json_encode($_FILES));
            error_log('[handleUploadFirmwareIno] POST: ' . json_encode($_POST));
            error_log('[handleUploadFirmwareIno] CONTENT_TYPE: ' . ($_SERVER['CONTENT_TYPE'] ?? 'not set'));
        }
        http_response_code(400);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false, 
            'error' => 'No file uploaded',
            'debug' => [
                'files_keys' => array_keys($_FILES),
                'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'not set',
                'method' => $_SERVER['REQUEST_METHOD'] ?? 'not set'
            ]
        ]);
        return;
    }
    
    $file = $_FILES['firmware_ino'];
    
    // Vérifier les erreurs d'upload PHP
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'Fichier trop volumineux (php.ini)',
            UPLOAD_ERR_FORM_SIZE => 'Fichier trop volumineux (formulaire)',
            UPLOAD_ERR_PARTIAL => 'Upload partiel',
            UPLOAD_ERR_NO_FILE => 'Aucun fichier',
            UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant',
            UPLOAD_ERR_CANT_WRITE => 'Erreur d\'écriture',
            UPLOAD_ERR_EXTENSION => 'Extension bloquée'
        ];
        $errorMsg = $errorMessages[$file['error']] ?? 'Erreur inconnue: ' . $file['error'];
        
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] ❌ Erreur upload PHP: ' . $errorMsg);
        }
        
        http_response_code(400);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => $errorMsg]);
        return;
    }
    
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleUploadFirmwareIno] ✅ Fichier reçu: ' . $file['name'] . ' (' . $file['size'] . ' bytes)');
    }
    
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[handleUploadFirmwareIno] File received: ' . $file['name'] . ' (' . $file['size'] . ' bytes)');
    }
    
    if (pathinfo($file['name'], PATHINFO_EXTENSION) !== 'ino') {
        http_response_code(400);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Invalid file type: .ino required']);
        return;
    }
    
    // Extraire la version depuis le fichier .ino (AVANT de créer le dossier)
    if (!file_exists($file['tmp_name'])) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] Fichier temporaire introuvable: ' . $file['tmp_name']);
        }
        http_response_code(500);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Fichier temporaire introuvable']);
        return;
    }
    
    $ino_content = file_get_contents($file['tmp_name']);
    if ($ino_content === false) {
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] Impossible de lire le fichier temporaire');
        }
        http_response_code(500);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'Impossible de lire le fichier']);
        return;
    }
    
    $version = null;
    
    // Chercher FIRMWARE_VERSION_STR dans le fichier
    if (preg_match('/FIRMWARE_VERSION_STR\s+"([^"]+)"/', $ino_content, $matches)) {
        $version = $matches[1];
    } else if (preg_match('/FIRMWARE_VERSION\s*=\s*"([^"]+)"/', $ino_content, $matches)) {
        $version = $matches[1];
    }
    
    if (!$version) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.']);
        return;
    }
    
    // Vérifier si la version existe déjà
    $existingStmt = $pdo->prepare("SELECT id, version, file_path, created_at FROM firmware_versions WHERE version = :version");
    $existingStmt->execute(['version' => $version]);
    $existingFirmware = $existingStmt->fetch();
    
    if ($existingFirmware) {
        // Version existe déjà - retourner l'info pour afficher le modal
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'error' => 'Cette version de firmware existe déjà',
            'existing_firmware' => [
                'id' => $existingFirmware['id'],
                'version' => $existingFirmware['version'],
                'file_path' => $existingFirmware['file_path'],
                'created_at' => $existingFirmware['created_at']
            ]
        ]);
        return;
    }
    
    // Créer le dossier pour les fichiers .ino uploadés (par version) - APRÈS extraction de la version
    $version_dir = getVersionDir($version);
    $ino_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
    if (!is_dir($ino_dir)) {
        if (!mkdir($ino_dir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible de créer le dossier de destination']);
            return;
        }
    }
    
    // Sauvegarder temporairement le fichier .ino (avant insertion en DB pour obtenir l'ID)
    $temp_filename = 'temp_' . uniqid() . '.ino';
    $temp_path = $ino_dir . $temp_filename;
    
    if (!move_uploaded_file($file['tmp_name'], $temp_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to save .ino file']);
        return;
    }
    
    // Vérifier que le fichier temporaire a bien été créé
    if (!file_exists($temp_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Fichier .ino non trouvé après upload']);
        return;
    }
    
    // Enregistrer dans la base de données (statut: pending_compilation) avec un chemin temporaire
    try {
        $file_size = filesize($temp_path);
        $checksum = hash_file('sha256', $temp_path);
        
        // Utiliser RETURNING pour PostgreSQL (plus fiable que lastInsertId)
        $stmt = $pdo->prepare("
            INSERT INTO firmware_versions (version, file_path, file_size, checksum, release_notes, is_stable, uploaded_by, status)
            VALUES (:version, :file_path, :file_size, :checksum, :release_notes, :is_stable, :uploaded_by, 'pending_compilation')
            RETURNING id
        ");
        
        // Chemin temporaire pour l'insertion initiale
        $temp_file_path = 'hardware/firmware/' . $version_dir . '/' . $temp_filename;
        
        $stmt->execute([
            'version' => $version,
            'file_path' => $temp_file_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'release_notes' => 'Compilé depuis .ino',
            'is_stable' => 0,
            'uploaded_by' => $user['id']
        ]);
        
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $firmware_id = $result['id'] ?? $pdo->lastInsertId();
        
        // Renommer le fichier avec l'ID pour garantir l'unicité et la retrouvabilité
        // Format: fw_ott_v{version}_id{firmware_id}.ino
        $ino_filename = 'fw_ott_v' . $version . '_id' . $firmware_id . '.ino';
        $ino_path = $ino_dir . $ino_filename;
        $final_file_path = 'hardware/firmware/' . $version_dir . '/' . $ino_filename;
        
        // Log pour diagnostic
        error_log('[handleUploadFirmwareIno] Renommage fichier:');
        error_log('   Firmware ID: ' . $firmware_id);
        error_log('   Version: ' . $version);
        error_log('   Nom temporaire: ' . $temp_filename);
        error_log('   Nom final: ' . $ino_filename);
        error_log('   Chemin final: ' . $final_file_path);
        
        if (!rename($temp_path, $ino_path)) {
            // Si le renommage échoue, nettoyer et retourner une erreur
            error_log('[handleUploadFirmwareIno] ❌ Échec renommage: ' . $temp_path . ' -> ' . $ino_path);
            @unlink($temp_path);
            // Supprimer l'entrée en DB
            $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id")->execute(['id' => $firmware_id]);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible de renommer le fichier .ino']);
            return;
        }
        
        // Vérifier que le fichier renommé existe bien
        if (!file_exists($ino_path)) {
            error_log('[handleUploadFirmwareIno] ❌ Fichier renommé introuvable: ' . $ino_path);
            // Supprimer l'entrée en DB
            $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id")->execute(['id' => $firmware_id]);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Fichier .ino introuvable après renommage']);
            return;
        }
        
        // Vérifier que le nom du fichier contient bien l'ID
        if (strpos($ino_filename, '_id' . $firmware_id . '.ino') === false) {
            error_log('[handleUploadFirmwareIno] ⚠️ Nom de fichier ne contient pas l\'ID: ' . $ino_filename);
        }
        
        error_log('[handleUploadFirmwareIno] ✅ Fichier renommé avec succès: ' . $ino_filename);
        
        // Mettre à jour le file_path dans la base de données avec le nom final
        $updateStmt = $pdo->prepare("UPDATE firmware_versions SET file_path = :file_path WHERE id = :id");
        $updateStmt->execute([
            'file_path' => $final_file_path,
            'id' => $firmware_id
        ]);
        
        // Vérifier que la mise à jour a réussi
        $verifyStmt = $pdo->prepare("SELECT file_path FROM firmware_versions WHERE id = :id");
        $verifyStmt->execute(['id' => $firmware_id]);
        $verify = $verifyStmt->fetch();
        if ($verify && $verify['file_path'] !== $final_file_path) {
            error_log('[handleUploadFirmwareIno] ⚠️ file_path en DB ne correspond pas: ' . $verify['file_path'] . ' != ' . $final_file_path);
        } else {
            error_log('[handleUploadFirmwareIno] ✅ file_path mis à jour en DB: ' . $final_file_path);
        }
        
        auditLog('firmware.ino.uploaded', 'firmware', $firmware_id, null, [
            'version' => $version,
            'file_size' => $file_size
        ]);
        
        // S'assurer que le Content-Type est JSON (si pas déjà défini pour SSE)
        if (!headers_sent() && !isset($GLOBALS['sse_mode'])) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        $response = [
            'success' => true,
            'firmware_id' => $firmware_id,
            'upload_id' => $firmware_id,
            'version' => $version,
            'message' => 'Fichier .ino uploadé avec succès. Prêt pour compilation.'
        ];
        
        echo json_encode($response);
        flush(); // Forcer l'envoi immédiat de la réponse
        
        // Log pour debug
        if (getenv('DEBUG_ERRORS') === 'true') {
            error_log('[handleUploadFirmwareIno] ✅ Upload réussi - Réponse: ' . json_encode($response));
        }
        
    } catch(PDOException $e) {
        if (isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        $errorMsg = 'Database error';
        if (getenv('DEBUG_ERRORS') === 'true') {
            $errorMsg = $e->getMessage();
            error_log('[handleUploadFirmwareIno] PDOException: ' . $e->getMessage());
        }
        
        if ($e->getCode() == 23000 || strpos($e->getMessage(), '23505') !== false || strpos($e->getMessage(), 'duplicate key') !== false) {
            http_response_code(409);
            $errorMsg = 'Cette version existe déjà';
        } else {
            http_response_code(500);
        }
        
        if (!headers_sent() && !isset($GLOBALS['sse_mode'])) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        if (isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        http_response_code(500);
        if (!headers_sent() && !isset($GLOBALS['sse_mode'])) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Erreur lors de l\'upload';
        error_log('[handleUploadFirmwareIno] Exception: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
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
            
            $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
            $stmt->execute(['id' => $firmware_id]);
            $firmware = $stmt->fetch();
            
            if (!$firmware) {
                sendSSE('error', 'Firmware not found');
                flush();
                return;
            }
            
            // Marquer immédiatement comme "compiling" dans la base de données
            // Cela permet de savoir que la compilation est en cours même si la connexion SSE se ferme
            // Permettre de compiler même si déjà compilé (pour recompiler)
            $pdo->prepare("UPDATE firmware_versions SET status = 'compiling' WHERE id = :id")->execute(['id' => $firmware_id]);
            
            // Note: On permet maintenant de compiler même si le statut est 'compiled' ou 'error'
            // pour permettre de relancer la compilation
            sendSSE('log', 'info', 'Démarrage de la compilation... (statut précédent: ' . ($firmware['status'] ?? 'unknown') . ')');
            flush();
            
            // Trouver le fichier .ino en utilisant la fonction helper simplifiée
            sendSSE('log', 'info', '🔍 Recherche du fichier .ino...');
            sendSSE('log', 'info', '   file_path DB: ' . ($firmware['file_path'] ?? 'N/A'));
            sendSSE('log', 'info', '   ID firmware: ' . $firmware_id);
            flush();
            
            $ino_path = findFirmwareInoFile($firmware_id, $firmware);
            
            if ($ino_path && file_exists($ino_path)) {
                sendSSE('log', 'info', '✅ Fichier trouvé: ' . basename($ino_path));
                sendSSE('log', 'info', '   Chemin: ' . $ino_path);
                flush();
            } else {
                // Message simple et clair (version simplifiée)
                $absolute_path = !empty($firmware['file_path']) ? __DIR__ . '/' . $firmware['file_path'] : null;
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
                try {
                    $errorMsg = 'Fichier .ino introuvable: ' . ($firmware['file_path'] ?? 'N/A') . ' (fichier n\'existe pas sur le serveur)';
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
                sendSSE('error', 'Fichier .ino introuvable. Le fichier n\'existe pas sur le serveur. Ré-uploader le fichier .ino.');
                flush();
                return;
            }
            
            sendSSE('log', 'info', 'Démarrage de la compilation...');
            sendSSE('progress', 10);
            flush();
            
            // Vérifier si arduino-cli est disponible
            // ⚠️ CRITIQUE: La compilation ne doit JAMAIS être simulée - soit OK, soit ÉCHEC
            $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            $arduinoCli = null;
            
            // 1. Chercher dans bin/ du projet (priorité absolue)
            $localArduinoCli = __DIR__ . '/bin/arduino-cli' . ($isWindows ? '.exe' : '');
            $localArduinoCliAlt = __DIR__ . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'arduino-cli' . ($isWindows ? '.exe' : '');
            
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
                
                // Créer un dossier temporaire pour la compilation
                $build_dir = sys_get_temp_dir() . '/ott_firmware_build_' . $firmware_id . '_' . time();
                mkdir($build_dir, 0755, true);
                
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
                $hardware_lib_dir = __DIR__ . '/hardware/lib';
                if (is_dir($hardware_lib_dir)) {
                    $lib_dirs = glob($hardware_lib_dir . '/TinyGSM*', GLOB_ONLYDIR);
                    if (!empty($lib_dirs)) {
                        // 1. Copier dans le dossier libraries à côté du sketch (pour cette compilation)
                        $libraries_dir = $sketch_dir . '/../libraries';
                        if (!is_dir($libraries_dir)) {
                            mkdir($libraries_dir, 0755, true);
                        }
                        
                        // 2. Copier aussi dans arduino-data/libraries (persistant, réutilisable)
                        $arduinoDataLibrariesDir = __DIR__ . '/arduino-data/libraries';
                        if (!is_dir($arduinoDataLibrariesDir)) {
                            mkdir($arduinoDataLibrariesDir, 0755, true);
                        }
                        
                        foreach ($lib_dirs as $lib_dir) {
                            $lib_name = basename($lib_dir);
                            
                            // Copier dans arduino-data/libraries (persistant, pour réutilisation) - une seule fois
                            $target_lib_dir_persistent = $arduinoDataLibrariesDir . '/' . $lib_name;
                            if (!is_dir($target_lib_dir_persistent)) {
                                copyRecursive($lib_dir, $target_lib_dir_persistent);
                                sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' installée dans arduino-data/libraries');
                            }
                            
                            // Créer un lien symbolique depuis le build vers la librairie persistante (plus rapide que copier)
                            // Si les liens symboliques ne fonctionnent pas, copier seulement si nécessaire
                            $target_lib_dir_build = $libraries_dir . '/' . $lib_name;
                            if (!is_dir($target_lib_dir_build) && !is_link($target_lib_dir_build)) {
                                // Essayer d'abord un lien symbolique (plus rapide)
                                if (!is_windows()) {
                                    if (symlink($target_lib_dir_persistent, $target_lib_dir_build)) {
                                        sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' liée dans le build');
                                    } else {
                                        // Fallback: copie si le lien symbolique échoue
                                        copyRecursive($lib_dir, $target_lib_dir_build);
                                        sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' copiée dans le build');
                                    }
                                } else {
                                    // Windows: copier directement (pas de liens symboliques fiables)
                                    copyRecursive($lib_dir, $target_lib_dir_build);
                                    sendSSE('log', 'info', '📚 Librairie ' . $lib_name . ' copiée dans le build');
                                }
                            }
                        }
                        flush();
                    }
                }
                
                // Utiliser le répertoire hardware/arduino-data du projet (versionné avec GitHub LFS)
                // Si le core est déjà dans le projet, on l'utilise directement (pas de téléchargement)
                $arduinoDataDir = __DIR__ . '/hardware/arduino-data';
                if (!is_dir($arduinoDataDir)) {
                    // Fallback: créer arduino-data/ à la racine si hardware/arduino-data/ n'existe pas
                    $arduinoDataDir = __DIR__ . '/arduino-data';
                    if (!is_dir($arduinoDataDir)) {
                        mkdir($arduinoDataDir, 0755, true);
                    }
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
                
                // Vérifier si le core ESP32 est déjà installé via arduino-cli core list
                // C'est la méthode la plus fiable car elle vérifie la base de données d'arduino-cli
                // La commande 'core list' retourne les cores installés, pas seulement téléchargés
                exec($envStr . $arduinoCli . ' core list 2>&1', $coreListOutput, $coreListReturn);
                $coreListStr = implode("\n", $coreListOutput);
                // Vérifier si le core ESP32 apparaît dans la liste (format: esp32:esp32 ou esp-rv32)
                $esp32Installed = strpos($coreListStr, 'esp32:esp32') !== false || strpos($coreListStr, 'esp-rv32') !== false;
                
                if ($esp32Installed) {
                    sendSSE('log', 'info', '✅ Core ESP32 déjà installé - prêt pour compilation');
                    sendSSE('log', 'info', '   Source: hardware/arduino-data/ (versionné avec le projet)');
                    sendSSE('progress', 50);
                } else {
                    // Vérifier si le core existe dans hardware/arduino-data/ mais n'est pas encore indexé
                    $corePath = $arduinoDataDir . '/packages/esp32/hardware/esp32';
                    if (is_dir($corePath)) {
                        sendSSE('log', 'info', '✅ Core ESP32 trouvé dans hardware/arduino-data/ (versionné)');
                        sendSSE('log', 'info', '   Le core est déjà dans le projet, pas besoin de téléchargement');
                        sendSSE('progress', 50);
                    } else {
                        sendSSE('log', 'info', 'Core ESP32 non installé, installation nécessaire...');
                        sendSSE('log', 'info', '⏳ Cette étape peut prendre plusieurs minutes (téléchargement ~430MB, une seule fois)...');
                        sendSSE('log', 'info', '   ⚠️ Après installation, ajoutez hardware/arduino-data/ à GitHub LFS');
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
                            
                            while (true) {
                                $status = proc_get_status($process);
                                $currentTime = time();
                                
                                // Lire stdout
                                $line = fgets($stdout);
                                if ($line !== false) {
                                    $line = trim($line);
                                    if (!empty($line)) {
                                        $installOutput[] = $line;
                                        sendSSE('log', 'info', $line);
                                        flush();
                                        $lastOutputTime = $currentTime;
                                    }
                                }
                                
                                // Lire stderr
                                $errLine = fgets($stderr);
                                if ($errLine !== false) {
                                    $errLine = trim($errLine);
                                    if (!empty($errLine)) {
                                        $installOutput[] = $errLine;
                                        sendSSE('log', 'info', $errLine);
                                        flush();
                                        $lastOutputTime = $currentTime;
                                    }
                                }
                                
                                // Vérifier si le processus est terminé
                                if ($status['running'] === false) {
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
                                
                                // Envoyer un keep-alive SSE toutes les 3 secondes pour maintenir la connexion active
                                // (Les commentaires SSE `: keep-alive` maintiennent la connexion ouverte)
                                if ($currentTime - $lastKeepAliveTime >= 3) {
                                    $lastKeepAliveTime = $currentTime;
                                    echo ": keep-alive\n\n";
                                    flush();
                                }
                                
                                // Envoyer un heartbeat avec message toutes les 5 secondes pour montrer que le système est vivant
                                if ($currentTime - $lastHeartbeatTime >= 5) {
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
                    $compile_output_lines = [];
                    
                    while (true) {
                        $compile_status = proc_get_status($compile_process);
                        
                        // Lire stdout
                        $line = fgets($compile_stdout);
                        if ($line !== false) {
                            $line = trim($line);
                            if (!empty($line)) {
                                $compile_output_lines[] = $line;
                                sendSSE('log', 'info', $line);
                                flush();
                            }
                        }
                        
                        // Lire stderr
                        $errLine = fgets($compile_stderr);
                        if ($errLine !== false) {
                            $errLine = trim($errLine);
                            if (!empty($errLine)) {
                                $compile_output_lines[] = $errLine;
                                sendSSE('log', 'info', $errLine);
                                flush();
                            }
                        }
                        
                        // Vérifier si le processus est terminé
                        if ($compile_status['running'] === false) {
                            break;
                        }
                        
                        // Envoyer un heartbeat toutes les 10 secondes pour maintenir la connexion SSE
                        $current_time = time();
                        if ($current_time - $compile_last_heartbeat >= 10) {
                            $compile_last_heartbeat = $current_time;
                            sendSSE('log', 'info', '⏳ Compilation en cours...');
                            flush();
                        }
                        
                        // Attendre un peu avant de relire
                        usleep(100000); // 100ms
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
                    exec('rm -rf ' . escapeshellarg($build_dir));
                    return;
                }
                
                $compiled_bin = $bin_files[0];
                $version_dir = getVersionDir($firmware['version']);
                $bin_dir = __DIR__ . '/hardware/firmware/' . $version_dir . '/';
                if (!is_dir($bin_dir)) mkdir($bin_dir, 0755, true);
                $bin_filename = 'fw_ott_v' . $firmware['version'] . '.bin';
                $bin_path = $bin_dir . $bin_filename;
                
                if (!copy($compiled_bin, $bin_path)) {
                    // Marquer le firmware comme erreur dans la base de données
                    try {
                        $pdo->prepare("
                            UPDATE firmware_versions 
                            SET status = 'error', error_message = 'Impossible de copier le fichier .bin compilé'
                            WHERE id = :id
                        ")->execute(['id' => $firmware_id]);
                    } catch(PDOException $dbErr) {
                        error_log('[handleCompileFirmware] Erreur DB: ' . $dbErr->getMessage());
                    }
                    sendSSE('error', 'Impossible de copier le fichier .bin compilé');
                    flush();
                    exec('rm -rf ' . escapeshellarg($build_dir));
                    return;
                }
                
                sendSSE('progress', 95);
                sendSSE('log', 'info', 'Calcul des checksums...');
                
                $md5 = hash_file('md5', $bin_path);
                $checksum = hash_file('sha256', $bin_path);
                $file_size = filesize($bin_path);
                
                // Mettre à jour la base de données
                $version_dir = getVersionDir($firmware['version']);
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET file_path = :file_path, 
                        file_size = :file_size, 
                        checksum = :checksum,
                        status = 'compiled'
                    WHERE id = :id
                ")->execute([
                    'file_path' => 'hardware/firmware/' . $version_dir . '/' . $bin_filename,
                    'file_size' => $file_size,
                    'checksum' => $checksum,
                    'id' => $firmware_id
                ]);
                
                // Nettoyer
                exec('rm -rf ' . escapeshellarg($build_dir));
                
                sendSSE('progress', 100);
                sendSSE('log', 'info', '✅ Compilation terminée avec succès !');
                sendSSE('success', 'Firmware v' . $firmware['version'] . ' compilé avec succès', $firmware['version']);
                
                // Fermer la connexion après un court délai pour permettre au client de recevoir les messages
                sleep(1);
            }
        } catch(PDOException $e) {
            // Erreur lors de la vérification du firmware
            sendSSE('error', 'Erreur base de données: ' . $e->getMessage());
            error_log('[handleCompileFirmware] Erreur DB: ' . $e->getMessage());
            flush();
            return;
        }
        
    } catch(Exception $e) {
        // Marquer le firmware comme erreur dans la base de données même si la connexion SSE est fermée
        if (isset($firmware_id)) {
            try {
                $pdo->prepare("
                    UPDATE firmware_versions 
                    SET status = 'error', error_message = :error
                    WHERE id = :id
                ")->execute([
                    'error' => 'Erreur: ' . $e->getMessage(),
                    'id' => $firmware_id
                ]);
            } catch(PDOException $dbErr) {
                error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
            }
        }
        } catch(PDOException $dbErr) {
            error_log('[handleCompileFirmware] Erreur DB lors de la mise à jour du statut: ' . $dbErr->getMessage());
        }
        sendSSE('error', 'Erreur: ' . $e->getMessage());
        error_log('[handleCompileFirmware] Exception: ' . $e->getMessage());
        flush();
        sleep(1);
    }
    
    // S'assurer que la sortie est vidée
    flush();
}

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

// ============================================================================
// HANDLERS - NOTIFICATIONS
// ============================================================================

function handleGetNotificationPreferences() {
    global $pdo;
    $user = requireAuth();
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user['id']]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            // Créer avec valeurs par défaut (toutes désactivées)
            $insertStmt = $pdo->prepare("
                INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled) 
                VALUES (:user_id, FALSE, FALSE, FALSE)
            ");
            $insertStmt->execute(['user_id' => $user['id']]);
            
            // Réexécuter le SELECT pour récupérer les préférences créées
            $stmt->execute(['user_id' => $user['id']]);
            $prefs = $stmt->fetch();
        }
        
        ob_end_clean();
        echo json_encode(['success' => true, 'preferences' => $prefs]);
    } catch(PDOException $e) {
        ob_end_clean();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleUpdateNotificationPreferences() {
    global $pdo;
    $user = requireAuth();
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        $user_id = $user['id'];
        
        // Vérifier/créer les préférences (avec SMS activé par défaut)
        $checkStmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $checkStmt->execute(['user_id' => $user_id]);
        if (!$checkStmt->fetch()) {
            // Créer avec valeurs par défaut (toutes désactivées)
            $insertStmt = $pdo->prepare("
                INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, push_enabled) 
                VALUES (:user_id, FALSE, FALSE, FALSE)
            ");
            $insertStmt->execute(['user_id' => $user_id]);
        }
        
        $updates = [];
        $params = ['user_id' => $user_id];
        
        $allowed = ['email_enabled', 'sms_enabled', 'push_enabled', 'phone_number',
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow',
                    'notify_new_patient', 'quiet_hours_start', 'quiet_hours_end'];
        
        foreach ($allowed as $field) {
            if (isset($input[$field])) {
                $value = $input[$field];
                
                // Détecter les champs booléens
                $isBooleanField = in_array($field, ['email_enabled', 'sms_enabled', 'push_enabled', 
                    'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow', 'notify_new_patient']);
                
                if ($isBooleanField) {
                    // Convertir en booléen (gérer string "true"/"false", 0/1, chaîne vide, etc.)
                    $boolValue = false;
                    if (is_bool($value)) {
                        $boolValue = $value;
                    } elseif (is_string($value)) {
                        // Chaîne vide = false
                        if ($value === '') {
                            $boolValue = false;
                        } else {
                            $boolValue = in_array(strtolower(trim($value)), ['true', '1', 'yes', 'on']);
                        }
                    } elseif (is_numeric($value)) {
                        $boolValue = (int)$value !== 0;
                    }
                    // Pour PostgreSQL, utiliser TRUE/FALSE directement dans la requête
                    $updates[] = "$field = " . ($boolValue ? 'TRUE' : 'FALSE');
                } elseif ($value === null || $value === '') {
                    $updates[] = "$field = NULL";
                } else {
                    $updates[] = "$field = :$field";
                    $params[$field] = $value;
                }
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No fields to update']);
            return;
        }
        
        $sql = "UPDATE user_notifications_preferences SET " . implode(', ', $updates) . " WHERE user_id = :user_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log('[handleUpdateNotificationPreferences] Database error: ' . $e->getMessage());
        error_log('[handleUpdateNotificationPreferences] SQL: ' . ($sql ?? 'N/A'));
        error_log('[handleUpdateNotificationPreferences] Params: ' . json_encode($params ?? []));
        error_log('[handleUpdateNotificationPreferences] Input: ' . json_encode($input ?? []));
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleTestNotification() {
    global $pdo;
    requireAuth();
    
    $user = getCurrentUser();
    $input = json_decode(file_get_contents('php://input'), true);
    $type = $input['type'] ?? 'email';
    
    try {
        // Récupérer les préférences de l'utilisateur
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user['id']]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            echo json_encode(['success' => false, 'error' => 'Préférences non trouvées']);
            return;
        }
        
        $testMessage = "Ceci est un message de test depuis le dashboard OTT.";
        $testSubject = "Test notification OTT";
        
        if ($type === 'email') {
            if (!$prefs['email_enabled'] || !$user['email']) {
                echo json_encode(['success' => false, 'error' => 'Email non activé ou adresse manquante']);
                return;
            }
            $sent = sendEmail($user['email'], $testSubject, $testMessage);
            $result = $sent 
                ? ['success' => true, 'message' => 'Email test envoyé avec succès']
                : ['success' => false, 'error' => 'Erreur lors de l\'envoi de l\'email'];
        } elseif ($type === 'sms') {
            if (!$prefs['sms_enabled'] || !$prefs['phone_number']) {
                echo json_encode(['success' => false, 'error' => 'SMS non activé ou numéro manquant']);
                return;
            }
            $sent = sendSMS($prefs['phone_number'], $testMessage);
            $result = $sent 
                ? ['success' => true, 'message' => 'SMS test envoyé avec succès']
                : ['success' => false, 'error' => 'Erreur lors de l\'envoi du SMS'];
        } else {
            $result = ['success' => false, 'error' => 'Type invalide'];
        }
        
        echo json_encode($result);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleGetNotificationsQueue() {
    global $pdo;
    requirePermission('settings.view');
    
    try {
        $limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 500) : 50;
        
        $stmt = $pdo->prepare("
            SELECT nq.*, u.email, u.first_name, u.last_name, p.first_name as patient_first_name, p.last_name as patient_last_name
            FROM notifications_queue nq
            LEFT JOIN users u ON nq.user_id = u.id AND u.deleted_at IS NULL
            LEFT JOIN patients p ON nq.patient_id = p.id AND p.deleted_at IS NULL
            ORDER BY nq.created_at DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        
        echo json_encode(['success' => true, 'queue' => $stmt->fetchAll()]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function handleProcessNotificationsQueue() {
    global $pdo;
    requireAdmin(); // Seuls les admins peuvent déclencher le traitement manuellement
    
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $limit = isset($input['limit']) ? min(intval($input['limit']), 100) : 50;
        $result = processNotificationsQueue($pdo, $limit);
        echo json_encode(['success' => true, 'result' => $result]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleGetUserNotifications($user_id) {
    global $pdo;
    requirePermission('users.view');
    
    try {
        // Vérifier si la table user_notifications_preferences existe
        $hasNotificationsTable = false;
        try {
            // Utiliser helper pour vérifier la table
            $hasNotificationsTable = tableExists('user_notifications_preferences');
        } catch(PDOException $e) {
            $hasNotificationsTable = false;
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleGetUserNotifications] Table check failed: ' . $e->getMessage());
            }
        }
        
        if (!$hasNotificationsTable) {
            // Table n'existe pas encore, retourner des valeurs par défaut
            $defaultPrefs = [
                'user_id' => $user_id,
                'email_enabled' => false,
                'sms_enabled' => false,
                'push_enabled' => false,
                'phone_number' => null,
                'notify_battery_low' => false,
                'notify_device_offline' => false,
                'notify_abnormal_flow' => false,
                'notify_new_patient' => false,
                'quiet_hours_start' => null,
                'quiet_hours_end' => null,
                'created_at' => null,
                'updated_at' => null
            ];
            echo json_encode(['success' => true, 'preferences' => $defaultPrefs]);
            return;
        }
        
        $stmt = $pdo->prepare("SELECT * FROM user_notifications_preferences WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $user_id]);
        $prefs = $stmt->fetch();
        
        if (!$prefs) {
            // Créer des préférences par défaut avec valeurs explicites du schéma
            try {
                $pdo->prepare("
                    INSERT INTO user_notifications_preferences 
                    (user_id, email_enabled, sms_enabled, push_enabled, 
                     notify_battery_low, notify_device_offline, notify_abnormal_flow, notify_new_patient) 
                    VALUES (:user_id, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
                ")->execute(['user_id' => $user_id]);
                $stmt->execute(['user_id' => $user_id]);
                $prefs = $stmt->fetch();
            } catch(PDOException $e) {
                // Si l'insertion échoue (par exemple user n'existe pas), retourner des valeurs par défaut
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[handleGetUserNotifications] Insert failed: ' . $e->getMessage());
                }
                $defaultPrefs = [
                    'user_id' => $user_id,
                    'email_enabled' => false,
                    'sms_enabled' => false,
                    'push_enabled' => false,
                    'phone_number' => null,
                    'notify_battery_low' => false,
                    'notify_device_offline' => false,
                    'notify_abnormal_flow' => false,
                    'notify_new_patient' => false,
                    'quiet_hours_start' => null,
                    'quiet_hours_end' => null,
                    'created_at' => null,
                    'updated_at' => null
                ];
                echo json_encode(['success' => true, 'preferences' => $defaultPrefs]);
                return;
            }
        }
        
        echo json_encode(['success' => true, 'preferences' => $prefs]);
    } catch(PDOException $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Database error';
        error_log('[handleGetUserNotifications] Database error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}

function handleUpdateUserNotifications($user_id) {
    global $pdo;
    requirePermission('users.edit');
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    try {
        // Vérifier que l'utilisateur existe
        $stmt = $pdo->prepare("SELECT id FROM users WHERE id = :user_id");
        $stmt->execute(['user_id' => $user_id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'User not found']);
            return;
        }
        
        // Vérifier si la table existe (unifié avec handleUpdatePatientNotifications)
        $hasNotificationsTable = false;
        try {
            $checkStmt = $pdo->query("
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'user_notifications_preferences'
                )
            ");
            $result = $checkStmt->fetchColumn();
            $hasNotificationsTable = ($result === true || $result === 't' || $result === 1 || $result === '1');
        } catch(PDOException $e) {
            $hasNotificationsTable = false;
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[handleUpdateUserNotifications] Table check failed: ' . $e->getMessage());
            }
        }
        

