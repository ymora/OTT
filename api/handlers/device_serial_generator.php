<?php
/**
 * Générateur automatique de numéros de série OTT
 * Format : OTT-001, OTT-002, OTT-003, etc.
 */

/**
 * Génère le prochain numéro de série OTT disponible
 * 
 * @param PDO $pdo Connexion à la base de données
 * @return string Le prochain numéro (ex: 'OTT-004')
 */
function generateNextOttSerial($pdo) {
    try {
        // Chercher le dernier numéro utilisé (même dans les dispositifs supprimés)
        // On compte TOUS les dispositifs pour éviter les doublons
        $stmt = $pdo->query("
            SELECT device_serial 
            FROM devices 
            WHERE device_serial LIKE 'OTT-%'
            ORDER BY device_serial DESC
            LIMIT 1
        ");
        
        $lastSerial = $stmt->fetchColumn();
        
        if ($lastSerial) {
            // Extraire le numéro (ex: 'OTT-005' → 5)
            preg_match('/OTT-(\d+)/', $lastSerial, $matches);
            $lastNumber = isset($matches[1]) ? intval($matches[1]) : 0;
            $nextNumber = $lastNumber + 1;
        } else {
            // Aucun dispositif OTT- trouvé, commencer à 1
            $nextNumber = 1;
        }
        
        // Formater avec padding (ex: 1 → '001')
        return 'OTT-' . str_pad($nextNumber, 3, '0', STR_PAD_LEFT);
        
    } catch (PDOException $e) {
        error_log("Erreur génération serial OTT: " . $e->getMessage());
        // Fallback : utiliser timestamp
        return 'OTT-' . substr(time(), -3);
    }
}

/**
 * Vérifie si un numéro de série OTT est déjà utilisé
 * 
 * @param PDO $pdo Connexion à la base de données
 * @param string $serial Numéro à vérifier
 * @return bool True si utilisé, False si disponible
 */
function isOttSerialUsed($pdo, $serial) {
    try {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM devices 
            WHERE device_serial = :serial
        ");
        $stmt->execute(['serial' => $serial]);
        return intval($stmt->fetchColumn()) > 0;
    } catch (PDOException $e) {
        error_log("Erreur vérification serial: " . $e->getMessage());
        return true; // En cas d'erreur, considérer comme utilisé pour éviter doublons
    }
}

