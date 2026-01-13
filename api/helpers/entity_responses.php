<?php
/**
 * Helper pour standardiser les réponses API des entités
 * Uniformise les messages et formats de réponse pour patients, users, devices
 */

/**
 * Retourne un message de succès standardisé selon le type d'entité et l'action
 * @param string $entityType Type d'entité ('patients', 'users', 'devices')
 * @param string $action Type d'action ('created', 'updated', 'archived', 'restored', 'deleted')
 * @param array $context Informations contextuelles supplémentaires
 * @return string Message formaté
 */
function getSuccessMessage($entityType, $action, $context = []) {
    $entityNames = [
        'patients' => 'Patient',
        'users' => 'Utilisateur',
        'devices' => 'Dispositif'
    ];
    
    $actionMessages = [
        'created' => '%s créé avec succès',
        'updated' => '%s mis à jour avec succès',
        'archived' => '%s archivé avec succès',
        'restored' => '%s restauré avec succès',
        'deleted' => '%s supprimé définitivement',
        'permanent_deleted' => '%s supprimé définitivement'
    ];
    
    $entityName = $entityNames[$entityType] ?? 'Entité';
    $message = sprintf($actionMessages[$action] ?? '%s traité avec succès', $entityName);
    
    // Ajouter des informations contextuelles
    if (!empty($context)) {
        if (isset($context['devices_unassigned']) && $context['devices_unassigned'] > 0) {
            $message .= ' (' . $context['devices_unassigned'] . ' dispositif(s) désassigné(s) automatiquement)';
        }
        if (isset($context['was_assigned']) && $context['was_assigned']) {
            $message .= ' (dispositif désassigné automatiquement)';
        }
    }
    
    return $message;
}

/**
 * Retourne un message d'erreur standardisé selon le type d'entité et l'action
 * @param string $entityType Type d'entité ('patients', 'users', 'devices')
 * @param string $action Type d'action ('not_found', 'already_archived', 'not_archived', 'permission_denied')
 * @return string Message d'erreur formaté
 */
function getErrorMessage($entityType, $action) {
    $entityNames = [
        'patients' => 'Patient',
        'users' => 'Utilisateur', 
        'devices' => 'Dispositif'
    ];
    
    $entityName = $entityNames[$entityType] ?? 'Entité';
    
    $errorMessages = [
        'not_found' => '%s introuvable',
        'already_archived' => '%s déjà archivé',
        'not_archived' => 'Le %s n\'est pas archivé',
        'permission_denied' => 'Permission refusée pour cette action',
        'invalid_id' => 'ID de %s invalide',
        'database_error' => 'Erreur de base de données',
        'missing_fields' => 'Champs requis manquants',
        'email_exists' => 'Cet email est déjà utilisé',
        'no_fields_to_update' => 'Aucun champ à mettre à jour',
        'self_delete_forbidden' => 'Vous ne pouvez pas supprimer votre propre compte',
        'invalid_iccid' => 'SIM ICCID invalide (minimum 10 caractères)',
        'iccid_exists' => 'SIM ICCID déjà utilisé',
        'patient_not_found' => 'Patient introuvable',
        'validation_error' => 'Erreur de validation'
    ];
    
    return sprintf($errorMessages[$action] ?? 'Erreur lors du traitement du %s', $entityName);
}

/**
 * Envoie une réponse JSON standardisée
 * @param bool $success Succès ou échec
 * @param string $message Message à afficher
 * @param array $data Données supplémentaires
 * @param int $httpCode Code HTTP (optionnel)
 */
function sendJsonResponse($success, $message, $data = [], $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    
    $response = array_merge([
        'success' => $success,
        'message' => $message
    ], $data);
    
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
}

/**
 * Envoie une réponse de succès standardisée
 * @param string $entityType Type d'entité
 * @param string $action Action effectuée
 * @param array $data Données supplémentaires
 * @param array $context Contexte supplémentaire
 */
function sendSuccessResponse($entityType, $action, $data = [], $context = []) {
    $message = getSuccessMessage($entityType, $action, $context);
    sendJsonResponse(true, $message, $data);
}

/**
 * Envoie une réponse d'erreur standardisée
 * @param string $entityType Type d'entité
 * @param string $error Type d'erreur
 * @param array $data Données supplémentaires
 * @param int $httpCode Code HTTP
 */
function sendErrorResponse($entityType, $error, $data = [], $httpCode = 400) {
    $message = getErrorMessage($entityType, $error);
    sendJsonResponse(false, $message, $data, $httpCode);
}
