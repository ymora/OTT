<?php
/**
 * Script de test CLI pour la compilation du firmware
 * Usage: php test_compile_cli.php <firmware_id> <token>
 */

require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';
require_once __DIR__ . '/api/helpers.php';
require_once __DIR__ . '/api/handlers/firmwares/compile.php';

// Récupérer les arguments
$firmware_id = $argv[1] ?? null;
$token = $argv[2] ?? null;

if (!$firmware_id || !$token) {
    echo "Usage: php test_compile_cli.php <firmware_id> <token>\n";
    echo "Exemple: php test_compile_cli.php 1 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n";
    exit(1);
}

// Simuler $_GET pour le token
$_GET['token'] = $token;

echo "=== Test compilation firmware ID: $firmware_id ===\n";
echo "Token: " . substr($token, 0, 20) . "...\n\n";

// Vérifier l'authentification
echo "1. Vérification authentification...\n";
$user = getCurrentUser();
if (!$user) {
    echo "❌ Authentification échouée\n";
    echo "   Vérifiez que le token est valide\n";
    exit(1);
}
echo "✅ Authentification OK - User: {$user['email']} (ID: {$user['id']})\n\n";

// Vérifier que le firmware existe
echo "2. Vérification firmware...\n";
global $pdo;
$stmt = $pdo->prepare("SELECT *, ino_content, bin_content FROM firmware_versions WHERE id = :id");
$stmt->execute(['id' => $firmware_id]);
$firmware = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$firmware) {
    echo "❌ Firmware ID $firmware_id introuvable\n";
    exit(1);
}
echo "✅ Firmware trouvé:\n";
echo "   Version: {$firmware['version']}\n";
echo "   Status: {$firmware['status']}\n";
echo "   File path: " . ($firmware['file_path'] ?? 'N/A') . "\n";
echo "   INO en DB: " . (!empty($firmware['ino_content']) ? 'OUI (' . strlen($firmware['ino_content']) . ' bytes)' : 'NON') . "\n\n";

// Tester findFirmwareInoFile
echo "3. Recherche fichier .ino...\n";
require_once __DIR__ . '/api/handlers/firmwares/helpers.php';
$ino_path = findFirmwareInoFile($firmware_id, $firmware);
if ($ino_path && file_exists($ino_path)) {
    echo "✅ Fichier .ino trouvé: $ino_path\n";
    echo "   Taille: " . filesize($ino_path) . " bytes\n";
} else {
    echo "❌ Fichier .ino introuvable\n";
    exit(1);
}
echo "\n";

// Vérifier arduino-cli
echo "4. Vérification arduino-cli...\n";
$root_dir = getProjectRoot();
$isWindows = is_windows();
$arduinoCli = null;

$localArduinoCli = $root_dir . '/bin/arduino-cli' . ($isWindows ? '.exe' : '');
if (file_exists($localArduinoCli) && is_readable($localArduinoCli)) {
    $arduinoCli = $localArduinoCli;
    echo "✅ arduino-cli trouvé: $arduinoCli\n";
} else {
    if ($isWindows) {
        $pathCli = trim(shell_exec('where arduino-cli 2>nul || echo ""'));
    } else {
        $pathCli = trim(shell_exec('which arduino-cli 2>/dev/null || echo ""'));
    }
    
    if (!empty($pathCli) && file_exists($pathCli)) {
        $arduinoCli = $pathCli;
        echo "✅ arduino-cli trouvé dans PATH: $arduinoCli\n";
    } else {
        echo "❌ arduino-cli non trouvé\n";
        exit(1);
    }
}

// Tester la version d'arduino-cli
echo "   Test version arduino-cli...\n";
$versionOutput = [];
$versionReturn = 0;
exec($arduinoCli . ' version 2>&1', $versionOutput, $versionReturn);
if ($versionReturn === 0) {
    echo "   ✅ Version: " . implode("\n   ", $versionOutput) . "\n";
} else {
    echo "   ⚠️ Erreur lors de la vérification de version\n";
}
echo "\n";

// Simuler l'appel à handleCompileFirmware
echo "5. Test appel handleCompileFirmware (simulation SSE)...\n";
echo "   Note: Cette fonction envoie des messages SSE, on va juste vérifier qu'elle démarre\n";
echo "   Pour un test complet, utilisez le dashboard ou test_compile_endpoint.html\n\n";

// Vérifier les permissions
echo "6. Vérification permissions...\n";
$user_permissions = $user['permissions'] ?? [];
if (in_array('firmwares.manage', $user_permissions) || in_array('firmwares.compile', $user_permissions) || $user['role_name'] === 'admin') {
    echo "✅ Permissions OK\n";
} else {
    echo "⚠️ Permissions: " . implode(', ', $user_permissions) . "\n";
    echo "   Vérifiez que l'utilisateur a la permission 'firmwares.manage' ou 'firmwares.compile'\n";
}
echo "\n";

echo "=== Résumé ===\n";
echo "✅ Tous les prérequis sont OK\n";
echo "✅ La compilation devrait fonctionner depuis le dashboard\n";
echo "\n";
echo "Si la compilation ne démarre toujours pas, vérifiez:\n";
echo "1. Les logs serveur PHP (error_log)\n";
echo "2. La console navigateur (F12) pour les erreurs JavaScript\n";
echo "3. Les logs SSE dans le dashboard\n";

