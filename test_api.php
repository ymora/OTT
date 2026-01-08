<?php
/**
 * Test API simple pour diagnostiquer les erreurs
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "=== API TEST ===\n";
echo "PHP Version: " . phpversion() . "\n";
echo "Timestamp: " . date('c') . "\n";

// Test variables d'environnement
echo "\n=== ENVIRONMENT ===\n";
echo "APP_ENV: " . (getenv('APP_ENV') ?: 'NOT SET') . "\n";
echo "DATABASE_URL: " . (getenv('DATABASE_URL') ? 'SET' : 'NOT SET') . "\n";
echo "DB_HOST: " . (getenv('DB_HOST') ?: 'NOT SET') . "\n";

// Test inclusion des fichiers
echo "\n=== FILE INCLUSION TEST ===\n";

try {
    require_once __DIR__ . '/bootstrap/env_loader.php';
    echo "✅ env_loader.php loaded\n";
} catch (Exception $e) {
    echo "❌ env_loader.php failed: " . $e->getMessage() . "\n";
}

try {
    require_once __DIR__ . '/bootstrap/database.php';
    echo "✅ database.php loaded\n";
} catch (Exception $e) {
    echo "❌ database.php failed: " . $e->getMessage() . "\n";
}

// Test connexion BDD
echo "\n=== DATABASE CONNECTION ===\n";
try {
    if (isset($pdo)) {
        $stmt = $pdo->query("SELECT 1");
        echo "✅ Database connection successful\n";
    } else {
        echo "❌ PDO not defined\n";
    }
} catch (Exception $e) {
    echo "❌ Database connection failed: " . $e->getMessage() . "\n";
}

echo "\n=== END TEST ===\n";
?>
