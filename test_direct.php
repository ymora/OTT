<?php
header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'message' => 'Direct test working',
    'version' => '2.0.1',
    'timestamp' => date('c')
]);
?>
