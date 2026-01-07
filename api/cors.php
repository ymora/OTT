<?php
/**
 * Configuration Headers CORS
 * Extrait de api.php pour modularisation
 */

// Démarrer le buffer de sortie TRÈS TÔT pour capturer toute sortie HTML accidentelle
ob_start();

// Headers CORS (DOIT être en tout premier)
$defaultAllowedOrigins = [];

// En développement local : autoriser localhost par défaut
if (getenv('APP_ENV') === 'development' || empty(getenv('APP_ENV'))) {
    $defaultAllowedOrigins = [
        'http://localhost:3000',  // Développement local Next.js
        'http://localhost:3003',  // Autres ports locaux
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3003'
    ];
}

// Ajouter les origines autorisées depuis les variables d'environnement
$allowedOrigins = $defaultAllowedOrigins;
if (getenv('ALLOWED_ORIGINS')) {
    $envOrigins = array_map('trim', explode(',', getenv('ALLOWED_ORIGINS')));
    $allowedOrigins = array_merge($allowedOrigins, $envOrigins);
}

// Origin autorisée pour Render
if (getenv('RENDER_SERVICE_URL')) {
    $allowedOrigins[] = getenv('RENDER_SERVICE_URL');
}

// Nettoyer les doublons
$allowedOrigins = array_unique($allowedOrigins);

// Définir les headers CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins) || empty($origin)) {
    header("Access-Control-Allow-Origin: " . ($origin ?: '*'));
}
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Max-Age: 3600");

// Gérer les requêtes OPTIONS (pre-flight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Headers de sécurité
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");

// Headers de cache pour les réponses API
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");
