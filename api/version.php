<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

$buildVersion = trim(shell_exec('git rev-parse HEAD'));
if (!$buildVersion) {
    $buildVersion = 'unknown';
}

echo json_encode([
    'success' => true,
    'version' => $buildVersion,
    'php_version' => PHP_VERSION,
    'time' => date('c'),
]);
?>
