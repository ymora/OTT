<?php
/**
 * API REST V2.0 - HAPPLYZ MEDICAL OTT
 * Version complète avec JWT, multi-users, OTA, notifications, audit
 */

// Mode DEBUG activable via variable d'environnement (désactivé par défaut)
// Pour activer : mettre DEBUG_ERRORS=true dans .env ou variable d'environnement

require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';
require_once __DIR__ . '/bootstrap/notifications.php';
require_once __DIR__ . '/api/helpers.php';
require_once __DIR__ . '/api/helpers_sql.php';
require_once __DIR__ . '/api/validators.php';
require_once __DIR__ . '/api/cache.php';
require_once __DIR__ . '/api/handlers/auth.php';
// Handlers Devices (modulaires)
require_once __DIR__ . '/api/handlers/devices/utils.php';
require_once __DIR__ . '/api/handlers/devices/crud.php';
require_once __DIR__ . '/api/handlers/devices/patients.php';
require_once __DIR__ . '/api/handlers/devices/measurements.php';
require_once __DIR__ . '/api/handlers/devices/commands.php';
require_once __DIR__ . '/api/handlers/devices/alerts.php';
require_once __DIR__ . '/api/handlers/devices/logs.php';
require_once __DIR__ . '/api/handlers/devices/config.php';
require_once __DIR__ . '/api/handlers/devices/ota.php';
require_once __DIR__ . '/api/handlers/devices/reports.php';
// require_once __DIR__ . '/api/handlers/devices/demo.php'; // SUPPRIMÉ: Fonctionnalité Reset Demo retirée (dangereuse)
require_once __DIR__ . '/api/handlers/firmwares.php';
require_once __DIR__ . '/api/handlers/notifications.php';
require_once __DIR__ . '/api/handlers/usb_logs.php';
require_once __DIR__ . '/api/handlers/database_audit.php';

// Démarrer le buffer de sortie TRÈS TÔT pour capturer toute sortie HTML accidentelle (warnings, notices, etc.)
// IMPORTANT: Doit être AVANT la définition des constantes pour capturer les éventuels warnings
ob_start();

// Headers CORS (DOIT être en tout premier)
// Origines par défaut (production + développement local)
$defaultAllowedOrigins = [
    'https://ymora.github.io',
    'https://ymora.github.io/OTT',  // GitHub Pages avec basePath
    'http://localhost:3000',  // Développement local Next.js
    'http://localhost:3003',  // Autres ports locaux
    'http://localhost:5173'   // Vite dev server
];

// Origines supplémentaires via variable d'environnement
$extraOrigins = array_filter(array_map('trim', explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: '')));
$allowedOrigins = array_unique(array_merge($defaultAllowedOrigins, $extraOrigins));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

// Gestion CORS améliorée avec support basePath
if ($origin) {
    // Vérifier si l'origine correspond exactement ou commence par une origine autorisée
    $isAllowed = false;
    foreach ($allowedOrigins as $allowedOrigin) {
        if ($origin === $allowedOrigin || strpos($origin, $allowedOrigin) === 0) {
            $isAllowed = true;
            break;
        }
    }
    
    if ($isAllowed) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
    } else {
        // Si origine non autorisée, quand même autoriser pour éviter les erreurs CORS
        // (la sécurité est gérée par l'authentification JWT)
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
    }
} elseif (empty($origin)) {
    // Si pas d'origine (requête directe), autoriser toutes les origines
    header('Access-Control-Allow-Origin: *');
} else {
    // Fallback : autoriser l'origine demandée
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
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

// Définir Content-Type JSON par défaut pour toutes les routes API
// (sera surchargé pour les routes HTML/SSE spécifiques)
header('Content-Type: application/json; charset=utf-8');

// Headers de sécurité (Phase 1 - Audit de Sécurité)
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
// Content-Security-Policy - À adapter selon les besoins (permet les requêtes vers l'API)
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: http:; font-src 'self' data:;");
// Referrer-Policy
header('Referrer-Policy: strict-origin-when-cross-origin');
// Permissions-Policy
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');

// Debug mode activable via variable d'environnement
// IMPORTANT: En production, désactiver display_errors pour éviter les erreurs HTML dans les réponses JSON
if (getenv('DEBUG_ERRORS') === 'true') {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    // En production, désactiver l'affichage des erreurs pour éviter les réponses HTML
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
    // Logger les erreurs au lieu de les afficher
    ini_set('log_errors', 1);
}

// Intercepter toutes les erreurs fatales et les convertir en JSON
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // Nettoyer tout output précédent (HTML, warnings, etc.)
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        // Logger l'erreur fatale
        error_log('[SHUTDOWN] ❌ Erreur fatale détectée: ' . $error['message']);
        error_log('[SHUTDOWN] Fichier: ' . $error['file'] . ' Ligne: ' . $error['line']);
        error_log('[SHUTDOWN] Type: ' . $error['type']);
        
        // S'assurer que le Content-Type est JSON
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        
        $errorMsg = getenv('DEBUG_ERRORS') === 'true' 
            ? $error['message'] . ' dans ' . basename($error['file']) . ':' . $error['line']
            : 'Erreur serveur interne';
            
        echo json_encode([
            'success' => false,
            'error' => 'Erreur serveur interne',
            'message' => $errorMsg,
            'file' => getenv('DEBUG_ERRORS') === 'true' ? basename($error['file']) : null,
            'line' => getenv('DEBUG_ERRORS') === 'true' ? $error['line'] : null
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
});

// Intercepter les warnings et notices pour les logger sans les afficher
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    // Logger l'erreur
    error_log("[PHP Error] Type: $errno | Message: $errstr | Fichier: $errfile:$errline");
    
    // Si c'est une erreur fatale, retourner du JSON
    if (in_array($errno, [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_RECOVERABLE_ERROR])) {
        // Nettoyer tout output précédent
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode([
            'success' => false,
            'error' => 'Erreur serveur',
            'details' => getenv('DEBUG_ERRORS') === 'true' ? $errstr : 'Vérifiez les logs'
        ]);
        exit;
    }
    
    // Pour les autres erreurs, continuer le traitement normal
    return false;
}, E_ALL & ~E_DEPRECATED & ~E_STRICT);

