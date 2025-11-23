#!/usr/bin/env php
<?php
/**
 * Worker pour traiter la queue de notifications
 * À exécuter via cron toutes les minutes : * * * * * /usr/bin/php /path/to/scripts/process_notifications.php
 */

require_once __DIR__ . '/../bootstrap/env_loader.php';
require_once __DIR__ . '/../bootstrap/database.php';
require_once __DIR__ . '/../api.php';

// Empêcher l'exécution via HTTP (sécurité)
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die("This script can only be run from the command line.\n");
}

// Traiter la queue
$result = processNotificationsQueue($pdo, 50);

// Afficher les résultats
echo date('Y-m-d H:i:s') . " - Processed: {$result['processed']}, Success: {$result['success']}, Failed: {$result['failed']}\n";

if (isset($result['error'])) {
    echo "Error: {$result['error']}\n";
    exit(1);
}

exit(0);

