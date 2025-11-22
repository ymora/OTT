<?php
/**
 * Routeur pour le serveur PHP built-in
 * Redirige toutes les requêtes vers api.php ou index.php
 */

$requestUri = $_SERVER['REQUEST_URI'];
$requestPath = parse_url($requestUri, PHP_URL_PATH);

// Si c'est la racine ou index.php, utiliser index.php
if ($requestPath === '/' || $requestPath === '/index.php') {
    if (file_exists(__DIR__ . '/index.php')) {
        return false; // Laisser PHP servir index.php
    }
}

// Toutes les autres requêtes → api.php
if (file_exists(__DIR__ . '/api.php')) {
    $_SERVER['SCRIPT_NAME'] = '/api.php';
    require __DIR__ . '/api.php';
    return true;
}

// Si aucun fichier ne correspond, retourner 404
http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['success' => false, 'error' => 'Not found']);
return true;

