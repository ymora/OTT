<?php
/**
 * Server-Sent Events (SSE) Utilities
 * Fonctions pour l'envoi de messages SSE pendant la compilation
 */

/**
 * Envoie un message Server-Sent Event
 * @param string $type Type de message ('log', 'progress', 'success', 'error')
 * @param string $message Message à envoyer
 * @param mixed $data Données supplémentaires (optionnel)
 */
function sendSSE($type, $message = '', $data = null) {
    $payload = null;
    
    if ($type === 'log') {
        $level = $message;
        $message = $data;
        $payload = ['type' => 'log', 'level' => $level, 'message' => $message];
    } else if ($type === 'progress') {
        // $message = pourcentage, $data = nom de l'étape (optionnel)
        $payload = ['type' => 'progress', 'progress' => $message];
        if ($data !== null) {
            $payload['step'] = $data;
        }
    } else if ($type === 'success') {
        $payload = ['type' => 'success', 'message' => $message, 'version' => $data];
    } else if ($type === 'error') {
        $payload = ['type' => 'error', 'message' => $message];
    }
    
    if ($payload !== null) {
        echo "data: " . json_encode($payload) . "\n\n";
        flush();
    }
}

/**
 * Configure les headers pour Server-Sent Events
 */
function setupSSEHeaders() {
    // Désactiver la mise en buffer pour SSE
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    
    // Vérifier si les headers ont déjà été envoyés
    if (!headers_sent()) {
        // Configurer pour Server-Sent Events (SSE) - DOIT être avant tout output
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no'); // Désactiver la mise en buffer pour nginx
    }
}

/**
 * Envoie un keep-alive pour maintenir la connexion SSE
 */
function sendSSEKeepAlive() {
    echo ": keep-alive\n\n";
    flush();
}

/**
 * Établit la connexion SSE en envoyant plusieurs keep-alive
 */
function establishSSEConnection() {
    // Envoyer 3 keep-alive immédiatement pour établir la connexion
    for ($i = 0; $i < 3; $i++) {
        sendSSEKeepAlive();
        usleep(100000); // 100ms entre chaque keep-alive
    }
}
