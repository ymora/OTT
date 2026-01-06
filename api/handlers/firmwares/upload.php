<?php
/**
 * Firmware Upload Operations
 * Upload firmware .bin, upload .ino, and update .ino operations
 */

function handleUpdateFirmwareIno($firmware_id) {
    global $pdo;
    
    // Vérifier que l'utilisateur est admin ou technicien
    $user = requireAuth();
    
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
        
        // Récupérer le firmware existant (inclure ino_content et bin_content pour stockage DB)
        $stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
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
        $root_dir = getProjectRoot();
        
        // D'abord, chercher le fichier .ino existant (peut être avec l'ancienne version)
        $ino_path = null;
        
        // Vérifier le file_path original s'il existe et est un .ino
        if (!empty($firmware['file_path']) && preg_match('/\.ino$/', $firmware['file_path'])) {
            $test_path = $firmware['file_path'];
            if (!file_exists($test_path)) {
                $test_path = $root_dir . '/' . $firmware['file_path'];
            }
            if (file_exists($test_path) && preg_match('/\.ino$/', $test_path)) {
                $ino_path = $test_path;
            }
        }
        
        // Si pas trouvé, chercher dans le dossier de l'ancienne version avec l'ID
        if (!$ino_path) {
            $old_version_dir = getVersionDir($firmware['version']);
            $old_ino_dir = $root_dir . '/hardware/firmware/' . $old_version_dir . '/';
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
        $ino_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
        
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
        $relative_path = str_replace($root_dir . '/', '', $ino_path);
        // Normaliser les séparateurs pour la base de données
        $relative_path = str_replace('\\', '/', $relative_path);
        
        // IMPORTANT: Encoder le contenu pour BYTEA avant la mise à jour
        $ino_content_encoded = encodeByteaForPostgres($ino_content);
        
        $updateStmt = $pdo->prepare("
            UPDATE firmware_versions 
            SET version = :version,
                file_path = :file_path,
                file_size = :file_size,
                checksum = :checksum,
                ino_content = :ino_content,
                status = 'pending_compilation'
            WHERE id = :id
        ");
        $updateStmt->execute([
            'version' => $target_version,
            'file_path' => $relative_path,
            'file_size' => $file_size,
            'checksum' => $checksum,
            'ino_content' => $ino_content_encoded,  // NOUVEAU: Mise à jour BYTEA
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
    } catch(Exception $e) {
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Internal server error';
        error_log('[handleUpdateFirmwareIno] Exception: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
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
    $root_dir = getProjectRoot();
    $upload_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
    
    $file_path = 'hardware/firmware/' . $version_dir . '/fw_ott_v' . $version . '.bin';
    $full_path = $root_dir . '/' . $file_path;
    
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
    } catch(Exception $e) {
        unlink($full_path);
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' ? $e->getMessage() : 'Internal server error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
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
    $root_dir = getProjectRoot();
    $ino_dir = $root_dir . '/hardware/firmware/' . $version_dir . '/';
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
    
    // Enregistrer dans la base de données (statut: pending_compilation)
    // NOUVEAU: Stocker le contenu directement dans PostgreSQL (BYTEA) pour éviter la perte lors des redéploiements
    try {
        $file_size = filesize($temp_path);
        $checksum = hash_file('sha256', $temp_path);
        
        // Lire le contenu du fichier pour stockage en DB
        $ino_content_db = file_get_contents($temp_path);
        
        // Utiliser RETURNING pour PostgreSQL (plus fiable que lastInsertId)
        // NOUVEAU: Ajouter ino_content pour stockage en DB
        $stmt = $pdo->prepare("
            INSERT INTO firmware_versions (version, file_path, file_size, checksum, release_notes, is_stable, uploaded_by, status, ino_content)
            VALUES (:version, :file_path, :file_size, :checksum, :release_notes, :is_stable, :uploaded_by, 'pending_compilation', :ino_content)
            RETURNING id
        ");
        
        // Chemin temporaire pour l'insertion initiale
        $temp_file_path = 'hardware/firmware/' . $version_dir . '/' . $temp_filename;
        
        // Vérifier que le contenu n'est pas vide
        if (empty($ino_content_db)) {
            error_log('[handleUploadFirmwareIno] ❌ Contenu du fichier vide');
            @unlink($temp_path);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Le fichier .ino est vide']);
            return;
        }
        
        // Vérifier la taille du contenu
        $content_size = strlen($ino_content_db);
        if ($content_size === 0) {
            error_log('[handleUploadFirmwareIno] ❌ Taille du contenu = 0');
            @unlink($temp_path);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Le contenu du fichier .ino est vide']);
            return;
        }
        
        error_log('[handleUploadFirmwareIno] Taille contenu à insérer: ' . $content_size . ' bytes');
        
        // IMPORTANT: PDO avec PostgreSQL nécessite un encodage spécifique pour BYTEA
        // Utiliser la fonction helper encodeByteaForPostgres() pour encoder correctement
        error_log('[handleUploadFirmwareIno] Encodage du contenu pour PostgreSQL...');
        $ino_content_encoded = encodeByteaForPostgres($ino_content_db);
        error_log('[handleUploadFirmwareIno] Contenu encodé, taille encodée: ' . strlen($ino_content_encoded) . ' bytes');
        
        try {
            error_log('[handleUploadFirmwareIno] Exécution INSERT avec les paramètres...');
            $stmt->execute([
                'version' => $version,
                'file_path' => $temp_file_path,
                'file_size' => $file_size,
                'checksum' => $checksum,
                'release_notes' => 'Compilé depuis .ino',
                'is_stable' => 0,
                'uploaded_by' => $user['id'],
                'ino_content' => $ino_content_encoded  // BYTEA encodé pour PostgreSQL
            ]);
            error_log('[handleUploadFirmwareIno] ✅ INSERT exécuté avec succès');
        } catch(PDOException $insertErr) {
            error_log('[handleUploadFirmwareIno] ❌ Erreur lors de l\'insertion: ' . $insertErr->getMessage());
            error_log('[handleUploadFirmwareIno] Code: ' . $insertErr->getCode());
            error_log('[handleUploadFirmwareIno] ErrorInfo: ' . json_encode($stmt->errorInfo() ?? []));
            @unlink($temp_path);
            http_response_code(500);
            $errorMsg = getenv('DEBUG_ERRORS') === 'true' 
                ? 'Erreur insertion DB: ' . $insertErr->getMessage() 
                : 'Erreur lors de l\'enregistrement en base de données';
            echo json_encode(['success' => false, 'error' => $errorMsg]);
            return;
        }
        
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $firmware_id = $result['id'] ?? $pdo->lastInsertId();
        
        if (!$firmware_id) {
            error_log('[handleUploadFirmwareIno] ❌ Aucun ID retourné après INSERT');
            @unlink($temp_path);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Erreur: Aucun ID retourné après insertion']);
            return;
        }
        
        error_log('[handleUploadFirmwareIno] ✅ Firmware ID obtenu: ' . $firmware_id);
        
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
            $deleteStmt = $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id");
            $deleteStmt->execute(['id' => $firmware_id]);
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Impossible de renommer le fichier .ino']);
            return;
        }
        
        // Vérifier que le fichier renommé existe bien
        if (!file_exists($ino_path)) {
            error_log('[handleUploadFirmwareIno] ❌ Fichier renommé introuvable: ' . $ino_path);
            // Supprimer l'entrée en DB
            $deleteStmt = $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id");
            $deleteStmt->execute(['id' => $firmware_id]);
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
            'file_path' => $final_file_path,
            'message' => 'Fichier .ino uploadé avec succès. Prêt pour compilation.'
        ];
        
        echo json_encode($response);
        flush(); // Forcer l'envoi immédiat de la réponse
        
        // Log pour debug (toujours activé pour diagnostic)
        error_log('[handleUploadFirmwareIno] ✅ Upload réussi - Firmware ID: ' . $firmware_id . ', Version: ' . $version);
        error_log('[handleUploadFirmwareIno] Réponse JSON: ' . json_encode($response));
        
    } catch(PDOException $e) {
        // Nettoyer les fichiers temporaires
        if (isset($temp_path) && file_exists($temp_path)) {
            @unlink($temp_path);
        }
        if (isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        // Logger l'erreur complète
        error_log('[handleUploadFirmwareIno] PDOException: ' . $e->getMessage());
        error_log('[handleUploadFirmwareIno] Code erreur: ' . $e->getCode());
        error_log('[handleUploadFirmwareIno] Stack trace: ' . $e->getTraceAsString());
        
        // Supprimer l'entrée en DB si elle a été créée
        if (isset($firmware_id)) {
            try {
                $deleteStmt = $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id");
                $deleteStmt->execute(['id' => $firmware_id]);
            } catch(PDOException $deleteErr) {
                error_log('[handleUploadFirmwareIno] Erreur lors de la suppression: ' . $deleteErr->getMessage());
            }
        }
        
        // S'assurer que le Content-Type est JSON
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' 
            ? 'Erreur base de données: ' . $e->getMessage() 
            : 'Erreur lors de l\'enregistrement en base de données';
        
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    } catch(Exception $e) {
        // Nettoyer tous les fichiers temporaires
        if (isset($temp_path) && file_exists($temp_path)) {
            @unlink($temp_path);
        }
        if (isset($ino_path) && file_exists($ino_path)) {
            @unlink($ino_path);
        }
        
        // Logger l'erreur complète
        error_log('[handleUploadFirmwareIno] Exception: ' . $e->getMessage());
        error_log('[handleUploadFirmwareIno] Stack trace: ' . $e->getTraceAsString());
        
        // Supprimer l'entrée en DB si elle a été créée
        if (isset($firmware_id)) {
            try {
                $deleteStmt = $pdo->prepare("DELETE FROM firmware_versions WHERE id = :id");
                $deleteStmt->execute(['id' => $firmware_id]);
            } catch(PDOException $deleteErr) {
                error_log('[handleUploadFirmwareIno] Erreur lors de la suppression: ' . $deleteErr->getMessage());
            }
        }
        
        // S'assurer que le Content-Type est JSON
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        
        http_response_code(500);
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' 
            ? 'Erreur: ' . $e->getMessage() 
            : 'Erreur lors de l\'upload';
        
        echo json_encode(['success' => false, 'error' => $errorMsg]);
    }
}
