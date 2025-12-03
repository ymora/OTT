<?php
/**
 * Générateur de numéros de série OTT automatiques (v1.0)
 * Format : OTT-YY-NNN (YY=année, NNN=numéro séquentiel)
 * Exemples : OTT-25-001, OTT-25-002, OTT-26-001
 */

/**
 * Génère le prochain numéro de série OTT disponible
 * 
 * Format : OTT-YY-NNN où :
 * - YY = année en cours sur 2 chiffres (25 pour 2025, 26 pour 2026, etc.)
 * - NNN = numéro séquentiel sur 3 chiffres (001, 002, 003...)
 * 
 * La numérotation recommence à 001 chaque année.
 * 
 * @param PDO $pdo Instance PDO
 * @return string Prochain numéro (ex: OTT-25-042)
 */
function generateNextOttSerial($pdo) {
    try {
        $currentYear = date('y'); // 25 pour 2025, 26 pour 2026
        
        // Récupérer le numéro le plus élevé pour l'année en cours (même dispositifs supprimés)
        $stmt = $pdo->prepare("
            SELECT device_serial 
            FROM devices 
            WHERE device_serial LIKE :pattern
            ORDER BY device_serial DESC 
            LIMIT 1
        ");
        $stmt->execute(['pattern' => 'OTT-' . $currentYear . '-%']);
        $lastSerial = $stmt->fetchColumn();
        
        if ($lastSerial) {
            // Extraire le numéro (OTT-25-042 → 42)
            preg_match('/OTT-\d{2}-(\d+)/', $lastSerial, $matches);
            $lastNumber = isset($matches[1]) ? intval($matches[1]) : 0;
            $nextNumber = $lastNumber + 1;
        } else {
            // Premier dispositif de l'année
            $nextNumber = 1;
        }
        
        // Formater avec padding (001, 002, etc.)
        return sprintf('OTT-%s-%03d', $currentYear, $nextNumber);
        
    } catch (PDOException $e) {
        error_log('[generateNextOttSerial] Erreur: ' . $e->getMessage());
        // Fallback en cas d'erreur : utiliser timestamp
        return 'OTT-' . date('y') . '-' . date('His');
    }
}

/**
 * Vérifie si un numéro de série OTT existe déjà
 * 
 * @param PDO $pdo Instance PDO
 * @param string $serial Numéro à vérifier
 * @return bool True si existe
 */
function ottSerialExists($pdo, $serial) {
    try {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM devices 
            WHERE device_serial = :serial
        ");
        $stmt->execute(['serial' => $serial]);
        return $stmt->fetchColumn() > 0;
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * Vérifie si un serial est temporaire (OTT-XX-XXX)
 * Ces serials sont assignés en sortie d'usine et doivent être remplacés
 * par un serial définitif lors de la première connexion.
 * 
 * @param string $serial Numéro de série à vérifier
 * @return bool True si temporaire
 */
function isTemporarySerial($serial) {
    return $serial === 'OTT-XX-XXX' || preg_match('/^OTT-XX-\d{3}$/', $serial);
}

/**
 * Extrait l'année d'un serial OTT (format OTT-YY-NNN)
 * 
 * @param string $serial Numéro de série
 * @return string|null Année sur 2 chiffres ou null si format invalide
 */
function extractYearFromSerial($serial) {
    if (preg_match('/^OTT-(\d{2})-\d{3}$/', $serial, $matches)) {
        return $matches[1];
    }
    return null;
}

