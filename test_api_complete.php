<?php
/**
 * Script de test complet pour vérifier l'API upload et compilation
 * Vérifie : base de données, requêtes, routes, réponses
 */

require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';

echo "=== TEST COMPLET API UPLOAD & COMPILATION ===\n\n";

// 1. Vérifier la connexion à la base de données
echo "1. Vérification de la base de données...\n";
try {
    $dbConfig = ott_database_config();
    if ($dbConfig === null) {
        die("❌ Configuration base de données manquante\n");
    }
    
    $pdo = new PDO(
        $dbConfig['dsn'],
        $dbConfig['user'],
        $dbConfig['pass'],
        ott_pdo_options($dbConfig['type'])
    );
    echo "✅ Connexion à la base de données réussie\n";
    
    // Vérifier si la table firmware_versions existe
    $stmt = $pdo->query("SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'firmware_versions'
    )");
    $tableExists = $stmt->fetchColumn();
    
    if (!$tableExists) {
        die("❌ Table firmware_versions n'existe pas. Exécutez la migration.\n");
    }
    echo "✅ Table firmware_versions existe\n";
    
    // Vérifier les colonnes de la table
    $stmt = $pdo->query("
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'firmware_versions'
        ORDER BY ordinal_position
    ");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "\nColonnes de firmware_versions:\n";
    $hasStatus = false;
    foreach ($columns as $col) {
        echo "  - {$col['column_name']} ({$col['data_type']})\n";
        if ($col['column_name'] === 'status') {
            $hasStatus = true;
        }
    }
    
    if (!$hasStatus) {
        echo "\n⚠️  Colonne 'status' manquante. Exécutez: sql/migration_add_firmware_status.sql\n";
    } else {
        echo "✅ Colonne 'status' présente\n";
    }
    
} catch (Exception $e) {
    die("❌ Erreur base de données: " . $e->getMessage() . "\n");
}

// 2. Vérifier les routes
echo "\n2. Vérification des routes...\n";
$routes = [
    'POST /api.php/firmwares/upload-ino' => 'handleUploadFirmwareIno',
    'GET /api.php/firmwares/compile/1' => 'handleCompileFirmware',
    'GET /api.php/firmwares' => 'handleGetFirmwares',
];

foreach ($routes as $route => $handler) {
    if (function_exists($handler)) {
        echo "✅ Route $route -> $handler existe\n";
    } else {
        echo "❌ Handler $handler manquant pour $route\n";
    }
}

// 3. Vérifier les fichiers et dossiers
echo "\n3. Vérification des dossiers...\n";
$firmwareDir = __DIR__ . '/hardware/firmware';
if (!is_dir($firmwareDir)) {
    echo "⚠️  Dossier hardware/firmware n'existe pas, création...\n";
    mkdir($firmwareDir, 0755, true);
}
echo "✅ Dossier hardware/firmware existe\n";

$v3Dir = $firmwareDir . '/v3.0';
if (!is_dir($v3Dir)) {
    echo "⚠️  Dossier v3.0 n'existe pas, création...\n";
    mkdir($v3Dir, 0755, true);
}
echo "✅ Dossier v3.0 existe\n";

// 4. Vérifier les permissions
echo "\n4. Vérification des permissions...\n";
if (is_writable($firmwareDir)) {
    echo "✅ Dossier hardware/firmware est accessible en écriture\n";
} else {
    echo "❌ Dossier hardware/firmware n'est PAS accessible en écriture\n";
}

// 5. Tester la création d'un fichier de test
echo "\n5. Test d'écriture de fichier...\n";
$testFile = $v3Dir . '/test_' . time() . '.txt';
if (file_put_contents($testFile, 'test') !== false) {
    echo "✅ Écriture de fichier réussie\n";
    unlink($testFile);
} else {
    echo "❌ Échec d'écriture de fichier\n";
}

// 6. Vérifier les firmwares existants
echo "\n6. Firmwares existants dans la base:\n";
try {
    $stmt = $pdo->query("
        SELECT id, version, status, file_path, created_at 
        FROM firmware_versions 
        ORDER BY created_at DESC 
        LIMIT 5
    ");
    $firmwares = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($firmwares)) {
        echo "  Aucun firmware dans la base\n";
    } else {
        foreach ($firmwares as $fw) {
            echo "  - ID: {$fw['id']}, Version: {$fw['version']}, Status: " . ($fw['status'] ?? 'NULL') . "\n";
        }
    }
} catch (Exception $e) {
    echo "❌ Erreur lors de la lecture: " . $e->getMessage() . "\n";
}

// 7. Vérifier la fonction sendSSE
echo "\n7. Vérification de la fonction sendSSE...\n";
if (function_exists('sendSSE')) {
    echo "✅ Fonction sendSSE existe\n";
} else {
    echo "❌ Fonction sendSSE manquante\n";
}

// 8. Vérifier getVersionDir
echo "\n8. Vérification de la fonction getVersionDir...\n";
if (function_exists('getVersionDir')) {
    $testVersions = ['3.0.0', '3.0-rebuild', '2.5.1'];
    foreach ($testVersions as $v) {
        $dir = getVersionDir($v);
        echo "  Version $v -> $dir\n";
    }
    echo "✅ Fonction getVersionDir fonctionne\n";
} else {
    echo "❌ Fonction getVersionDir manquante\n";
}

// 9. Résumé
echo "\n=== RÉSUMÉ ===\n";
echo "Vérifications terminées. Vérifiez les messages ci-dessus pour les problèmes.\n";
echo "\nPour tester l'upload:\n";
echo "1. Assurez-vous que la colonne 'status' existe (exécutez migration_add_firmware_status.sql si nécessaire)\n";
echo "2. Vérifiez que le dossier hardware/firmware est accessible en écriture\n";
echo "3. Testez l'upload via l'interface web\n";

