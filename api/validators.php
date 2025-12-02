<?php
/**
 * Validators pour les inputs
 * Créé lors de l'audit Phase 1 - Sécurité
 */

// ============================================================================
// VALIDATORS - Input Validation
// ============================================================================

/**
 * Valide un email
 * @param string $email Email à valider
 * @return bool True si valide
 */
function isValidEmail($email) {
    if (empty($email)) {
        return false;
    }
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Valide un numéro de téléphone (format français et international)
 * @param string $phone Téléphone à valider
 * @return bool True si valide
 */
function isValidPhone($phone) {
    if (empty($phone)) {
        return false;
    }
    // Formats acceptés: +33, 06, 01, etc.
    $phone = preg_replace('/[\s\-\.\(\)]/', '', $phone);
    return preg_match('/^(\+33|0)[1-9](\d{2}){4}$/', $phone) === 1;
}

/**
 * Valide un ID numérique
 * @param mixed $id ID à valider
 * @return bool True si valide
 */
function isValidId($id) {
    return is_numeric($id) && intval($id) > 0;
}

/**
 * Valide une coordonnée GPS (latitude ou longitude)
 * @param float $coordinate Coordonnée à valider
 * @param string $type 'latitude' ou 'longitude'
 * @return bool True si valide
 */
function isValidCoordinate($coordinate, $type = 'latitude') {
    if (!is_numeric($coordinate)) {
        return false;
    }
    $value = floatval($coordinate);
    
    if ($type === 'latitude') {
        return $value >= -90 && $value <= 90;
    } elseif ($type === 'longitude') {
        return $value >= -180 && $value <= 180;
    }
    
    return false;
}

/**
 * Valide un nom de fichier pour éviter les injections de chemin
 * @param string $filename Nom de fichier à valider
 * @param array $allowedExtensions Extensions autorisées (ex: ['sql', 'pdf'])
 * @return bool True si valide
 */
function isValidFilename($filename, $allowedExtensions = []) {
    if (empty($filename)) {
        return false;
    }
    
    // Vérifier qu'il n'y a pas de path traversal
    if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
        return false;
    }
    
    // Vérifier les caractères autorisés (alphanumériques, underscore, point, tiret)
    if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $filename)) {
        return false;
    }
    
    // Vérifier l'extension si spécifiée
    if (!empty($allowedExtensions)) {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if (!in_array($extension, $allowedExtensions, true)) {
            return false;
        }
    }
    
    return true;
}

/**
 * Valide un code ICCID (SIM card)
 * @param string $iccid Code ICCID à valider
 * @return bool True si valide
 */
function isValidIccid($iccid) {
    if (empty($iccid)) {
        return false;
    }
    // ICCID: 15-20 chiffres
    return preg_match('/^\d{15,20}$/', $iccid) === 1;
}

/**
 * Valide une version de firmware
 * @param string $version Version à valider
 * @return bool True si valide
 */
function isValidFirmwareVersion($version) {
    if (empty($version)) {
        return false;
    }
    // Format: X.Y ou X.Y.Z ou X.Y-*
    return preg_match('/^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9\-]+)?$/', $version) === 1;
}

/**
 * Valide un pourcentage (0-100)
 * @param mixed $percentage Pourcentage à valider
 * @return bool True si valide
 */
function isValidPercentage($percentage) {
    if (!is_numeric($percentage)) {
        return false;
    }
    $value = floatval($percentage);
    return $value >= 0 && $value <= 100;
}

/**
 * Valide un JSON string
 * @param string $json JSON à valider
 * @return bool True si valide
 */
function isValidJson($json) {
    if (empty($json)) {
        return false;
    }
    json_decode($json);
    return json_last_error() === JSON_ERROR_NONE;
}

/**
 * Valide et nettoie une chaîne de caractères
 * @param string $string Chaîne à valider
 * @param int $maxLength Longueur maximale
 * @return string|null Chaîne nettoyée ou null si invalide
 */
function validateAndSanitizeString($string, $maxLength = 255) {
    if (!is_string($string)) {
        return null;
    }
    
    $cleaned = trim($string);
    
    if (empty($cleaned)) {
        return null;
    }
    
    if (mb_strlen($cleaned) > $maxLength) {
        return null;
    }
    
    // Supprimer les caractères de contrôle
    $cleaned = preg_replace('/[\x00-\x1F\x7F]/', '', $cleaned);
    
    return $cleaned;
}

/**
 * Valide un tableau de données avec un schéma
 * @param array $data Données à valider
 * @param array $schema Schéma de validation ['field' => ['required' => bool, 'type' => 'string|int|float|email|...', 'validator' => callable]]
 * @return array ['valid' => bool, 'errors' => array]
 */
function validateData($data, $schema) {
    $errors = [];
    
    foreach ($schema as $field => $rules) {
        $value = $data[$field] ?? null;
        
        // Vérifier si requis
        if (!empty($rules['required']) && ($value === null || $value === '')) {
            $errors[$field] = "Le champ '$field' est requis";
            continue;
        }
        
        // Si optionnel et vide, passer au suivant
        if (empty($rules['required']) && ($value === null || $value === '')) {
            continue;
        }
        
        // Vérifier le type
        if (!empty($rules['type'])) {
            $type = $rules['type'];
            
            switch ($type) {
                case 'string':
                    if (!is_string($value)) {
                        $errors[$field] = "Le champ '$field' doit être une chaîne";
                    }
                    break;
                case 'int':
                    if (!is_numeric($value) || intval($value) != $value) {
                        $errors[$field] = "Le champ '$field' doit être un entier";
                    }
                    break;
                case 'float':
                    if (!is_numeric($value)) {
                        $errors[$field] = "Le champ '$field' doit être un nombre";
                    }
                    break;
                case 'email':
                    if (!isValidEmail($value)) {
                        $errors[$field] = "Le champ '$field' doit être un email valide";
                    }
                    break;
                case 'phone':
                    if (!isValidPhone($value)) {
                        $errors[$field] = "Le champ '$field' doit être un téléphone valide";
                    }
                    break;
            }
        }
        
        // Validator personnalisé
        if (!empty($rules['validator']) && is_callable($rules['validator'])) {
            if (!$rules['validator']($value)) {
                $errors[$field] = $rules['error'] ?? "Le champ '$field' est invalide";
            }
        }
    }
    
    return [
        'valid' => empty($errors),
        'errors' => $errors
    ];
}