// Répondre immédiatement aux requêtes OPTIONS (preflight)
// IMPORTANT: Les headers CORS doivent être définis AVANT cette vérification
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Pour les routes SSE, ne pas définir Content-Type (OPTIONS n'a pas de body)
    // Mais s'assurer que les headers CORS sont corrects
    http_response_code(204);
    // Ne pas définir Content-Type pour OPTIONS (pas de body)
    // Les headers de sécurité sont déjà définis avant ce point
    exit();
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

// Définir les constantes de manière sûre pour éviter les warnings
// Vérifier si les constantes existent déjà avant de les définir
if (!defined('SENDGRID_API_KEY')) {
    $sendgridApiKey = getenv('SENDGRID_API_KEY');
    define('SENDGRID_API_KEY', $sendgridApiKey !== false ? $sendgridApiKey : '');
}
if (!defined('SENDGRID_FROM_EMAIL')) {
    $sendgridFromEmail = getenv('SENDGRID_FROM_EMAIL');
    define('SENDGRID_FROM_EMAIL', $sendgridFromEmail !== false ? $sendgridFromEmail : 'noreply@happlyz.com');
}

if (!defined('TWILIO_ACCOUNT_SID')) {
    $twilioAccountSid = getenv('TWILIO_ACCOUNT_SID');
    define('TWILIO_ACCOUNT_SID', $twilioAccountSid !== false ? $twilioAccountSid : '');
}
if (!defined('TWILIO_AUTH_TOKEN')) {
    $twilioAuthToken = getenv('TWILIO_AUTH_TOKEN');
    define('TWILIO_AUTH_TOKEN', $twilioAuthToken !== false ? $twilioAuthToken : '');
}
if (!defined('TWILIO_FROM_NUMBER')) {
    $twilioFromNumber = getenv('TWILIO_FROM_NUMBER');
    define('TWILIO_FROM_NUMBER', $twilioFromNumber !== false ? $twilioFromNumber : '');
}

// define('ENABLE_DEMO_RESET', getenv('ENABLE_DEMO_RESET') === 'true'); // SUPPRIMÉ: Fonctionnalité Reset Demo retirée
define('SQL_BASE_DIR', __DIR__ . '/sql');

// ============================================================================
// CONNEXION BDD
// ============================================================================

try {
    // Log pour diagnostic (sans afficher le mot de passe)
    error_log('[DB_CONNECTION] Tentative connexion: DSN=' . $dbConfig['dsn'] . ', user=' . $dbConfig['user']);
    
    $pdo = new PDO(
        $dbConfig['dsn'],
        $dbConfig['user'],
        $dbConfig['pass'],
        ott_pdo_options($dbConfig['type'])
    );
    
    error_log('[DB_CONNECTION] ✅ Connexion réussie');
} catch(PDOException $e) {
    $errorMsg = $e->getMessage();
    error_log('[DB_CONNECTION] ❌ Erreur: ' . $errorMsg);
    error_log('[DB_CONNECTION] DSN: ' . $dbConfig['dsn']);
    error_log('[DB_CONNECTION] User: ' . $dbConfig['user']);
    
    http_response_code(500);
    die(json_encode([
        'success' => false, 
        'error' => 'Database connection failed', 
        'details' => $errorMsg,
        'hint' => 'Vérifiez que DATABASE_URL est correctement formatée: postgresql://user:password@host:port/database'
    ]));
}

// ============================================================================
// MIGRATION HANDLERS (conservés dans api.php pour compatibilité)
// ============================================================================

function handleRunMigration() {
    global $pdo;
    
    // Désactiver l'affichage des erreurs pour éviter qu'elles polluent la réponse JSON
    $oldDisplayErrors = ini_get('display_errors');
    ini_set('display_errors', 0);
    
    // Nettoyer le buffer de sortie pour éviter que les warnings PHP polluent la réponse JSON
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Définir le header JSON dès le début
    header('Content-Type: application/json; charset=utf-8');
    
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? null;
    $allowWithoutAuth = in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost'], true) || AUTH_DISABLED || getenv('ALLOW_MIGRATION_ENDPOINT') === 'true';
    $currentUser = getCurrentUser();
    $isAdmin = $currentUser && $currentUser['role_name'] === 'admin';
    
    if (!$allowWithoutAuth && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden']);
        return;
    }
    
    try {
        // Lire le body JSON pour POST ou utiliser GET/POST pour compatibilité
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $migrationFile = $body['file'] ?? $_POST['file'] ?? $_GET['file'] ?? 'schema.sql';
        
        // SÉCURITÉ: Validation stricte du nom de fichier pour éviter les injections de chemin
        // Autoriser uniquement les fichiers SQL dans le répertoire sql/
        $allowedFiles = ['schema.sql', 'base_seed.sql', 'demo_seed.sql'];
        
        // Vérifier si c'est un fichier autorisé
        if (!in_array($migrationFile, $allowedFiles, true)) {
            // Vérifier si c'est un fichier de migration valide (migration_*.sql)
            if (!preg_match('/^migration_[a-z0-9_]+\.sql$/', $migrationFile)) {
                http_response_code(400);
                echo json_encode([
                    'success' => false, 
                    'error' => 'Invalid migration file. Only schema.sql, base_seed.sql, demo_seed.sql, or migration_*.sql files are allowed.'
                ]);
                return;
            }
        }
        
        // Vérifier que le fichier existe dans sql/
        $filePath = SQL_BASE_DIR . '/' . $migrationFile;
        if (!file_exists($filePath) || !is_readable($filePath)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Migration file not found']);
            return;
        }
        
        // Protection contre path traversal: vérifier que le chemin réel est dans SQL_BASE_DIR
        $realPath = realpath($filePath);
        $basePath = realpath(SQL_BASE_DIR);
        if ($realPath === false || $basePath === false || strpos($realPath, $basePath) !== 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid file path']);
            return;
        }
        
        // Vérifier que c'est bien un fichier .sql
        if (!preg_match('/\.sql$/', $migrationFile)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Only .sql files are allowed']);
            return;
        }
        
        $logs = [];
        $startTime = microtime(true);
        
        error_log("[handleRunMigration] Début migration: {$migrationFile}");
        
        try {
            runSqlFile($pdo, $migrationFile);
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            error_log("[handleRunMigration] ✅ Migration réussie en {$duration}ms");
            
            // Enregistrer la migration dans l'historique (si la table existe)
            try {
                $currentUser = getCurrentUser();
                $userId = $currentUser ? $currentUser['id'] : null;
                
                // Vérifier si la table existe avant d'insérer
                $tableExists = $pdo->query("
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'migration_history'
                    )
                ")->fetchColumn();
                
                if ($tableExists) {
                    // Vérifier si une entrée existe déjà (non masquée)
                    $checkStmt = $pdo->prepare("
                        SELECT id FROM migration_history 
                        WHERE migration_file = :migration_file AND hidden = FALSE
                        LIMIT 1
                    ");
                    $checkStmt->execute(['migration_file' => $migrationFile]);
                    $existing = $checkStmt->fetch();
                    
                    if ($existing) {
                        // Mettre à jour l'entrée existante
                        $updateStmt = $pdo->prepare("
                            UPDATE migration_history 
                            SET executed_at = NOW(),
                                executed_by = :executed_by,
                                duration_ms = :duration_ms,
                                status = 'success',
                                error_message = NULL,
                                hidden = FALSE
                            WHERE id = :id
                        ");
                        $updateStmt->execute([
                            'id' => $existing['id'],
                            'executed_by' => $userId,
                            'duration_ms' => $duration
                        ]);
                    } else {
                        // Créer une nouvelle entrée
                        $insertStmt = $pdo->prepare("
                            INSERT INTO migration_history (migration_file, executed_by, duration_ms, status)
                            VALUES (:migration_file, :executed_by, :duration_ms, 'success')
                        ");
                        $insertStmt->execute([
                            'migration_file' => $migrationFile,
                            'executed_by' => $userId,
                            'duration_ms' => $duration
                        ]);
                    }
                    error_log("[handleRunMigration] Migration enregistrée dans l'historique");
                }
            } catch (Exception $historyErr) {
                // Ne pas faire échouer la migration si l'enregistrement de l'historique échoue
                error_log("[handleRunMigration] ⚠️ Erreur enregistrement historique (non bloquant): " . $historyErr->getMessage());
            }
            
            echo json_encode([
                'success' => true, 
                'message' => 'Migration executed',
                'logs' => [
                    "✅ Migration '{$migrationFile}' exécutée avec succès",
                    "⏱️ Durée: {$duration}ms"
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (PDOException $e) {
            $errorCode = $e->getCode();
            $errorMessage = $e->getMessage();
            $errorInfo = $pdo->errorInfo();
            
            error_log("[handleRunMigration] ❌ ERREUR PDO:");
            error_log("[handleRunMigration]   Code: {$errorCode}");
            error_log("[handleRunMigration]   Message: {$errorMessage}");
            error_log("[handleRunMigration]   PDO ErrorInfo: " . json_encode($errorInfo));
            
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'SQL Error',
                'message' => $errorMessage,
                'code' => $errorCode,
                'details' => $errorInfo,
                'logs' => [
                    "❌ ERREUR SQL lors de l'exécution de '{$migrationFile}'",
                    "Code erreur: {$errorCode}",
                    "Message: {$errorMessage}",
                    "PDO ErrorInfo: " . json_encode($errorInfo)
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch(Exception $e) {
            $errorMessage = $e->getMessage();
            $errorCode = $e->getCode();
            $previousException = $e->getPrevious();
            
            // Si c'est une RuntimeException avec une PDOException précédente, récupérer les détails PDO
            $pdoErrorInfo = null;
            if ($previousException instanceof PDOException) {
                $pdoErrorInfo = $previousException->errorInfo ?? null;
            }
            
            error_log('[handleRunMigration] ❌ ERREUR: ' . $errorMessage);
            error_log('[handleRunMigration] Code: ' . $errorCode);
            error_log('[handleRunMigration] Stack trace: ' . $e->getTraceAsString());
            if ($previousException) {
                error_log('[handleRunMigration] Exception précédente: ' . $previousException->getMessage());
            }
            
            // Construire des logs détaillés
            $logs = [
                "❌ ÉCHEC migration '{$migrationFile}'",
                "",
                "📋 Message d'erreur:",
                $errorMessage,
                "",
                "🔢 Code erreur: {$errorCode}"
            ];
            
            // Ajouter les détails PDO si disponibles
            if ($pdoErrorInfo) {
                $logs[] = "";
                $logs[] = "🔍 Détails PDO:";
                if (isset($pdoErrorInfo[0])) {
                    $logs[] = "  SQLSTATE: {$pdoErrorInfo[0]}";
                }
                if (isset($pdoErrorInfo[1])) {
                    $logs[] = "  Code: {$pdoErrorInfo[1]}";
                }
                if (isset($pdoErrorInfo[2])) {
                    $logs[] = "  Message: {$pdoErrorInfo[2]}";
                }
            }
            
            // Si le message contient des informations sur l'instruction SQL, les extraire
            if (strpos($errorMessage, 'Statement (first 500 chars)') !== false) {
                // Le message contient déjà l'instruction SQL, c'est bon
            } elseif (strpos($errorMessage, 'SQL error at statement') !== false) {
                // Le message contient déjà des détails SQL
            }
            
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Migration failed',
                'message' => $errorMessage,
                'code' => $errorCode,
                'details' => $pdoErrorInfo,
                'logs' => $logs
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    } catch (Exception $e) {
        error_log('[handleRunMigration] ❌ ERREUR GLOBALE: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Migration error',
            'message' => $e->getMessage()
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } finally {
        // Restaurer l'état précédent de display_errors
        if (isset($oldDisplayErrors)) {
            ini_set('display_errors', $oldDisplayErrors);
        }
    }
}

/**
 * GET /api.php/migrations/history
 * Récupérer l'historique des migrations exécutées
 */
function handleGetMigrationHistory() {
    global $pdo;
    
    // Nettoyer le buffer de sortie
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    
    requireAdmin();
    
    try {
        // Vérifier si la table existe
        $tableExists = $pdo->query("
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'migration_history'
            )
        ")->fetchColumn();
        
        if (!$tableExists) {
            echo json_encode([
                'success' => true,
                'history' => []
            ]);
            return;
        }
        
        $stmt = $pdo->query("
            SELECT 
                mh.*,
                u.email as executed_by_email
            FROM migration_history mh
            LEFT JOIN users u ON mh.executed_by = u.id
            ORDER BY mh.executed_at DESC
        ");
        $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'history' => $history
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
    } catch (Exception $e) {
        error_log('[handleGetMigrationHistory] Erreur: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Erreur lors de la récupération de l\'historique'
        ]);
    }
}

/**
 * POST /api.php/migrations/history/:id/hide
 * Masquer une migration du dashboard (mais la garder dans l'historique)
 */
function handleHideMigration($historyId) {
    global $pdo;
    
    // Nettoyer le buffer de sortie
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    
    requireAdmin();
    
    try {
        $stmt = $pdo->prepare("
            UPDATE migration_history 
            SET hidden = TRUE 
            WHERE id = :id
        ");
        $stmt->execute(['id' => $historyId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'success' => true,
                'message' => 'Migration masquée avec succès'
            ]);
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Migration non trouvée'
            ]);
        }
        
    } catch (Exception $e) {
        error_log('[handleHideMigration] Erreur: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Erreur lors du masquage de la migration'
        ]);
    }
}

/**
 * DELETE /api.php/migrations/file/:filename
 * Supprime un fichier de migration du serveur
 */
function handleDeleteMigrationFile($filename) {
    global $pdo;
    
    // Nettoyer le buffer de sortie
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    
    requireAdmin();
    
    // SÉCURITÉ: Validation stricte du nom de fichier
    // Autoriser uniquement les fichiers migration_*.sql
    if (!preg_match('/^migration_[a-z0-9_]+\.sql$/', $filename)) {
        http_response_code(400);
        echo json_encode([
            'success' => false, 
            'error' => 'Invalid migration file name. Only migration_*.sql files are allowed.'
        ]);
        return;
    }
    
    try {
        $filePath = SQL_BASE_DIR . '/' . $filename;
        
        // Protection contre path traversal: vérifier que le chemin réel est dans SQL_BASE_DIR
        $realPath = realpath($filePath);
        $basePath = realpath(SQL_BASE_DIR);
        if ($realPath === false || $basePath === false || strpos($realPath, $basePath) !== 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid file path']);
            return;
        }
        
        // Vérifier que le fichier existe
        if (!file_exists($filePath)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Migration file not found']);
            return;
        }
        
        // Supprimer le fichier
        if (!unlink($filePath)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to delete migration file']);
            return;
        }
        
        // Supprimer aussi l'entrée de l'historique si elle existe
        try {
            $stmt = $pdo->prepare("DELETE FROM migration_history WHERE migration_file = :filename");
            $stmt->execute(['filename' => $filename]);
        } catch (PDOException $e) {
            // Ne pas faire échouer si la table n'existe pas ou si l'entrée n'existe pas
            error_log('[handleDeleteMigrationFile] Note: Could not delete history entry: ' . $e->getMessage());
        }
        
        auditLog('migration.file_deleted', 'migration', null, null, ['filename' => $filename]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Migration file deleted successfully'
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        error_log('[handleDeleteMigrationFile] Erreur: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

/**
 * DELETE /api.php/migrations/history/:id
 * Supprimer définitivement une migration de l'historique (admin uniquement)
 */
function handleDeleteMigration($historyId) {
    global $pdo;
    
    // Nettoyer le buffer de sortie
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    
    requireAdmin();
    
    try {
        $stmt = $pdo->prepare("
            DELETE FROM migration_history 
            WHERE id = :id
        ");
        $stmt->execute(['id' => $historyId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'success' => true,
                'message' => 'Migration supprimée définitivement de l\'historique'
            ]);
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'Migration non trouvée'
            ]);
        }
        
    } catch (Exception $e) {
        error_log('[handleDeleteMigration] Erreur: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Erreur lors de la suppression de la migration'
        ]);
    }
}

function handleRepairDatabase() {
    global $pdo;
    
    // Vérifier les permissions : admin requis
    requireAdmin();
    
    $migrationFile = 'migration_repair_database.sql';
    
    error_log("[handleRepairDatabase] Début réparation base de données");
    
    try {
        // Vérifier que le fichier existe
        $filePath = SQL_BASE_DIR . '/' . $migrationFile;
        if (!file_exists($filePath) || !is_readable($filePath)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Migration file not found: ' . $migrationFile]);
            return;
        }
        
        $startTime = microtime(true);
        
        // Exécuter le script
        runSqlFile($pdo, $migrationFile);
        
        $duration = round((microtime(true) - $startTime) * 1000, 2);
        error_log("[handleRepairDatabase] ✅ Réparation réussie en {$duration}ms");
        
        // Vérifier le résultat
        $checkStmt = $pdo->query("
            SELECT 
                (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
                (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
                (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
                (SELECT COUNT(*) FROM measurements) as total_mesures,
                (SELECT COUNT(*) FROM user_notifications_preferences) as prefs_users,
                (SELECT COUNT(*) FROM patient_notifications_preferences) as prefs_patients
        ");
        $result = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'success' => true,
            'message' => 'Base de données réparée avec succès',
            'duration' => $duration,
            'verification' => $result,
            'logs' => [
                "✅ Réparation de la base de données terminée",
                "⏱️ Durée: {$duration}ms",
                "",
                "📊 Vérification:",
                "  - Utilisateurs actifs: {$result['users_actifs']}",
                "  - Patients actifs: {$result['patients_actifs']}",
                "  - Dispositifs actifs: {$result['devices_actifs']}",
                "  - Mesures totales: {$result['total_mesures']}",
                "  - Préférences notifications utilisateurs: {$result['prefs_users']}",
                "  - Préférences notifications patients: {$result['prefs_patients']}"
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
    } catch (PDOException $e) {
        $errorCode = $e->getCode();
        $errorMessage = $e->getMessage();
        $errorInfo = $pdo->errorInfo();
        
        error_log("[handleRepairDatabase] ❌ ERREUR PDO: " . $errorMessage);
        error_log("[handleRepairDatabase] Code: " . $errorCode);
        error_log("[handleRepairDatabase] PDO ErrorInfo: " . json_encode($errorInfo));
        
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'SQL Error',
            'message' => $errorMessage,
            'code' => $errorCode,
            'details' => $errorInfo,
            'logs' => [
                "❌ ERREUR lors de la réparation de la base de données",
                "Code erreur: {$errorCode}",
                "Message: {$errorMessage}"
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch(Exception $e) {
        $errorMessage = $e->getMessage();
        $errorCode = $e->getCode();
        
        error_log('[handleRepairDatabase] ❌ ERREUR: ' . $errorMessage);
        error_log('[handleRepairDatabase] Code: ' . $errorCode);
        
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database repair failed',
            'message' => $errorMessage,
            'code' => $errorCode,
            'logs' => [
                "❌ ÉCHEC de la réparation",
                "Message: {$errorMessage}"
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

function handleRunCompleteMigration() {
    global $pdo;
    
    // Vérifier les permissions : admin requis OU endpoint autorisé
    $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? null;
    $allowWithoutAuth = in_array($remoteAddr, ['127.0.0.1', '::1', 'localhost'], true) || AUTH_DISABLED || getenv('ALLOW_MIGRATION_ENDPOINT') === 'true';
    $currentUser = getCurrentUser();
    $isAdmin = $currentUser && $currentUser['role_name'] === 'admin';
    
    if (!$allowWithoutAuth && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Forbidden - Admin access required']);
        return;
    }
    
    try {
        // SQL corrigé (sans référence à colonne "result" inexistante)
        $correctedSql = "
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS \$\$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS medical_notes TEXT,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris';

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS modem_imei VARCHAR(15),
ADD COLUMN IF NOT EXISTS last_ip VARCHAR(45),
ADD COLUMN IF NOT EXISTS warranty_expiry DATE,
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS imei VARCHAR(15),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Europe/Paris',
ADD COLUMN IF NOT EXISTS last_battery FLOAT,
ADD COLUMN IF NOT EXISTS last_flowrate FLOAT,
ADD COLUMN IF NOT EXISTS last_rssi INTEGER,
ADD COLUMN IF NOT EXISTS min_flowrate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS max_flowrate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS min_battery NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS max_battery NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS min_rssi INT,
ADD COLUMN IF NOT EXISTS max_rssi INT,
ADD COLUMN IF NOT EXISTS min_max_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS usb_logs (
    id SERIAL PRIMARY KEY,
    device_identifier VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    log_line TEXT NOT NULL,
    log_source VARCHAR(50) DEFAULT 'device',
    timestamp_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usb_logs_device_identifier ON usb_logs(device_identifier);
CREATE INDEX IF NOT EXISTS idx_usb_logs_created_at ON usb_logs(created_at);

COMMENT ON TABLE usb_logs IS 'Logs USB streaming pour monitoring à distance';

ALTER TABLE device_configurations 
ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN device_configurations.gps_enabled IS 
'Active/désactive le GPS pour ce dispositif. OFF par défaut.';

COMMENT ON COLUMN device_configurations.roaming_enabled IS 
'Active/désactive l''itinérance (roaming) pour ce dispositif. ON par défaut. Si désactivé, le dispositif rejette les connexions en itinérance (REG_OK_ROAMING).';

UPDATE device_configurations 
SET gps_enabled = false 
WHERE gps_enabled IS NULL;

ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS min_battery_pct INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS max_temp_celsius INTEGER DEFAULT 50;

-- Ajouter les colonnes pour tous les paramètres configurables (pour sauvegarde en BDD)
ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS roaming_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS airflow_passes INTEGER,
ADD COLUMN IF NOT EXISTS airflow_samples_per_pass INTEGER,
ADD COLUMN IF NOT EXISTS airflow_delay_ms INTEGER,
ADD COLUMN IF NOT EXISTS watchdog_seconds INTEGER,
ADD COLUMN IF NOT EXISTS modem_boot_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS sim_ready_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS network_attach_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS modem_max_reboots INTEGER,
ADD COLUMN IF NOT EXISTS apn VARCHAR(64),
ADD COLUMN IF NOT EXISTS sim_pin VARCHAR(16),  -- Standard 3GPP: 4-8 chiffres, stocké en VARCHAR(16)
ADD COLUMN IF NOT EXISTS ota_primary_url TEXT,
ADD COLUMN IF NOT EXISTS ota_fallback_url TEXT,
ADD COLUMN IF NOT EXISTS ota_md5 VARCHAR(32);

COMMENT ON COLUMN device_configurations.airflow_passes IS 'Nombre de passes pour la mesure airflow';
COMMENT ON COLUMN device_configurations.airflow_samples_per_pass IS 'Nombre d''échantillons par passe airflow';
COMMENT ON COLUMN device_configurations.airflow_delay_ms IS 'Délai entre échantillons airflow en millisecondes';
COMMENT ON COLUMN device_configurations.watchdog_seconds IS 'Timeout watchdog en secondes';
COMMENT ON COLUMN device_configurations.modem_boot_timeout_ms IS 'Timeout démarrage modem en millisecondes';
COMMENT ON COLUMN device_configurations.sim_ready_timeout_ms IS 'Timeout préparation SIM en millisecondes';
COMMENT ON COLUMN device_configurations.network_attach_timeout_ms IS 'Timeout attachement réseau en millisecondes';
COMMENT ON COLUMN device_configurations.modem_max_reboots IS 'Nombre maximum de redémarrages modem';
COMMENT ON COLUMN device_configurations.apn IS 'APN réseau (ex: free, orange, sfr)';
COMMENT ON COLUMN device_configurations.sim_pin IS 'Code PIN SIM (4-8 chiffres)';
COMMENT ON COLUMN device_configurations.ota_primary_url IS 'URL primaire pour mise à jour OTA';
COMMENT ON COLUMN device_configurations.ota_fallback_url IS 'URL de secours pour mise à jour OTA';
COMMENT ON COLUMN device_configurations.ota_md5 IS 'MD5 attendu pour la mise à jour OTA';

DO \$\$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'firmware_versions' AND column_name = 'status') THEN
        ALTER TABLE firmware_versions DROP CONSTRAINT IF EXISTS firmwares_status_check;
        ALTER TABLE firmware_versions 
        ADD CONSTRAINT firmwares_status_check 
        CHECK (status IN ('pending', 'pending_compilation', 'compiling', 'compiled', 'error', 'active'));
    END IF;
END \$\$;

CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON devices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON patients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_measurements_timestamp ON measurements(timestamp);

CREATE OR REPLACE FUNCTION update_device_min_max()
RETURNS TRIGGER AS \$\$
BEGIN
  UPDATE devices SET
    min_flowrate = CASE 
      WHEN NEW.flowrate IS NOT NULL THEN
        LEAST(COALESCE(min_flowrate, NEW.flowrate), NEW.flowrate)
      ELSE min_flowrate
    END,
    max_flowrate = CASE 
      WHEN NEW.flowrate IS NOT NULL THEN
        GREATEST(COALESCE(max_flowrate, NEW.flowrate), NEW.flowrate)
      ELSE max_flowrate
    END,
    min_battery = CASE 
      WHEN NEW.battery IS NOT NULL THEN
        LEAST(COALESCE(min_battery, NEW.battery), NEW.battery)
      ELSE min_battery
    END,
    max_battery = CASE 
      WHEN NEW.battery IS NOT NULL THEN
        GREATEST(COALESCE(max_battery, NEW.battery), NEW.battery)
      ELSE max_battery
    END,
    min_rssi = CASE 
      WHEN NEW.signal_strength IS NOT NULL THEN
        LEAST(COALESCE(min_rssi, NEW.signal_strength), NEW.signal_strength)
      ELSE min_rssi
    END,
    max_rssi = CASE 
      WHEN NEW.signal_strength IS NOT NULL THEN
        GREATEST(COALESCE(max_rssi, NEW.signal_strength), NEW.signal_strength)
      ELSE max_rssi
    END,
    min_max_updated_at = NOW()
  WHERE id = NEW.device_id;
  
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_device_min_max ON measurements;
CREATE TRIGGER trg_update_device_min_max
AFTER INSERT ON measurements
FOR EACH ROW
WHEN (NEW.flowrate IS NOT NULL OR NEW.battery IS NOT NULL OR NEW.signal_strength IS NOT NULL)
EXECUTE FUNCTION update_device_min_max();
";
        
        // Exécuter la migration avec SQL corrigé directement
        $startTime = microtime(true);
        error_log('[handleRunCompleteMigration] Début de la migration complète (SQL corrigé intégré)...');
        
        $logs = [];
        $logs[] = "🚀 Début de la migration complète...";
        
        try {
            // Diviser le SQL en instructions pour un meilleur logging
            $statements = array_filter(
                array_map('trim', explode(';', $correctedSql)),
                function($stmt) { return !empty($stmt) && !preg_match('/^\s*--/', $stmt); }
            );
            
            $logs[] = "📝 Nombre d'instructions SQL: " . count($statements);
            error_log('[handleRunCompleteMigration] Nombre d\'instructions: ' . count($statements));
            
            foreach ($statements as $index => $statement) {
                if (empty(trim($statement))) continue;
                
                $stmtPreview = substr($statement, 0, 80);
                error_log("[handleRunCompleteMigration] Exécution instruction " . ($index + 1) . "/" . count($statements) . ": {$stmtPreview}...");
                
                try {
                    $pdo->exec($statement);
                    $logs[] = "✅ Instruction " . ($index + 1) . "/" . count($statements) . " exécutée";
                } catch (PDOException $stmtError) {
                    $errorCode = $stmtError->getCode();
                    $errorMessage = $stmtError->getMessage();
                    $errorInfo = $pdo->errorInfo();
                    
                    $logs[] = "❌ ERREUR à l'instruction " . ($index + 1) . "/" . count($statements);
                    $logs[] = "   Code: {$errorCode}";
                    $logs[] = "   Message: {$errorMessage}";
                    $logs[] = "   Instruction: " . substr($statement, 0, 150);
                    
                    error_log("[handleRunCompleteMigration] ❌ ERREUR SQL à l'instruction " . ($index + 1) . ":");
                    error_log("[handleRunCompleteMigration]   Code: {$errorCode}");
                    error_log("[handleRunCompleteMigration]   Message: {$errorMessage}");
                    error_log("[handleRunCompleteMigration]   PDO ErrorInfo: " . json_encode($errorInfo));
                    error_log("[handleRunCompleteMigration]   Instruction: " . substr($statement, 0, 500));
                    
                    throw new RuntimeException(
                        "SQL error at statement " . ($index + 1) . "/" . count($statements) . 
                        ": [{$errorCode}] {$errorMessage}",
                        $errorCode,
                        $stmtError
                    );
                }
            }
            
            $duration = round((microtime(true) - $startTime) * 1000, 2);
            error_log('[handleRunCompleteMigration] ✅ Migration complète terminée avec succès en ' . $duration . 'ms');
            $logs[] = "✅ Migration terminée en {$duration}ms";
            
            // Vérifier le résultat
            $checkStmt = $pdo->query("
                SELECT 
                    'MIGRATION COMPLÈTE' as status,
                    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
                    (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
                    (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
                    (SELECT COUNT(*) FROM device_configurations WHERE gps_enabled IS NOT NULL) as configs_gps_ready,
                    (SELECT COUNT(*) FROM usb_logs) as usb_logs_count
            ");
            $result = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'message' => 'Migration complète exécutée avec succès',
                'verification' => $result,
                'logs' => $logs
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            
        } catch (PDOException $e) {
            $errorCode = $e->getCode();
            $errorMessage = $e->getMessage();
            $errorInfo = $pdo->errorInfo();
            
            $logs[] = "❌ ERREUR PDO:";
            $logs[] = "   Code: {$errorCode}";
            $logs[] = "   Message: {$errorMessage}";
            $logs[] = "   PDO ErrorInfo: " . json_encode($errorInfo);
            
            error_log('[handleRunCompleteMigration] ❌ ERREUR PDO: ' . $errorMessage);
            error_log('[handleRunCompleteMigration] Code: ' . $errorCode);
            error_log('[handleRunCompleteMigration] PDO ErrorInfo: ' . json_encode($errorInfo));
            
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'SQL Error',
                'message' => $errorMessage,
                'code' => $errorCode,
                'details' => $errorInfo,
                'logs' => $logs
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch(Exception $e) {
            $errorMessage = $e->getMessage();
            $errorCode = $e->getCode();
            
            $logs[] = "❌ ERREUR: {$errorMessage}";
            $logs[] = "   Code: {$errorCode}";
            
            error_log('[handleRunCompleteMigration] ❌ ERREUR: ' . $errorMessage);
            error_log('[handleRunCompleteMigration] Code: ' . $errorCode);
            error_log('[handleRunCompleteMigration] Stack trace: ' . $e->getTraceAsString());
            
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Migration failed',
                'message' => $errorMessage,
                'code' => $errorCode,
                'logs' => $logs
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
    } catch (Exception $e) {
        // Catch pour le try externe (ligne 402)
        $errorMessage = $e->getMessage();
        $errorCode = $e->getCode();
        
        error_log('[handleRunCompleteMigration] ❌ ERREUR externe: ' . $errorMessage);
        error_log('[handleRunCompleteMigration] Code: ' . $errorCode);
        error_log('[handleRunCompleteMigration] Stack trace: ' . $e->getTraceAsString());
        
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Migration failed',
            'message' => $errorMessage,
            'code' => $errorCode
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

function handleMigrateFirmwareStatus() {
    global $pdo;
    requireAdmin();
    
    try {
        $results = [];
        
        // 1. Vérifier si la colonne status existe
        $checkStmt = $pdo->query("
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = 'firmware_versions'
                AND column_name = 'status'
            )
        ");
        $columnExists = $checkStmt->fetchColumn();
        $columnExists = ($columnExists === true || $columnExists === 't' || $columnExists === 1 || $columnExists === '1');
        
        if (!$columnExists) {
            $pdo->exec("
                ALTER TABLE firmware_versions 
                ADD COLUMN status VARCHAR(50) DEFAULT 'compiled' 
                CHECK (status IN ('pending_compilation', 'compiling', 'compiled', 'error'))
            ");
            $results['status_column'] = 'added';
        } else {
            $results['status_column'] = 'already_exists';
        }
        
        // 2. Mettre à jour les firmwares existants sans status
        $updateCount = $pdo->exec("UPDATE firmware_versions SET status = 'compiled' WHERE status IS NULL");
        $results['updated_count'] = intval($updateCount);
        
        // 3. Compter les firmwares
        $countStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $countBefore = intval($countStmt->fetchColumn());
        $results['firmwares_before'] = $countBefore;
        
        // 4. Supprimer tous les firmwares fictifs
        if ($countBefore > 0) {
            $deleteCount = $pdo->exec("DELETE FROM firmware_versions");
            $results['deleted_count'] = intval($deleteCount);
            
            // Vérification finale
            $finalCountStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
            $finalCount = intval($finalCountStmt->fetchColumn());
            $results['firmwares_after'] = $finalCount;
        } else {
            $results['deleted_count'] = 0;
            $results['firmwares_after'] = 0;
        }
        
        auditLog('firmware_db.initialized', 'firmware', null, null, $results);
        
        echo json_encode([
            'success' => true,
            'message' => 'Base de données firmware initialisée avec succès',
            'results' => $results
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handleClearFirmwares() {
    global $pdo;
    requireAdmin();
    
    try {
        $countStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $countBefore = intval($countStmt->fetchColumn());
        
        $pdo->exec("DELETE FROM firmware_versions");
        
        $finalCountStmt = $pdo->query("SELECT COUNT(*) FROM firmware_versions");
        $finalCount = intval($finalCountStmt->fetchColumn());
        
        auditLog('firmware_db.cleared', 'firmware', null, ['count' => $countBefore], ['count' => $finalCount]);
        
        echo json_encode([
            'success' => true,
            'deleted_count' => $countBefore,
            'remaining_count' => $finalCount
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

/**
 * Nettoie récursivement les données pour les rendre compatibles avec json_encode
 * Convertit les ressources, objets et types non supportés en types JSON-compatibles
 * 
 * @param mixed $data Les données à nettoyer
 * @param int $depth Profondeur de récursion (pour éviter les boucles infinies)
 * @return mixed Les données nettoyées
 */
function sanitizeForJson($data, $depth = 0) {
    // Protection contre les boucles infinies
    if ($depth > 50) {
        return null;
    }
    
    if ($data === null) {
        return null;
    }
    
    // Ressources (ne peuvent pas être encodées en JSON)
    if (is_resource($data)) {
        return null;
    }
    
    // Objets
    if (is_object($data)) {
        // Si c'est un objet DateTime ou similaire, convertir en chaîne
        if ($data instanceof DateTime || $data instanceof DateTimeInterface) {
            return $data->format('Y-m-d H:i:s');
        }
        // Si c'est un objet PDOStatement ou autre ressource d'objet, ignorer
        if ($data instanceof PDOStatement) {
            return null;
        }
        // Si c'est un objet stdClass ou autre, convertir en tableau
        if (method_exists($data, '__toString')) {
            try {
                return (string) $data;
            } catch (Exception $e) {
                // Si __toString() échoue, convertir en tableau
                $data = (array) $data;
            }
        } else {
            // Sinon, convertir en tableau
            $data = (array) $data;
        }
    }
    
    // Tableaux
    if (is_array($data)) {
        $result = [];
        foreach ($data as $key => $value) {
            // Nettoyer récursivement chaque valeur
            $cleanKey = is_string($key) ? $key : (string) $key;
            try {
                $cleanedValue = sanitizeForJson($value, $depth + 1);
                $result[$cleanKey] = $cleanedValue;
            } catch (Exception $e) {
                // Si le nettoyage échoue, ignorer cette clé ou mettre null
                $result[$cleanKey] = null;
            }
        }
        return $result;
    }
    
    // Chaînes de caractères - s'assurer qu'elles sont en UTF-8 valide
    if (is_string($data)) {
        // Vérifier et nettoyer l'encodage UTF-8
        if (!mb_check_encoding($data, 'UTF-8')) {
            $data = mb_convert_encoding($data, 'UTF-8', 'UTF-8');
        }
        // Nettoyer les caractères de contrôle (sauf les caractères valides comme \n, \r, \t)
        $data = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $data);
        return $data;
    }
    
    // Types scalaires (int, float, bool) - déjà compatibles JSON
    if (is_int($data) || is_float($data) || is_bool($data)) {
        return $data;
    }
    
    // Fallback: convertir en chaîne
    try {
        return (string) $data;
    } catch (Exception $e) {
        // Si la conversion échoue, retourner null
        return null;
    } catch (Throwable $e) {
        // Gérer aussi les Throwable (PHP 7+)
        return null;
    }
}


       function handleHealthCheck() {
           global $pdo;
           
           // Nettoyer le buffer de sortie AVANT tout header
           if (ob_get_level() > 0) {
               ob_clean();
           }
           
           // Définir les headers CORS et JSON
           header('Content-Type: application/json; charset=utf-8');
           header('Access-Control-Allow-Origin: *');
           header('Access-Control-Allow-Methods: GET, OPTIONS');
           header('Access-Control-Allow-Headers: Content-Type, Authorization');
           
           // Gérer les requêtes OPTIONS (preflight)
           if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
               http_response_code(200);
               exit;
           }
           
           $health = [
               'success' => true,
               'service' => 'OTT API',
               'version' => '3.3.0',
               'status' => 'online',
               'php_version' => PHP_VERSION,
               'timestamp' => date('c'),
               'database' => 'unknown',
               'modules' => []
           ];
           
           // Test connexion BDD
           try {
               $dbConfig = ott_database_config();
               if ($dbConfig === null) {
                   $health['database'] = 'not_configured';
               } else {
                   $health['database'] = 'configured';
                   // Test connexion
                   $testPdo = new PDO(
                       $dbConfig['dsn'],
                       $dbConfig['user'],
                       $dbConfig['pass'],
                       ott_pdo_options($dbConfig['type'])
                   );
                   $testPdo->query('SELECT 1');
                   $health['database'] = 'connected';
               }
           } catch(Throwable $e) {
               $health['database'] = 'error: ' . $e->getMessage();
               $health['status'] = 'degraded';
           }
           
           // Vérifier modules
           $modules = [
               'api/helpers.php',
               'api/handlers/auth.php',
               'api/handlers/devices/crud.php',
               'api/handlers/firmwares/crud.php',
               'api/handlers/notifications.php'
           ];
           
           foreach ($modules as $module) {
               $health['modules'][$module] = file_exists(__DIR__ . '/' . $module) ? 'loaded' : 'missing';
           }
           
           // Si modules manquants, status = degraded
           if (in_array('missing', $health['modules'], true)) {
               $health['status'] = 'degraded';
           }
           
           http_response_code($health['status'] === 'online' ? 200 : 503);
           echo json_encode($health, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
           exit;
       }

// ============================================================================
// ROUTING
// ============================================================================

function parseRequestPath() {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    
    // Si on est dans api.php directement, extraire le path
    if (strpos($requestUri, '/api.php') !== false) {
        $path = str_replace('/api.php', '', $requestUri);
        $path = strtok($path, '?'); // Supprimer query string
    } else {
        // Sinon, utiliser REQUEST_URI directement
        $path = parse_url($requestUri, PHP_URL_PATH);
        // Si le path contient encore api.php, le supprimer
        if (strpos($path, '/api.php') !== false) {
            $path = str_replace('/api.php', '', $path);
        }
    }
    
    // Normaliser le path : supprimer les espaces, normaliser les slashes
    $path = trim($path);
    $path = '/' . ltrim($path, '/');
    $path = rtrim($path, '/'); // Supprimer trailing slash sauf pour la racine
    if ($path === '/') {
        $path = '';
    }
    
    return $path;
}

$path = parseRequestPath();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// Debug pour database-audit (toujours actif pour ce endpoint)
if (strpos($path, 'database-audit') !== false || strpos($_SERVER['REQUEST_URI'] ?? '', 'database-audit') !== false) {
    error_log('[ROUTER DEBUG] Path: ' . $path . ' | REQUEST_URI: ' . ($_SERVER['REQUEST_URI'] ?? 'N/A') . ' | Method: ' . $method . ' | SCRIPT_NAME: ' . ($_SERVER['SCRIPT_NAME'] ?? 'N/A'));
}

// Debug conditionnel pour certaines routes (seulement si DEBUG_ERRORS est activé)
if (getenv('DEBUG_ERRORS') === 'true') {
    if (strpos($path, 'test/create') !== false) {
        error_log('[DEBUG] Path: ' . $path . ' | Method: ' . $method);
    }
}

// Définir Content-Type selon le type de route
// ATTENTION: Pour SSE et /docs/, les headers sont définis dans les handlers
if ($method !== 'OPTIONS') {
    $isSSERoute = preg_match('#/firmwares/compile/(\d+)$#', $path) && $method === 'GET';
    $isDocsRoute = preg_match('#^/docs/#', $path) && $method === 'GET';
    $isMigratePage = preg_match('#^/migrate\.html$#', $path) && $method === 'GET';
    if (!$isSSERoute && !$isDocsRoute && !$isMigratePage) {
        header('Content-Type: application/json; charset=utf-8');
    }
}

// Documentation / Markdown files (doit être en premier pour éviter les conflits)
// Endpoint pour régénérer le fichier de suivi du temps
if($method === 'POST' && (preg_match('#^/docs/regenerate-time-tracking/?$#', $path) || preg_match('#/docs/regenerate-time-tracking#', $path))) {
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[ROUTER] Route /docs/regenerate-time-tracking matchée - Path: ' . $path . ' Method: ' . $method);
    }
    requireAuth();
    requireAdmin();
    
    // Générer directement dans public/ (fichier principal utilisé par le dashboard et les scripts)
    $publicPath = __DIR__ . '/../public/SUIVI_TEMPS_FACTURATION.md';
    $publicDir = dirname($publicPath);
    
    // Créer le dossier public/ s'il n'existe pas
    if (!is_dir($publicDir)) {
        @mkdir($publicDir, 0755, true);
    }
    
    // Utiliser le script bash qui génère directement dans public/
    $bashScript = __DIR__ . '/scripts/deploy/generate_time_tracking.sh';
    
    if (!file_exists($bashScript)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Script de génération non trouvé: scripts/deploy/generate_time_tracking.sh'
        ]);
        exit;
    }
    
    // Exécuter le script bash (fonctionne sur Windows avec Git Bash/WSL ou Linux)
    $output = [];
    $returnVar = 0;
    $command = 'bash "' . $bashScript . '"';
    exec($command . ' 2>&1', $output, $returnVar);
    
    // Vérifier que le fichier a été créé dans public/
    if (file_exists($publicPath)) {
        auditLog('admin.regenerate_time_tracking', 'admin', null, null, ['file' => 'SUIVI_TEMPS_FACTURATION.md']);
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => true,
            'message' => 'Fichier SUIVI_TEMPS_FACTURATION.md régénéré avec succès',
            'file' => 'SUIVI_TEMPS_FACTURATION.md',
            'path' => 'public/SUIVI_TEMPS_FACTURATION.md',
            'output' => implode("\n", $output)
        ]);
    } else {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Erreur lors de la génération du fichier',
            'return_code' => $returnVar,
            'output' => implode("\n", $output)
        ]);
    }
    exit;
    
} elseif(preg_match('#^/docs/([^/]+\.md)$#', $path, $m) && $method === 'GET') {
    $fileName = $m[1];
    
    // SÉCURITÉ: Valider le nom de fichier pour éviter path traversal
    if (strpos($fileName, '..') !== false || strpos($fileName, '/') !== false || strpos($fileName, '\\') !== false) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Invalid file name.']);
        exit;
    }
    
    // Chercher le fichier dans plusieurs emplacements possibles
    // Ordre optimisé : public/ en premier (fichiers statiques) pour meilleure performance
    $possiblePaths = [
        __DIR__ . '/../public/' . $fileName,          // Dossier public (prioritaire pour performance)
        __DIR__ . '/' . $fileName,                    // Racine du projet API
        __DIR__ . '/../' . $fileName,                 // Racine du projet (parent)
    ];
    
    // SÉCURITÉ: Ajouter scripts/ uniquement pour SUIVI_TEMPS_FACTURATION.md spécifiquement
    if ($fileName === 'SUIVI_TEMPS_FACTURATION.md') {
        $possiblePaths[] = __DIR__ . '/../scripts/' . $fileName;
    }
    
    $filePath = null;
    foreach ($possiblePaths as $path) {
        if (file_exists($path) && is_readable($path)) {
            $filePath = $path;
            break;
        }
    }
    
    // Debug
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[ROUTER] Route /docs/ matchée - Path: ' . $path . ' File: ' . $fileName);
    }
    
    // Si c'est le fichier de suivi du temps et qu'il n'existe pas, essayer de le générer
    if (!$filePath && $fileName === 'SUIVI_TEMPS_FACTURATION.md') {
        // Utiliser le script bash qui génère directement dans public/
        $bashScript = __DIR__ . '/../scripts/deploy/generate_time_tracking.sh';
        
        if (file_exists($bashScript)) {
            // Essayer de générer le fichier automatiquement
            $command = 'bash "' . $bashScript . '"';
            $output = [];
            $returnVar = 0;
            exec($command . ' 2>&1', $output, $returnVar);
            
            // Chercher à nouveau dans public/ après génération
            $publicPath = __DIR__ . '/../public/' . $fileName;
            if (file_exists($publicPath) && is_readable($publicPath)) {
                $filePath = $publicPath;
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[ROUTER] Fichier SUIVI_TEMPS_FACTURATION.md généré automatiquement: ' . $filePath);
                }
            } else {
                if (getenv('DEBUG_ERRORS') === 'true') {
                    error_log('[ROUTER] Échec génération automatique: ' . implode("\n", $output));
                }
            }
        } else {
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[ROUTER] Script de génération non trouvé: scripts/deploy/generate_time_tracking.sh');
            }
        }
    }
    
    // Si le fichier existe maintenant, le servir
    if ($filePath && file_exists($filePath) && is_readable($filePath)) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: no-cache, must-revalidate');
        readfile($filePath);
        exit;
    } else {
        // Si c'est le fichier de suivi du temps, retourner un contenu par défaut ou une erreur explicite
        if ($fileName === 'SUIVI_TEMPS_FACTURATION.md') {
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log('[ROUTER] Fichier SUIVI_TEMPS_FACTURATION.md non trouvé après génération');
            }
            
            // Retourner un message d'erreur avec instructions
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false, 
                'error' => 'File not found. The file SUIVI_TEMPS_FACTURATION.md could not be generated automatically.',
                'fileName' => $fileName,
                'hint' => 'Please run manually: scripts/deploy/generate_time_tracking.sh or scripts/audit/AUDIT_COMPLET_AUTOMATIQUE.ps1',
                'possiblePaths' => $possiblePaths,
                'os' => PHP_OS,
                'isWindows' => strtoupper(substr(PHP_OS, 0, 3)) === 'WIN'
            ]);
        } else {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false, 
                'error' => 'File not found.',
                'fileName' => $fileName
            ]);
        }
        exit;
    }

// Migration page HTML - doit être très tôt pour éviter les conflits
} elseif($method === 'GET' && ($path === '/migrate.html' || preg_match('#^/migrate\.html$#', $path))) {
    $filePath = __DIR__ . '/public/migrate.html';
    if (file_exists($filePath)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($filePath);
        exit;
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Migration page not found']);
        exit;
    }
} elseif($method === 'GET' && ($path === '/diagnostic-measurements.html' || preg_match('#^/diagnostic-measurements\.html$#', $path))) {
    $filePath = __DIR__ . '/public/diagnostic-measurements.html';
    if (file_exists($filePath)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($filePath);
        exit;
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Diagnostic page not found']);
        exit;
    }

// Auth
} elseif(preg_match('#/auth/login$#', $path) && $method === 'POST') {
    handleLogin();
} elseif(preg_match('#/auth/me$#', $path) && $method === 'GET') {
    handleGetMe();
} elseif(preg_match('#/auth/refresh$#', $path) && $method === 'POST') {
    handleRefreshToken();

// Users
} elseif(preg_match('#/users$#', $path) && $method === 'GET') {
    handleGetUsers();
} elseif(preg_match('#/users$#', $path) && $method === 'POST') {
    handleCreateUser();
} elseif(preg_match('#/users/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateUser($m[1]);
} elseif(preg_match('#/users/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteUser($m[1]);
} elseif(preg_match('#/users/(\d+)$#', $path, $m) && $method === 'PATCH') {
    handleRestoreUser($m[1]);
} elseif(preg_match('#/users/(\d+)/notifications$#', $path, $m) && $method === 'GET') {
    handleGetUserNotifications($m[1]);
} elseif(preg_match('#/users/(\d+)/notifications$#', $path, $m) && $method === 'PUT') {
    handleUpdateUserNotifications($m[1]);

// Roles
} elseif(preg_match('#/roles$#', $path) && $method === 'GET') {
    handleGetRoles();
} elseif(preg_match('#/permissions$#', $path) && $method === 'GET') {
    handleGetPermissions();

// Devices (API V1 compatible + V2)
// Route spécifique pour créer dispositifs fictifs (doit être avant /devices POST)
} elseif(($path === '/devices/test/create' || preg_match('#^/devices/test/create/?$#', $path) || preg_match('#/devices/test/create#', $path)) && $method === 'POST') {
    error_log('[ROUTER] ✅ Route /devices/test/create matchée - Path: ' . $path . ' Method: ' . $method . ' URI: ' . ($_SERVER['REQUEST_URI'] ?? 'N/A'));
    handleCreateTestDevices();
} elseif(preg_match('#/devices$#', $path) && $method === 'GET') {
    handleGetDevices();
} elseif(preg_match('#/devices$#', $path) && $method === 'POST') {
    handleRestoreOrCreateDevice();
} elseif(preg_match('#/devices/restore$#', $path) && $method === 'POST') {
    handleRestoreOrCreateDevice();
} elseif(preg_match('#/devices/measurements$#', $path) && $method === 'POST') {
    handlePostMeasurement();
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'POST') {
    handleCreateDeviceCommand($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands$#', $path, $m) && $method === 'GET') {
    handleGetDeviceCommands($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/commands/pending$#', $path, $m) && $method === 'GET') {
    handleGetPendingCommands($m[1]);
} elseif(preg_match('#/devices/commands/ack$#', $path) && $method === 'POST') {
    handleAcknowledgeCommand();
} elseif(preg_match('#/devices/commands$#', $path) && $method === 'GET') {
    handleListAllCommands();
} elseif(preg_match('#/devices/(\d+)/history$#', $path, $m) && $method === 'GET') {
    handleGetDeviceHistory($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'GET') {
    // GET pour récupérer un seul dispositif
    handleGetDevice($m[1]);
} elseif(preg_match('#/device/(\d+)$#', $path, $m) && $method === 'GET') {
    // Compatibilité ancienne route
    handleGetDeviceHistory($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdateDevice($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'PATCH') {
    // PATCH pour mettre à jour un dispositif (pas pour restaurer)
    handleUpdateDevice($m[1]);
} elseif(preg_match('#/devices/(\d+)/restore$#', $path, $m) && $method === 'PATCH') {
    // Route spécifique pour restaurer un dispositif archivé
    handleRestoreDevice($m[1]);
} elseif(preg_match('#/devices/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteDevice($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'GET') {
    handleGetDeviceConfig($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/config$#', $path, $m) && $method === 'PUT') {
    handleUpdateDeviceConfig($m[1]);
} elseif(preg_match('#/devices/([0-9A-Za-z]+)/ota$#', $path, $m) && $method === 'POST') {
    handleTriggerOTA($m[1]);

// Firmwares
// IMPORTANT: Vérifier les routes spécifiques AVANT les routes génériques
} elseif($method === 'POST' && preg_match('#^/firmwares/upload-ino/?$#', $path)) {
    // Log de debug pour vérifier que la route est bien matchée
    if (getenv('DEBUG_ERRORS') === 'true') {
        error_log('[ROUTER] Route upload-ino matchée - Path: ' . $path . ' Method: ' . $method);
    }
    handleUploadFirmwareIno();
} elseif($method === 'GET' && preg_match('#^/firmwares/check-version/([^/]+)$#', $path, $matches)) {
    handleCheckFirmwareVersion($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/debug-logs/(\d+)$#', $path, $matches)) {
    require_once __DIR__ . '/api/handlers/firmwares/debug_logs.php';
    handleGetCompileDebugLogs($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/compile/(\d+)$#', $path, $matches)) {
    error_log('[ROUTER] Route GET /firmwares/compile/' . $matches[1] . ' matchée - Path: ' . $path);
    // Nettoyer le buffer AVANT d'appeler handleCompileFirmware pour les routes SSE
    // Le handler gérera lui-même les headers SSE
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    handleCompileFirmware($matches[1]);
    exit; // Important: arrêter l'exécution après SSE pour éviter tout output supplémentaire
} elseif($method === 'GET' && preg_match('#^/firmwares/(\d+)/download$#', $path, $matches)) {
    handleDownloadFirmware($matches[1]);
} elseif($method === 'GET' && preg_match('#^/firmwares/(\d+)/ino/?$#', $path, $matches)) {
    // Log de debug
    error_log('[ROUTER] Route GET /firmwares/{id}/ino matchée - Path: ' . $path . ' ID: ' . ($matches[1] ?? 'N/A'));
    handleGetFirmwareIno($matches[1]);
} elseif($method === 'PUT' && preg_match('#^/firmwares/(\d+)/ino/?$#', $path, $matches)) {
    // Vérifier que c'est bien la bonne route avant d'appeler
    if (isset($matches[1]) && is_numeric($matches[1])) {
        handleUpdateFirmwareIno($matches[1]);
    } else {
        error_log('[ROUTER] Erreur: ID invalide dans PUT /firmwares/{id}/ino - Path: ' . $path);
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Invalid firmware ID']);
    }
} elseif($method === 'GET' && preg_match('#^/firmwares$#', $path)) {
    handleGetFirmwares();
} elseif($method === 'POST' && preg_match('#^/firmwares$#', $path)) {
    handleUploadFirmware();
} elseif($method === 'DELETE' && preg_match('#^/firmwares/(\d+)$#', $path, $matches)) {
    handleDeleteFirmware($matches[1]);

// Notifications
} elseif(preg_match('#/notifications/preferences$#', $path) && $method === 'GET') {
    handleGetNotificationPreferences();
} elseif(preg_match('#/notifications/preferences$#', $path) && $method === 'PUT') {
    handleUpdateNotificationPreferences();
} elseif(preg_match('#/notifications/test$#', $path) && $method === 'POST') {
    handleTestNotification();
} elseif(preg_match('#/notifications/queue$#', $path) && $method === 'GET') {
    handleGetNotificationsQueue();
} elseif(preg_match('#/notifications/process$#', $path) && $method === 'POST') {
    handleProcessNotificationsQueue();

// USB Logs (pour monitoring à distance)
} elseif(preg_match('#^/usb-logs(/.*)?$#', $path)) {
    // Nettoyer le buffer de sortie AVANT tout header
    if (ob_get_level() > 0) {
        ob_clean();
    }
    
    // Accepter les requêtes même sans authentification pour les logs USB locaux
    // getCurrentUser() peut retourner null, c'est acceptable
    try {
        $currentUser = getCurrentUser();
        $userId = $currentUser ? $currentUser['id'] : null;
        $userRole = $currentUser ? $currentUser['role_name'] : null;
    } catch (Exception $e) {
        // Si getCurrentUser() échoue, continuer avec userId null
        error_log("Warning: getCurrentUser() failed for /usb-logs: " . $e->getMessage());
        $currentUser = null;
        $userId = null;
        $userRole = null;
    }
    
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    
    // Le Content-Type sera défini dans handleUsbLogsRequest()
    echo handleUsbLogsRequest($pdo, $method, $path, $body, $_GET, $userId, $userRole);

// Migration complète - Route pour exécuter la migration complète
} elseif(($method === 'POST' || $method === 'GET') && ($path === '/admin/migrate-complete' || preg_match('#^/admin/migrate-complete/?$#', $path))) {
    error_log('[ROUTER] ✅ Route /admin/migrate-complete matchée - Path: ' . $path . ' Method: ' . $method);
    handleRunCompleteMigration();
    exit;

// Admin tools - IMPORTANT: Routes spécifiques avant routes génériques
} elseif($method === 'GET' && ($path === '/admin/diagnostic/measurements' || preg_match('#^/admin/diagnostic/measurements/?$#', $path))) {
    // Route pour le diagnostic des mesures
    error_log('[ROUTER] ✅ Route /admin/diagnostic/measurements matchée - Path: ' . $path . ' Method: ' . $method);
    handleDiagnosticMeasurements();
    exit;

// Health check
} elseif(preg_match('#/health$#', $path) && $method === 'GET') {
    handleHealthCheck();
} elseif(preg_match('#/admin/diagnostic/measurements$#', $path) && $method === 'GET') {
    handleDiagnosticMeasurements();

// Audit - IMPORTANT: database-audit AVANT /audit pour éviter les conflits
} elseif(($path === '/admin/database-audit' || preg_match('#^/admin/database-audit/?$#', $path) || preg_match('#/admin/database-audit#', $path)) && $method === 'GET') {
    error_log('[ROUTER] ✅ Route /admin/database-audit matchée - Path: ' . $path . ' Method: ' . $method . ' | REQUEST_URI: ' . ($_SERVER['REQUEST_URI'] ?? 'N/A'));
    handleDatabaseAudit();
    exit;
} elseif(($path === '/audit' || preg_match('#^/audit/?$#', $path)) && $method === 'GET') {
    handleGetAuditLogs();
} elseif(($path === '/audit' || preg_match('#^/audit/?$#', $path)) && $method === 'DELETE') {
    handleClearAuditLogs();

// Logs
} elseif(preg_match('#/logs$#', $path) && $method === 'GET') {
    handleGetLogs();
} elseif(preg_match('#/logs$#', $path) && $method === 'POST') {
    handlePostLog();

// Alerts (V1 compatible)
} elseif(preg_match('#/alerts$#', $path) && $method === 'GET') {
    handleGetAlerts();
} elseif(preg_match('#/measurements/latest$#', $path) && $method === 'GET') {
    handleGetLatestMeasurements();
} elseif(preg_match('#/measurements/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeleteMeasurement($m[1]);
} elseif(preg_match('#/measurements/(\d+)$#', $path, $m) && $method === 'PATCH') {
    handleRestoreMeasurement($m[1]);

// Patients (V1 compatible)
} elseif(preg_match('#/patients$#', $path) && $method === 'GET') {
    handleGetPatients();
} elseif(preg_match('#/patients$#', $path) && $method === 'POST') {
    handleCreatePatient();
} elseif(preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'PUT') {
    handleUpdatePatient($m[1]);
} elseif(preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'DELETE') {
    handleDeletePatient($m[1]);
} elseif(preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'PATCH') {
    handleRestorePatient($m[1]);
} elseif(preg_match('#/patients/(\d+)/notifications$#', $path, $m) && $method === 'GET') {
    handleGetPatientNotifications($m[1]);
} elseif(preg_match('#/patients/(\d+)/notifications$#', $path, $m) && $method === 'PUT') {
    handleUpdatePatientNotifications($m[1]);

// Reports
} elseif(preg_match('#/reports/overview$#', $path) && $method === 'GET') {
    handleGetReportsOverview();

// Migration & Admin (endpoints de maintenance - admin uniquement)
// IMPORTANT: Routes migrations AVANT /migrate pour éviter les conflits
} elseif($method === 'GET' && ($path === '/migrations/history' || preg_match('#^/migrations/history/?$#', $path))) {
    handleGetMigrationHistory();
} elseif($method === 'POST' && preg_match('#^/migrations/history/(\d+)/hide/?$#', $path, $m)) {
    handleHideMigration($m[1]);
} elseif($method === 'DELETE' && preg_match('#^/migrations/file/([^/]+)$#', $path, $m)) {
    handleDeleteMigrationFile($m[1]);
} elseif($method === 'DELETE' && preg_match('#^/migrations/history/(\d+)/?$#', $path, $m)) {
    handleDeleteMigration($m[1]);
} elseif(preg_match('#/migrate$#', $path) && $method === 'POST') {
    // Nettoyer le buffer AVANT d'appeler handleRunMigration pour éviter que les warnings polluent la réponse
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    handleRunMigration();
} elseif(preg_match('#/admin/repair-database$#', $path) && $method === 'POST') {
    handleRepairDatabase();
} elseif(preg_match('#/migrate/firmware-status$#', $path) && $method === 'POST') {
    handleMigrateFirmwareStatus();
} elseif(preg_match('#/admin/clear-firmwares$#', $path) && $method === 'POST') {
    handleClearFirmwares();
} elseif(preg_match('#/admin/init-firmware-db$#', $path) && $method === 'POST') {
    // Alias pour handleMigrateFirmwareStatus (même fonctionnalité)
    handleMigrateFirmwareStatus();
} elseif(preg_match('#/docs/openapi\.json$#', $path) && $method === 'GET') {
    // Endpoint OpenAPI/Swagger
    header('Content-Type: application/json');
    $openapiFile = __DIR__ . '/api/openapi.json';
    if (file_exists($openapiFile)) {
        readfile($openapiFile);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'OpenAPI spec not found']);
    }
    exit;
} else {
    // Log de debug conditionnel (seulement si DEBUG_ERRORS est activé)
    if (getenv('DEBUG_ERRORS') === 'true') {
        $debugInfo = [
            'path' => $path,
            'method' => $method,
            'uri' => $_SERVER['REQUEST_URI'] ?? 'N/A'
        ];
        error_log("[API Router] Path not matched: " . json_encode($debugInfo));
    }
    
    http_response_code(404);
    echo json_encode([
        'success' => false, 
        'error' => 'Endpoint not found'
    ]);
}
