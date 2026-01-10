<?php
/**
 * Charge les variables d'environnement depuis .env.php si le fichier existe
 * Compatible avec le format KEY=VALUE (une ligne par variable)
 */

$envFiles = [
    __DIR__ . '/../.env.local',
    __DIR__ . '/../.env.development',
    __DIR__ . '/../.env.php'
];
$envFile = null;
foreach ($envFiles as $candidate) {
    if (file_exists($candidate)) {
        $envFile = $candidate;
        break;
    }
}
if ($envFile === null) {
    return;
}
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        // Ignorer les commentaires
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        
        // Parser KEY=VALUE
        if (preg_match('/^([^=]+)=(.*)$/', $line, $matches)) {
            $key = trim($matches[1]);
            $value = trim($matches[2]);
            
            // Supprimer les guillemets si présents
            $value = trim($value, '"\'');
            
            // Ne définir que si la variable n'existe pas déjà (les variables système ont priorité)
            if (getenv($key) === false) {
                putenv("$key=$value");
                $_ENV[$key] = $value;
            }
        }
    }
}

