<?php
/**
 * Script PHP - Migration Firmware BYTEA
 * Applique sql/migration_firmware_blob.sql sur Render
 * Peut être exécuté directement via PHP (pas besoin de psql ou Docker)
 */

// Charger les variables d'environnement
require_once __DIR__ . '/../../bootstrap/env_loader.php';

$DATABASE_URL = getenv('DATABASE_URL');

if (empty($DATABASE_URL)) {
    echo "❌ DATABASE_URL doit être défini dans les variables d'environnement\n";
    echo "\n";
    echo "Usage:\n";
    echo "  php scripts/db/migrate_firmware_blob.php\n";
    echo "  OU\n";
    echo "  DATABASE_URL='postgresql://...' php scripts/db/migrate_firmware_blob.php\n";
    echo "\n";
    exit(1);
}

echo "\n";
echo "💾 Migration Firmware BYTEA - Stockage dans PostgreSQL\n";
echo "\n";
echo "📦 Application de la migration firmware_blob (PostgreSQL)\n";
echo "   Base: " . preg_replace('/:[^:@]+@/', ':****@', $DATABASE_URL) . "\n";
echo "\n";

// Lire le fichier SQL
$migrationFile = __DIR__ . '/../../sql/migration_firmware_blob.sql';
if (!file_exists($migrationFile)) {
    echo "❌ Fichier SQL introuvable: $migrationFile\n";
    exit(1);
}

$sql = file_get_contents($migrationFile);
if ($sql === false) {
    echo "❌ Impossible de lire le fichier SQL\n";
    exit(1);
}

try {
    // Parser DATABASE_URL
    $url = parse_url($DATABASE_URL);
    if (!$url) {
        throw new Exception("DATABASE_URL invalide");
    }
    
    $host = $url['host'] ?? 'localhost';
    $port = $url['port'] ?? 5432;
    $dbname = ltrim($url['path'] ?? '/postgres', '/');
    $user = $url['user'] ?? 'postgres';
    $pass = $url['pass'] ?? '';
    
    // Construire le DSN
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    
    // Connexion à la base de données
    echo "1️⃣  Connexion à la base de données...\n";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    echo "   ✅ Connecté\n";
    echo "\n";
    
    // Exécuter la migration
    echo "2️⃣  Application de la migration firmware_blob...\n";
    
    // Diviser le SQL en commandes individuelles
    $commands = array_filter(
        array_map('trim', explode(';', $sql)),
        function($cmd) {
            return !empty($cmd) && !preg_match('/^\s*--/', $cmd);
        }
    );
    
    foreach ($commands as $command) {
        if (empty(trim($command))) continue;
        
        try {
            $pdo->exec($command);
        } catch (PDOException $e) {
            // Ignorer les erreurs "already exists" pour IF NOT EXISTS
            if (strpos($e->getMessage(), 'already exists') === false && 
                strpos($e->getMessage(), 'duplicate') === false) {
                throw $e;
            }
        }
    }
    
    echo "   ✅ Migration appliquée\n";
    echo "\n";
    
    // Vérifier que les colonnes existent
    echo "3️⃣  Vérification des colonnes...\n";
    
    $checkStmt = $pdo->query("
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'firmware_versions' 
        AND column_name IN ('ino_content', 'bin_content')
        ORDER BY column_name
    ");
    
    $columns = $checkStmt->fetchAll();
    
    if (count($columns) === 2) {
        echo "   ✅ Colonnes créées:\n";
        foreach ($columns as $col) {
            echo "      - {$col['column_name']} ({$col['data_type']})\n";
        }
    } else {
        echo "   ⚠️  Colonnes trouvées: " . count($columns) . "\n";
        foreach ($columns as $col) {
            echo "      - {$col['column_name']} ({$col['data_type']})\n";
        }
    }
    echo "\n";
    
    echo "✅ Migration terminée avec succès !\n";
    echo "\n";
    echo "📝 Prochaines étapes:\n";
    echo "   - Les nouveaux uploads .ino seront stockés dans la DB\n";
    echo "   - Les compilations .bin seront stockées dans la DB\n";
    echo "   - Plus de perte de fichiers lors des redéploiements !\n";
    echo "\n";
    
} catch (Exception $e) {
    echo "❌ Erreur: " . $e->getMessage() . "\n";
    if (isset($e->getTrace()[0])) {
        echo "   Fichier: " . $e->getFile() . ":" . $e->getLine() . "\n";
    }
    exit(1);
}

