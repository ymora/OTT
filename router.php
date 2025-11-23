<?php
/**
 * Router pour serveur PHP built-in
 * Empêche que les fichiers HTML de documentation soient servis directement
 * et route toutes les requêtes vers index.php ou api.php
 */

$requestUri = $_SERVER['REQUEST_URI'];
$requestPath = parse_url($requestUri, PHP_URL_PATH);

// Supprimer les query strings pour la comparaison
$path = strtok($requestPath, '?');

// Si c'est un fichier statique existant (CSS, JS, images, etc.), le servir directement
$staticExtensions = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'json', 'xml', 'txt'];
$extension = pathinfo($path, PATHINFO_EXTENSION);

// Si c'est un fichier statique avec extension autorisée et qu'il existe
if ($extension && in_array(strtolower($extension), $staticExtensions)) {
    // Vérifier dans public/ d'abord (Next.js), puis à la racine
    $filePath = __DIR__ . '/public' . $path;
    if (!file_exists($filePath)) {
        $filePath = __DIR__ . $path;
    }
    if (file_exists($filePath) && is_file($filePath)) {
        // Servir le fichier statique directement
        return false; // Laisser PHP built-in servir le fichier
    }
}

// Bloquer l'accès direct aux fichiers HTML de documentation
if (preg_match('#^/docs/.*\.html$#', $path) || preg_match('#^/public/docs/.*\.html$#', $path)) {
    // Rediriger vers index.php qui gérera la route
    require_once __DIR__ . '/index.php';
    exit;
}

// Si c'est une route API, router vers api.php
if (preg_match('#^/api\.php#', $path)) {
    require_once __DIR__ . '/api.php';
    exit;
}

// Pour toutes les autres routes, utiliser index.php
// (qui redirigera vers api.php si nécessaire)
if (file_exists(__DIR__ . '/index.php')) {
    require_once __DIR__ . '/index.php';
    exit;
}

// Si aucun fichier n'est trouvé, retourner 404
http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['success' => false, 'error' => 'Not found']);
exit;
