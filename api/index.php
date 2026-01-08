<?php
/**
 * Router Principal API
 * Extrait et simplifié de api.php
 */

// Activer le reporting d'erreurs pour le debug
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Capturer les erreurs fatales
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && $error['type'] === E_ERROR) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Fatal Error',
            'message' => $error['message'],
            'file' => $error['file'],
            'line' => $error['line']
        ]);
    }
});

// Inclure directement le router qui exécute le routage
require_once __DIR__ . '/routing/api_router.php';
