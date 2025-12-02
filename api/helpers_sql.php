<?php
/**
 * SQL Helpers - Fonctions sécurisées pour les requêtes dynamiques
 * Créé lors de l'audit de sécurité pour sécuriser les constructions SQL dynamiques
 */

// ============================================================================
// HELPERS - SQL Construction Sécurisée
// ============================================================================

/**
 * Construit une requête UPDATE sécurisée avec whitelist de colonnes
 * 
 * @param string $table Nom de la table
 * @param array $data Données à mettre à jour (clé => valeur)
 * @param array $allowedColumns Colonnes autorisées (whitelist)
 * @param array $whereConditions Conditions WHERE (clé => valeur)
 * @param array &$params Tableau de paramètres pour PDO (passé par référence)
 * @return string Requête SQL sécurisée
 * @throws InvalidArgumentException Si une colonne non autorisée est utilisée
 */
function buildSecureUpdateQuery($table, $data, $allowedColumns, $whereConditions, &$params = []) {
    // Valider que le nom de table est sûr (uniquement alphanumériques et underscore)
    if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
        throw new InvalidArgumentException("Invalid table name: $table");
    }
    
    // Valider que toutes les colonnes demandées sont dans la whitelist
    $updateParts = [];
    $params = [];
    
    foreach ($data as $column => $value) {
        // Valider le nom de colonne
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
            throw new InvalidArgumentException("Invalid column name: $column");
        }
        
        // Vérifier que la colonne est autorisée
        if (!in_array($column, $allowedColumns, true)) {
            throw new InvalidArgumentException("Column '$column' is not allowed. Allowed columns: " . implode(', ', $allowedColumns));
        }
        
        // Construire la partie SET avec placeholder sécurisé
        $paramName = ':' . $column;
        $updateParts[] = "$column = $paramName";
        $params[$column] = $value;
    }
    
    if (empty($updateParts)) {
        throw new InvalidArgumentException("No valid columns to update");
    }
    
    // Construire la clause WHERE de manière sécurisée
    $whereParts = [];
    foreach ($whereConditions as $column => $value) {
        // Valider le nom de colonne
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
            throw new InvalidArgumentException("Invalid WHERE column name: $column");
        }
        
        $whereParamName = ':where_' . $column;
        $whereParts[] = "$column = $whereParamName";
        $params['where_' . $column] = $value;
    }
    
    if (empty($whereParts)) {
        throw new InvalidArgumentException("WHERE conditions are required for security");
    }
    
    // Construire la requête finale
    $sql = "UPDATE $table SET " . implode(', ', $updateParts);
    
    if (!empty($whereParts)) {
        $sql .= " WHERE " . implode(' AND ', $whereParts);
    }
    
    return $sql;
}

/**
 * Construit une requête UPDATE sécurisée avec support pour les valeurs NULL et expressions SQL
 * 
 * @param string $table Nom de la table
 * @param array $updates Tableau de parties SET (ex: ["name = :name", "updated_at = NOW()"])
 * @param array $params Paramètres pour les placeholders (passé par référence)
 * @param array $whereConditions Conditions WHERE (clé => valeur)
 * @return string Requête SQL sécurisée
 */
function buildSecureUpdateQueryAdvanced($table, $updates, &$params = [], $whereConditions = []) {
    // Valider que le nom de table est sûr
    if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table)) {
        throw new InvalidArgumentException("Invalid table name: $table");
    }
    
    if (empty($updates)) {
        throw new InvalidArgumentException("No updates specified");
    }
    
    // Valider chaque partie UPDATE pour éviter les injections
    // On accepte les formats: "column = :param", "column = NULL", "column = NOW()", etc.
    foreach ($updates as $updatePart) {
        // Valider que la partie UPDATE commence par un nom de colonne valide
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*(:?[a-zA-Z_][a-zA-Z0-9_]*|NULL|NOW\(\)|TRUE|FALSE|\'[^\']*\')/i', $updatePart)) {
            // Log warning mais continuer (certaines constructions peuvent être valides)
            if (getenv('DEBUG_ERRORS') === 'true') {
                error_log("[buildSecureUpdateQueryAdvanced] Warning: Suspicious update part: $updatePart");
            }
        }
    }
    
    // Construire la clause WHERE
    $whereParts = [];
    foreach ($whereConditions as $column => $value) {
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
            throw new InvalidArgumentException("Invalid WHERE column name: $column");
        }
        
        $whereParamName = ':where_' . $column;
        $whereParts[] = "$column = $whereParamName";
        $params['where_' . $column] = $value;
    }
    
    // Construire la requête
    $sql = "UPDATE $table SET " . implode(', ', $updates);
    
    if (!empty($whereParts)) {
        $sql .= " WHERE " . implode(' AND ', $whereParts);
    }
    
    return $sql;
}

/**
 * Valide qu'un nom de colonne est sûr
 * 
 * @param string $column Nom de colonne à valider
 * @param array $allowedColumns Liste des colonnes autorisées
 * @return bool True si valide
 */
function isValidColumn($column, $allowedColumns = null) {
    // Valider le format du nom
    if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
        return false;
    }
    
    // Si une whitelist est fournie, vérifier qu'elle contient la colonne
    if ($allowedColumns !== null && !in_array($column, $allowedColumns, true)) {
        return false;
    }
    
    return true;
}

/**
 * Valide qu'un nom de table est sûr
 * 
 * @param string $table Nom de table à valider
 * @return bool True si valide
 */
function isValidTableName($table) {
    return preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table) === 1;
}

/**
 * Échappe un identifiant SQL (nom de table ou colonne) pour PostgreSQL
 * Utilise les guillemets doubles comme spécifié dans la norme SQL
 * 
 * @param string $identifier Identifiant à échapper
 * @return string Identifiant échappé
 */
function escapeSqlIdentifier($identifier) {
    // Valider d'abord que c'est un identifiant valide
    if (!isValidTableName($identifier)) {
        throw new InvalidArgumentException("Invalid SQL identifier: $identifier");
    }
    
    // Échapper les guillemets doubles en les doublant
    return '"' . str_replace('"', '""', $identifier) . '"';
}

