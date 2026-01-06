<?php
/**
 * Flash de firmware optimisé et simplifié
 * Moins de logs, plus rapide, directe
 */

function handleFlashFirmware($firmware_id, $port = 'COM3') {
    global $pdo;
    
    // Validation rapide
    $firmware_id = filter_var($firmware_id, FILTER_VALIDATE_INT);
    if (!$firmware_id || $firmware_id <= 0) {
        sendSSE('error', 'Invalid firmware ID');
        return;
    }
    
    try {
        // Authentification rapide
        $user = getCurrentUser();
        if (!$user) {
            sendSSE('error', 'Unauthorized');
            return;
        }
        
        // Récupérer le firmware compilé
        $stmt = $pdo->prepare("SELECT * FROM firmware_versions WHERE id = :id AND status = 'compiled'");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            sendSSE('error', 'Firmware not found or not compiled');
            return;
        }
        
        // Mettre à jour le statut
        $pdo->prepare("UPDATE firmware_versions SET status = 'flashing' WHERE id = :id")
               ->execute(['id' => $firmware_id]);
        
        sendSSE('log', 'info', '🚀 Flash démarré...');
        
        // Chemins
        $script_dir = __DIR__ . '/../../hardware/scripts';
        $powershell_script = $script_dir . '/build_firmware.ps1';
        
        if (!file_exists($powershell_script)) {
            throw new Exception("Script PowerShell non trouvé");
        }
        
        // Exécuter le flash directement
        $command = "powershell.exe -ExecutionPolicy Bypass -File \"" . $powershell_script . "\" -Port " . $port . " -Upload 2>&1";
        
        sendSSE('log', 'info', "⚡ Flash sur {$port} en cours...");
        
        $output = [];
        $return_code = 0;
        $start_time = microtime(true);
        
        exec($command, $output, $return_code);
        
        $duration = round((microtime(true) - $start_time), 2);
        
        if ($return_code === 0) {
            // Succès
            $pdo->prepare("UPDATE firmware_versions SET status = 'flashed', flashed_at = NOW() WHERE id = :id")
                   ->execute(['id' => $firmware_id]);
            
            sendSSE('log', 'success', "✅ Flash réussi en {$duration}s!");
            sendSSE('success', 'Flash completed');
            
            // Attendre un peu pour que le dispositif redémarre
            sendSSE('log', 'info', '⏳ Attente redémarrage dispositif...');
            sleep(3);
            sendSSE('log', 'info', '🔄 Dispositif prêt!');
            
        } else {
            // Erreur
            $error_output = implode("\n", array_slice($output, -5)); // Dernières 5 lignes
            $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = :error WHERE id = :id")
                   ->execute(['error' => $error_output, 'id' => $firmware_id]);
            
            sendSSE('log', 'error', "❌ Erreur flash ({$duration}s): " . $error_output);
            sendSSE('error', 'Flash failed');
        }
        
    } catch (Exception $e) {
        error_log("Flash error: " . $e->getMessage());
        sendSSE('error', 'System error: ' . $e->getMessage());
        
        // Mettre à jour le statut en erreur
        try {
            $pdo->prepare("UPDATE firmware_versions SET status = 'error', error_message = :error WHERE id = :id")
                   ->execute(['error' => $e->getMessage(), 'id' => $firmware_id]);
        } catch (Exception $dbErr) {
            error_log("DB error: " . $dbErr->getMessage());
        }
    }
}

// Router simple
if ($_SERVER['REQUEST_METHOD'] === 'POST' && str_contains($_SERVER['REQUEST_URI'], '/flash')) {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    
    $data = json_decode(file_get_contents('php://input'), true);
    $firmware_id = $data['firmware_id'] ?? null;
    $port = $data['port'] ?? 'COM3';
    
    if ($firmware_id) {
        handleFlashFirmware($firmware_id, $port);
    } else {
        echo "data: " . json_encode(['error' => 'Missing firmware ID']) . "\n\n";
    }
}
?>
