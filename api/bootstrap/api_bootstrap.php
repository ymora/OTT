<?php
/**
 * Bootstrap API - Configuration et initialisation
 * Extrait de api.php pour modularisation
 */

// Mode DEBUG activable via variable d'environnement (désactivé par défaut)
// Pour activer : mettre DEBUG_ERRORS=true dans .env ou variable d'environnement

require_once __DIR__ . '/env_loader.php';
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/notifications.php';

// Démarrer le buffer de sortie TRÈS TÔT pour capturer toute sortie HTML accidentelle (warnings, notices, etc.)
// IMPORTANT: Doit être AVANT la définition des constantes pour capturer les éventuels warnings
ob_start();

// Headers CORS (DOIT être en tout premier)
// Utiliser uniquement les variables d'environnement pour les origines autorisées
// Ne pas hardcoder les URLs en production
$defaultAllowedOrigins = [];

// En développement local : autoriser localhost par défaut
if (getenv('APP_ENV') === 'development' || empty(getenv('APP_ENV'))) {
    $defaultAllowedOrigins = [
        'http://localhost:3000',  // Développement local Next.js
        'http://localhost:3003',  // Autres ports locaux
        'http://localhost:5173',  // Vite dev server
        'http://localhost:8000'   // API local
    ];
}

// Origines supplémentaires via variable d'environnement
// PRODUCTION: Configurer CORS_ALLOWED_ORIGINS dans .env ou variables d'environnement
// Exemple: CORS_ALLOWED_ORIGINS=https://ymora.github.io,https://ymora.github.io/OTT
$extraOrigins = array_filter(array_map('trim', explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: '')));
$allowedOrigins = array_unique(array_merge($defaultAllowedOrigins, $extraOrigins));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

// Gestion CORS (fiable et compatible navigateur)
$isProduction = getenv('APP_ENV') === 'production';
$isAllowed = false;
if (!empty($origin)) {
    foreach ($allowedOrigins as $allowedOrigin) {
        if ($origin === $allowedOrigin || strpos($origin, $allowedOrigin) === 0) {
            $isAllowed = true;
            break;
        }
    }
}

if (!empty($origin)) {
    if (!$isProduction || $isAllowed) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
    } else {
        error_log("[CORS] Origine bloquée: {$origin}");
    }
} else {
    // Pas d'Origin (curl / même serveur). En dev uniquement, autoriser * sans credentials.
    if (!$isProduction) {
        header('Access-Control-Allow-Origin: *');
    }
}

header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-ICCID, X-Requested-With, Cache-Control, Accept');
header('Access-Control-Max-Age: 86400');

// Gérer les requêtes OPTIONS (preflight CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Configuration base de données partagée avec le healthcheck
$dbConfig = ott_database_config();
if ($dbConfig === null) {
    http_response_code(500);
    die(json_encode(['success' => false, 'error' => 'Database configuration missing']));
}

define('DB_TYPE', $dbConfig['type']);
define('DB_HOST', $dbConfig['host']);
define('DB_PORT', $dbConfig['port']);
define('DB_NAME', $dbConfig['name']);
define('DB_USER', $dbConfig['user']);
define('DB_PASS', $dbConfig['pass']);
define('DB_DSN', $dbConfig['dsn']);

// JWT_SECRET doit être défini en production
$jwtSecret = getenv('JWT_SECRET');
if (empty($jwtSecret)) {
    $isProduction = getenv('APP_ENV') === 'production' || getenv('APP_ENV') === 'prod';
    if ($isProduction) {
        http_response_code(500);
        die(json_encode(['success' => false, 'error' => 'JWT_SECRET must be set in production']));
    }
    // En local, générer un secret aléatoire constant (mais loguer un avertissement)
    // IMPORTANT: Le secret doit rester constant pour valider les tokens existants
    // Utiliser un hash basé sur des informations stables (sans date) pour éviter les secrets hardcodés
    // Si un fichier de cache existe, le réutiliser pour garantir la constance
    $secretCacheFile = __DIR__ . '/.jwt_secret_cache';
    if (file_exists($secretCacheFile)) {
        $jwtSecret = trim(file_get_contents($secretCacheFile));
        if (empty($jwtSecret)) {
            // Si le fichier est vide, régénérer
            $jwtSecret = hash('sha256', __FILE__ . getenv('USER') . getenv('COMPUTERNAME') . 'JWT_SECRET_CONSTANT');
            file_put_contents($secretCacheFile, $jwtSecret);
        }
    } else {
        // Générer un nouveau secret et le sauvegarder
        $jwtSecret = hash('sha256', __FILE__ . getenv('USER') . getenv('COMPUTERNAME') . 'JWT_SECRET_CONSTANT');
        file_put_contents($secretCacheFile, $jwtSecret);
    }
    error_log('[SECURITY WARNING] JWT_SECRET not set, using generated secret. This is UNSAFE in production!');
}
define('JWT_SECRET', $jwtSecret);
define('JWT_EXPIRATION', 86400); // 24h
define('AUTH_DISABLED', getenv('AUTH_DISABLED') === 'true');

