<?php
/**
 * Fournit une connexion PDO singleton pour l'API.
 * Ce fichier s'appuie sur les helpers de /bootstrap/database.php.
 */

if (!function_exists('get_db_connection')) {
    function get_db_connection(): PDO
    {
        static $pdoInstance = null;

        if ($pdoInstance instanceof PDO) {
            return $pdoInstance;
        }

        $dbConfig = ott_database_config();
        if ($dbConfig === null) {
            throw new RuntimeException('Database configuration missing');
        }

        $pdoOptions = ott_pdo_options($dbConfig['type']);
        $pdoOptions[PDO::ATTR_TIMEOUT] = defined('DB_TIMEOUT') ? DB_TIMEOUT : 10;
        $pdoOptions[PDO::ATTR_PERSISTENT] = true;

        if ($dbConfig['type'] === 'mysql' && defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
            $pdoOptions[PDO::MYSQL_ATTR_INIT_COMMAND] = "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci";
        }

        if ($dbConfig['type'] === 'pgsql' && !extension_loaded('pdo_pgsql')) {
            throw new RuntimeException('Le driver PDO PostgreSQL (pdo_pgsql) est absent');
        }

        $pdoInstance = new PDO(
            $dbConfig['dsn'],
            $dbConfig['user'],
            $dbConfig['pass'],
            $pdoOptions
        );

        $safeDsn = preg_replace('/:(?:[^:@]+)@/', ':****@', $dbConfig['dsn']);
        error_log('[DB_CONNECTION] ✅ Connexion réussie (' . $safeDsn . ')');

        return $pdoInstance;
    }
}
