<?php
/**
 * Script pour appliquer le schéma SQL via l'API Render
 * Alternative si psql n'est pas disponible localement
 * 
 * Usage: php scripts/db/apply_schema_via_api.php
 */

// Charger les fonctions de base de données
$bootstrapPath = __DIR__ . '/../../bootstrap/database.php';
if (file_exists($bootstrapPath)) {
    require_once $bootstrapPath;
} else {
    // Fallback: parser DATABASE_URL manuellement
    function parseDatabaseUrl($url) {
        $parts = parse_url($url);
        return [
            'host' => $parts['host'] ?? 'localhost',
            'port' => $parts['port'] ?? 5432,
            'dbname' => ltrim($parts['path'] ?? '/ott_data', '/'),
            'user' => $parts['user'] ?? 'postgres',
            'password' => $parts['pass'] ?? ''
        ];
    }
}

// Configuration
$schemaFile = __DIR__ . '/../../sql/schema.sql';
$apiUrl = getenv('API_URL') ?: 'https://ott-jbln.onrender.com';
$token = getenv('API_TOKEN') ?: '';

echo "🔧 Application du schéma SQL via l'API Render\n";
echo "=" . str_repeat("=", 70) . "\n\n";

// Vérifier que le fichier existe
if (!file_exists($schemaFile)) {
    echo "❌ Erreur: Fichier schéma introuvable: $schemaFile\n";
    exit(1);
}

// Lire le schéma
$schemaContent = file_get_contents($schemaFile);
if ($schemaContent === false) {
    echo "❌ Erreur: Impossible de lire le fichier schéma\n";
    exit(1);
}

echo "📋 Fichier schéma: $schemaFile\n";
echo "📏 Taille: " . number_format(strlen($schemaContent)) . " octets\n\n";

// Option 1: Utiliser l'endpoint de migration de l'API (si disponible)
if ($token) {
    echo "🔍 Tentative via endpoint API...\n";
    
    $ch = curl_init("$apiUrl/api.php/admin/migrations/run");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'sql' => $schemaContent
        ])
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        $data = json_decode($response, true);
        if ($data['success'] ?? false) {
            echo "✅ Schéma appliqué avec succès via l'API !\n";
            exit(0);
        } else {
            echo "❌ Erreur API: " . ($data['error'] ?? 'Erreur inconnue') . "\n";
        }
    } else {
        echo "⚠️  Endpoint API non disponible (code $httpCode)\n";
    }
}

// Option 2: Utiliser une connexion directe PostgreSQL via PDO
echo "\n🔍 Tentative via connexion directe PostgreSQL...\n";

try {
    // Récupérer DATABASE_URL depuis les variables d'environnement
    $databaseUrl = getenv('DATABASE_URL');
    
    if (!$databaseUrl) {
        echo "❌ Erreur: DATABASE_URL non défini\n";
        echo "   Définissez DATABASE_URL dans votre environnement ou .env\n";
        exit(1);
    }
    
    // Parser l'URL PostgreSQL
    $urlParts = parse_url($databaseUrl);
    if (!$urlParts || $urlParts['scheme'] !== 'postgresql') {
        echo "❌ Erreur: URL PostgreSQL invalide\n";
        exit(1);
    }
    
    $host = $urlParts['host'] ?? 'localhost';
    $port = $urlParts['port'] ?? 5432;
    $dbname = ltrim($urlParts['path'] ?? '/ott_data', '/');
    $user = $urlParts['user'] ?? 'postgres';
    $password = $urlParts['pass'] ?? '';
    
    echo "   Connexion à: $user@$host:$port/$dbname\n";
    
    // Créer la connexion PDO
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
    
    echo "✅ Connexion réussie !\n\n";
    
    // Appliquer le schéma
    echo "📋 Application du schéma SQL...\n";
    
    // Diviser le schéma en requêtes individuelles (séparées par ;)
    // Note: Cette approche simple peut ne pas gérer tous les cas (fonctions, triggers, etc.)
    // Pour un schéma complexe, il vaut mieux utiliser psql ou l'API
    
    $queries = array_filter(
        array_map('trim', explode(';', $schemaContent)),
        function($q) { return !empty($q) && !preg_match('/^\s*--/', $q); }
    );
    
    $successCount = 0;
    $errorCount = 0;
    
    foreach ($queries as $index => $query) {
        if (empty(trim($query))) continue;
        
        try {
            $pdo->exec($query);
            $successCount++;
            if (($index + 1) % 10 === 0) {
                echo "   ✅ " . ($index + 1) . " requêtes exécutées...\n";
            }
        } catch (PDOException $e) {
            // Ignorer les erreurs "already exists" (normal pour CREATE IF NOT EXISTS)
            if (strpos($e->getMessage(), 'already exists') === false && 
                strpos($e->getMessage(), 'duplicate') === false) {
                echo "   ⚠️  Erreur requête " . ($index + 1) . ": " . $e->getMessage() . "\n";
                $errorCount++;
            }
        }
    }
    
    echo "\n✅ Schéma appliqué !\n";
    echo "   Requêtes réussies: $successCount\n";
    if ($errorCount > 0) {
        echo "   Requêtes en erreur: $errorCount (peut être normal)\n";
    }
    
    // Vérifier les tables créées
    echo "\n🔍 Vérification des tables créées...\n";
    $stmt = $pdo->query("
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
    ");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if ($tables) {
        echo "✅ Tables créées (" . count($tables) . "):\n";
        foreach ($tables as $table) {
            echo "   - $table\n";
        }
    } else {
        echo "⚠️  Aucune table trouvée\n";
    }
    
} catch (PDOException $e) {
    echo "❌ Erreur de connexion: " . $e->getMessage() . "\n";
    echo "\n💡 Vérifiez:\n";
    echo "   - Que DATABASE_URL est correct\n";
    echo "   - Que votre IP n'est pas bloquée par Render\n";
    echo "   - Que l'extension PDO PostgreSQL est activée (php -m | grep pdo_pgsql)\n";
    exit(1);
} catch (Exception $e) {
    echo "❌ Erreur: " . $e->getMessage() . "\n";
    exit(1);
}

echo "\n" . str_repeat("=", 70) . "\n";
echo "✅ Configuration terminée !\n";

