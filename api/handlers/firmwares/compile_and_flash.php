<?php
/**
 * API endpoint pour compiler et flasher le firmware
 * Remplace l'appel direct au script PowerShell
 */

function handleFirmwareCompile() {
    global $pdo;
    
    // Vérifier permissions
    $user = requireAuth();
    if ($user['role_name'] !== 'admin' && $user['role_name'] !== 'technicien') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin ou technicien requis.']);
        return;
    }
    
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($body['firmware_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID du firmware manquant']);
            return;
        }
        
        $firmware_id = $body['firmware_id'];
        $upload_only = $body['upload'] ?? false;
        
        // Récupérer le firmware
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware non trouvé']);
            return;
        }
        
        // Chemins
        $script_dir = __DIR__ . '/../../hardware/scripts';
        $firmware_dir = __DIR__ . '/../../hardware/firmware/fw_ott_optimized';
        $ino_file = $firmware_dir . '/fw_ott_optimized.ino';
        
        if (!file_exists($ino_file)) {
            throw new Exception("Fichier .ino non trouvé: " . $ino_file);
        }
        
        // Script PowerShell
        $powershell_script = $script_dir . '/build_firmware.ps1';
        
        if (!file_exists($powershell_script)) {
            throw new Exception("Script PowerShell non trouvé: " . $powershell_script);
        }
        
        // Exécuter la compilation
        $command = "powershell.exe -ExecutionPolicy Bypass -File \"" . $powershell_script . "\"";
        
        // Pour le debug, capturer la sortie
        $output = [];
        $return_code = 0;
        
        exec($command, $output, $return_code);
        
        if ($return_code !== 0) {
            throw new Exception("Compilation échouée. Code: " . $return_code . " Output: " . implode("\n", $output));
        }
        
        // Si compilation réussie, mettre à jour le statut
        $update_stmt = $pdo->prepare("UPDATE firmware_versions SET status = 'compiled', compiled_at = NOW() WHERE id = :id");
        $update_stmt->execute(['id' => $firmware_id]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Compilation réussie',
            'output' => $output
        ]);
        
    } catch (Exception $e) {
        error_log("Firmware compilation error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleFirmwareFlash() {
    global $pdo;
    
    // Vérifier permissions
    $user = requireAuth();
    if ($user['role_name'] !== 'admin' && $user['role_name'] !== 'technicien') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Accès refusé. Admin ou technicien requis.']);
        return;
    }
    
    try {
        $body = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($body['firmware_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID du firmware manquant']);
            return;
        }
        
        $firmware_id = $body['firmware_id'];
        $port = $body['port'] ?? 'COM3';
        
        // Récupérer le firmware
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id AND status = 'compiled'");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware compilé non trouvé']);
            return;
        }
        
        // Chemins
        $script_dir = __DIR__ . '/../../hardware/scripts';
        $powershell_script = $script_dir . '/build_firmware.ps1';
        
        if (!file_exists($powershell_script)) {
            throw new Exception("Script PowerShell non trouvé: " . $powershell_script);
        }
        
        // Exécuter le flash
        $command = "powershell.exe -ExecutionPolicy Bypass -File \"" . $powershell_script . "\" -Port " . $port . " -Upload";
        
        $output = [];
        $return_code = 0;
        
        exec($command, $output, $return_code);
        
        if ($return_code !== 0) {
            throw new Exception("Flash échoué. Code: " . $return_code . " Output: " . implode("\n", $output));
        }
        
        // Mettre à jour le statut du firmware
        $update_stmt = $pdo->prepare("UPDATE firmware_versions SET status = 'flashed', flashed_at = NOW() WHERE id = :id");
        $update_stmt->execute(['id' => $firmware_id]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Flash réussi sur ' . $port,
            'output' => $output
        ]);
        
    } catch (Exception $e) {
        error_log("Firmware flash error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// Router
$request_method = $_SERVER['REQUEST_METHOD'] ?? '';
$request_uri = $_SERVER['REQUEST_URI'] ?? '';

if ($request_method === 'POST' && str_contains($request_uri, '/compile')) {
    handleFirmwareCompile();
} elseif ($request_method === 'POST' && str_contains($request_uri, '/flash')) {
    handleFirmwareFlash();
} else {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Endpoint non trouvé']);
}
?>
