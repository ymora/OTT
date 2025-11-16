<?php
/**
 * Charge les variables d'environnement depuis .env.php si le fichier existe
 * Compatible avec le format KEY=VALUE (une ligne par variable)
 */

$envFile = __DIR__ . '/../.env.php';
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

