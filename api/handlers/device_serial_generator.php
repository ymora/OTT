<?php
/**
 * Générateur de numéros de série OTT automatiques
 * Format : OTT-001, OTT-002, OTT-003, etc.
 */

/**
 * Génère le prochain numéro de série OTT disponible
 * 
 * @param PDO $pdo Instance PDO
 * @return string Prochain numéro (ex: OTT-042)
 */
function generateNextOttSerial($pdo) {
    try {
        // Récupérer le numéro le plus élevé (même dispositifs supprimés)
        $stmt = $pdo->prepare("
            SELECT device_serial 
            FROM devices 
            WHERE device_serial LIKE 'OTT-%'
            ORDER BY device_serial DESC 
            LIMIT 1
        ");
        $stmt->execute();
        $lastSerial = $stmt->fetchColumn();
        
        if ($lastSerial) {
            // Extraire le numéro (OTT-042 → 42)
            preg_match('/OTT-(\d+)/', $lastSerial, $matches);
            $lastNumber = isset($matches[1]) ? intval($matches[1]) : 0;
            $nextNumber = $lastNumber + 1;
        } else {
            // Premier dispositif
            $nextNumber = 1;
        }
        
        // Formater avec padding (001, 002, etc.)
        return 'OTT-' . str_pad($nextNumber, 3, '0', STR_PAD_LEFT);
        
    } catch (PDOException $e) {
        error_log('[generateNextOttSerial] Erreur: ' . $e->getMessage());
        // Fallback en cas d'erreur : utiliser timestamp
        return 'OTT-' . date('ymdHis');
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

