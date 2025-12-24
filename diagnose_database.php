<?php
/**
 * Script de diagnostic de la base de données
 * Vérifie la connexion et l'état de la DB
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "========================================\n";
echo "DIAGNOSTIC BASE DE DONNÉES\n";
echo "========================================\n\n";

// 1. Vérifier les variables d'environnement
echo "[1/4] Vérification variables d'environnement...\n";

// Charger les variables d'environnement
require_once __DIR__ . '/bootstrap/env_loader.php';

if (file_exists(__DIR__ . '/.env')) {
    echo "✅ Fichier .env trouvé\n";
} elseif (file_exists(__DIR__ . '/.env.php')) {
    echo "✅ Fichier .env.php trouvé\n";
} else {
    echo "⚠️  Aucun fichier .env trouvé\n";
}

// Utiliser la fonction de configuration de bootstrap/database.php
require_once __DIR__ . '/bootstrap/database.php';
$dbConfig = ott_database_config();

if (!$dbConfig) {
    echo "❌ Configuration base de données invalide\n";
    echo "   Vérifiez les variables d'environnement DB_HOST, DB_NAME, DB_USER\n";
    exit(1);
}

$db_host = $dbConfig['host'];
$db_port = $dbConfig['port'];
$db_name = $dbConfig['name'];
$db_user = $dbConfig['user'];
$db_pass = $dbConfig['pass'];

echo "   DB_HOST: $db_host\n";
echo "   DB_PORT: $db_port\n";
echo "   DB_NAME: $db_name\n";
echo "   DB_USER: $db_user\n";
echo "   DB_PASS: " . (empty($db_pass) ? '(vide)' : '***') . "\n";
echo "   DB_TYPE: " . ($dbConfig['type'] ?? 'pgsql') . "\n\n";

// 2. Tester la connexion réseau
echo "[2/4] Test connexion réseau...\n";
$connection_string = "host=$db_host port=$db_port dbname=$db_name user=$db_user password=$db_pass";
echo "   Connexion: $db_host:$db_port/$db_name\n";

$socket = @fsockopen($db_host, $db_port, $errno, $errstr, 5);
if ($socket) {
    echo "✅ Port $db_port accessible sur $db_host\n";
    fclose($socket);
} else {
    echo "❌ Port $db_port NON accessible sur $db_host\n";
    echo "   Erreur: $errstr ($errno)\n";
    echo "\n💡 SOLUTIONS:\n";
    echo "   1. Vérifier que Docker est démarré: docker ps\n";
    echo "   2. Vérifier que le conteneur PostgreSQL est en cours d'exécution\n";
    echo "   3. Vérifier les variables d'environnement DB_HOST et DB_PORT\n";
    echo "\n";
}

// 3. Tester la connexion PDO
echo "[3/4] Test connexion PDO...\n";
try {
    $dsn = "pgsql:host=$db_host;port=$db_port;dbname=$db_name";
    $pdo = new PDO($dsn, $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5
    ]);
    
    echo "✅ Connexion PDO réussie\n";
    
    // Tester une requête simple
    $stmt = $pdo->query("SELECT version()");
    $version = $stmt->fetchColumn();
    echo "   PostgreSQL version: " . substr($version, 0, 50) . "...\n";
    
} catch (PDOException $e) {
    echo "❌ Erreur connexion PDO: " . $e->getMessage() . "\n";
    echo "   Code: " . $e->getCode() . "\n";
    echo "\n💡 SOLUTIONS:\n";
    echo "   1. Vérifier que PostgreSQL est démarré\n";
    echo "   2. Vérifier les identifiants (DB_USER, DB_PASS)\n";
    echo "   3. Vérifier que la base de données existe: CREATE DATABASE $db_name;\n";
    echo "\n";
    exit(1);
}

// 4. Vérifier les tables
echo "[4/4] Vérification tables...\n";
try {
    $tables = ['roles', 'users', 'devices', 'firmware_versions', 'patients'];
    $missing = [];
    
    foreach ($tables as $table) {
        $stmt = $pdo->prepare("
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = :table
            )
        ");
        $stmt->execute(['table' => $table]);
        $exists = $stmt->fetchColumn();
        
        if ($exists) {
            // Compter les lignes
            $countStmt = $pdo->query("SELECT COUNT(*) FROM $table");
            $count = $countStmt->fetchColumn();
            echo "   ✅ $table ($count lignes)\n";
        } else {
            echo "   ❌ $table (manquante)\n";
            $missing[] = $table;
        }
    }
    
    if (!empty($missing)) {
        echo "\n⚠️  Tables manquantes: " . implode(', ', $missing) . "\n";
        echo "💡 SOLUTION: Exécuter sql/schema.sql pour créer les tables\n";
    } else {
        echo "\n✅ Toutes les tables existent\n";
    }
    
} catch (PDOException $e) {
    echo "❌ Erreur lors de la vérification des tables: " . $e->getMessage() . "\n";
}

echo "\n========================================\n";
echo "DIAGNOSTIC TERMINÉ\n";
echo "========================================\n";

