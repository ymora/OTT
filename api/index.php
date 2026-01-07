<?php
/**
 * Router Principal API
 * Extrait et simplifié de api.php
 */

require_once __DIR__ . '/router.php';

// Récupérer la méthode et le chemin
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$path = rtrim($path, '/'); // Normaliser le chemin (supprimer le / final)

// Router principal
routeRequest($method, $path);
