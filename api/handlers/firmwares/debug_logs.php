<?php
/**
 * Endpoint de diagnostic pour voir les logs de compilation
 * Permet de diagnostiquer les problèmes de compilation en temps réel
 */

function handleGetCompileDebugLogs($firmware_id) {
    global $pdo;
    
    requireAdmin();
    
    // Récupérer les informations du firmware
    try {
        $stmt = $pdo->prepare("SELECT id, version, status, error_message, created_at, updated_at FROM firmware_versions WHERE id = :id");
        $stmt->execute(['id' => $firmware_id]);
        $firmware = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$firmware) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Firmware not found']);
            return;
        }
        
        // Informations de diagnostic
        $debug = [
            'firmware' => $firmware,
            'system' => [
                'php_version' => PHP_VERSION,
                'os' => PHP_OS,
                'time' => date('Y-m-d H:i:s'),
                'memory_usage' => memory_get_usage(true),
                'memory_peak' => memory_get_peak_usage(true),
            ],
            'arduino_cli' => [
                'found' => false,
                'path' => null,
            ],
            'environment' => [
                'root_dir' => getProjectRoot(),
                'temp_dir' => sys_get_temp_dir(),
            ]
        ];
        
        // Vérifier arduino-cli
        $root_dir = getProjectRoot();
        $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
        
        // Chercher arduino-cli
        $arduinoCli = null;
        $localArduinoCli = $root_dir . '/bin/arduino-cli' . ($isWindows ? '.exe' : '');
        if (file_exists($localArduinoCli)) {
            $arduinoCli = $localArduinoCli;
        } else {
            $homeDir = getenv('HOME');
            if (!empty($homeDir) && !$isWindows) {
                $renderArduinoCli = $homeDir . '/.local/bin/arduino-cli';
                if (file_exists($renderArduinoCli)) {
                    $arduinoCli = $renderArduinoCli;
                }
            }
            if (empty($arduinoCli)) {
                if ($isWindows) {
                    $pathCli = trim(shell_exec('where arduino-cli 2>nul || echo ""'));
                } else {
                    $pathCli = trim(shell_exec('which arduino-cli 2>/dev/null || echo ""'));
                }
                if (!empty($pathCli) && file_exists($pathCli)) {
                    $arduinoCli = $pathCli;
                }
            }
        }
        
        if ($arduinoCli) {
            $debug['arduino_cli']['found'] = true;
            $debug['arduino_cli']['path'] = $arduinoCli;
            $debug['arduino_cli']['executable'] = is_executable($arduinoCli);
            $debug['arduino_cli']['readable'] = is_readable($arduinoCli);
            
            // Tester la version
            try {
                $version = shell_exec($arduinoCli . ' version 2>&1');
                $debug['arduino_cli']['version'] = trim($version);
            } catch (Exception $e) {
                $debug['arduino_cli']['version_error'] = $e->getMessage();
            }
        }
        
        // Vérifier le fichier .ino
        try {
            $stmt = $pdo->prepare("SELECT file_path, ino_content FROM firmware_versions WHERE id = :id");
            $stmt->execute(['id' => $firmware_id]);
            $fw = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($fw) {
                $debug['firmware_file'] = [
                    'file_path' => $fw['file_path'],
                    'has_ino_content' => !empty($fw['ino_content']),
                    'ino_content_size' => $fw['ino_content'] ? strlen($fw['ino_content']) : 0,
                ];
                
                // Vérifier si le fichier existe sur le disque
                if (!empty($fw['file_path'])) {
                    $root_dir = getProjectRoot();
                    $full_path = $root_dir . '/' . $fw['file_path'];
                    $debug['firmware_file']['disk_path'] = $full_path;
                    $debug['firmware_file']['exists'] = file_exists($full_path);
                    $debug['firmware_file']['readable'] = file_exists($full_path) ? is_readable($full_path) : false;
                    if (file_exists($full_path)) {
                        $debug['firmware_file']['size'] = filesize($full_path);
                    }
                }
            }
        } catch (Exception $e) {
            $debug['firmware_file_error'] = $e->getMessage();
        }
        
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => true,
            'debug' => $debug
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