// Configuration des limites et timeouts
define('MAX_UPLOAD_SIZE', 50 * 1024 * 1024); // 50MB
define('MAX_REQUEST_SIZE', 10 * 1024 * 1024); // 10MB
define('API_TIMEOUT', 30); // 30 secondes
define('DB_TIMEOUT', 10); // 10 secondes

// Configuration des logs
define('LOG_ERRORS', getenv('LOG_ERRORS') !== 'false');
define('LOG_REQUESTS', getenv('LOG_REQUESTS') === 'true');
define('LOG_PERFORMANCE', getenv('LOG_PERFORMANCE') === 'true');

// Configuration du cache
define('CACHE_ENABLED', getenv('CACHE_ENABLED') !== 'false');
define('CACHE_TTL', 300); // 5 minutes par défaut

// Configuration de l'audit
define('AUDIT_ENABLED', getenv('AUDIT_ENABLED') !== 'false');
define('AUDIT_RETENTION_DAYS', 90);

// Configuration des notifications
define('NOTIFICATIONS_ENABLED', getenv('NOTIFICATIONS_ENABLED') !== 'false');
define('NOTIFICATION_BATCH_SIZE', 50);

// Configuration de la sécurité
define('RATE_LIMIT_ENABLED', getenv('RATE_LIMIT_ENABLED') !== 'false');
define('RATE_LIMIT_REQUESTS', 1000); // par heure
define('RATE_LIMIT_WINDOW', 3600); // 1 heure

// Configuration OTA
define('OTA_ENABLED', getenv('OTA_ENABLED') !== 'false');
define('OTA_TIMEOUT', 300); // 5 minutes
define('OTA_MAX_SIZE', 10 * 1024 * 1024); // 10MB

// Configuration USB
define('USB_ENABLED', getenv('USB_ENABLED') !== 'false');
define('USB_TIMEOUT', 60); // 1 minute

// Initialisation de la connexion PDO
try {
    $pdoOptions = ott_pdo_options(DB_TYPE);
    $pdoOptions[PDO::ATTR_TIMEOUT] = DB_TIMEOUT;
    $pdoOptions[PDO::ATTR_PERSISTENT] = true;

    if ($dbConfig['type'] === 'mysql' && defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
        $pdoOptions[PDO::MYSQL_ATTR_INIT_COMMAND] = "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci";
    }

    if ($dbConfig['type'] === 'pgsql' && !extension_loaded('pdo_pgsql')) {
        throw new RuntimeException('Le driver PDO PostgreSQL (pdo_pgsql) est absent');
    }

    $pdo = new PDO(
        $dbConfig['dsn'],
        DB_USER,
        DB_PASS,
        $pdoOptions
    );

    $safeDsn = preg_replace('/:(?:[^:@]+)@/', ':****@', $dbConfig['dsn']);
    error_log('[DB_CONNECTION] ✅ Connexion réussie (' . $safeDsn . ')');
} catch (Throwable $e) {
    $safeDsn = preg_replace('/:(?:[^:@]+)@/', ':****@', $dbConfig['dsn']);
    error_log('[DB_CONNECTION] ❌ Erreur: ' . $e->getMessage() . ' | DSN=' . $safeDsn);
    http_response_code(500);
    die(json_encode([
        'success' => false,
        'error' => 'Database connection failed',
        'details' => $e->getMessage(),
        'dsn' => $safeDsn
    ]));
}

// Configuration du fuseau horaire
date_default_timezone_set('Europe/Paris');

// Nettoyer le buffer de sortie pour éviter les erreurs HTML dans les réponses JSON
while (ob_get_level() > 0) {
    ob_end_clean();
}

// Redémarrer le buffer pour capturer les erreurs futures
ob_start();
