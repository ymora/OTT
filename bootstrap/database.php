<?php

if (!function_exists('ott_normalize_db_type')) {
    function ott_normalize_db_type(?string $type): string
    {
        $value = strtolower(trim((string)$type));
        if (in_array($value, ['mysql', 'mariadb'], true)) {
            return 'mysql';
        }
        if (in_array($value, ['pgsql', 'postgres', 'postgresql', 'psql'], true)) {
            return 'pgsql';
        }
        if (in_array($value, ['sqlite'], true)) {
            return 'sqlite';
        }
        return 'sqlite'; // Par défaut pour le mode local
    }

    function ott_default_port(string $type): string
    {
        return $type === 'mysql' ? '3306' : ($type === 'sqlite' ? '' : '5432');
    }

    function ott_build_dsn(string $type, string $host, string $port, string $name): string
    {
        if ($type === 'mysql') {
            return sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $name);
        }

        if ($type === 'sqlite') {
            return sprintf('sqlite:%s', $name);
        }

        $sslmode = getenv('DB_SSLMODE') ?: getenv('PGSSLMODE') ?: 'require';
        return sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s', $host, $port, $name, $sslmode);
    }

    function ott_database_config(bool $includeDefaults = true): ?array
    {
        $type = ott_normalize_db_type(getenv('DB_TYPE') ?: null);

        $defaults = $includeDefaults
            ? [
                'host' => 'localhost',
                'name' => 'database.sqlite',
                'user' => '',
                'pass' => '',
                'port' => '',
            ]
            : [
                'host' => null,
                'name' => null,
                'user' => null,
                'pass' => '',
                'port' => null,
            ];

        $config = $defaults;

        $envHost = getenv('DB_HOST');
        if ($envHost !== false && $envHost !== '') {
            $config['host'] = $envHost;
        }

        $envName = getenv('DB_NAME');
        if ($envName !== false && $envName !== '') {
            $config['name'] = $envName;
        }

        $envUser = getenv('DB_USER');
        if ($envUser !== false && $envUser !== '') {
            $config['user'] = $envUser;
        }

        $envPass = getenv('DB_PASS');
        if ($envPass !== false) {
            $config['pass'] = $envPass;
        }

        $envPort = getenv('DB_PORT');
        if ($envPort !== false && $envPort !== '') {
            $config['port'] = $envPort;
        }

        $databaseUrl = getenv('DATABASE_URL');
        if ($databaseUrl) {
            // Nettoyer la DATABASE_URL (enlever les espaces, etc.)
            $databaseUrl = trim($databaseUrl);
            
            // Log pour diagnostic (sans afficher le mot de passe complet)
            $urlForLog = preg_replace('/(:[^:@]+)@/', ':****@', $databaseUrl);
            error_log('[DB_CONFIG] Parsing DATABASE_URL: ' . $urlForLog);
            
            $parts = @parse_url($databaseUrl);
            if ($parts === false) {
                error_log('[DB_CONFIG] ❌ Erreur parse_url() - DATABASE_URL invalide');
                // Essayer de parser manuellement si parse_url échoue
                // Format attendu: postgresql://user:pass@host:port/dbname
                if (preg_match('#^(postgresql?|pgsql)://([^:]+):([^@]+)@([^:]+):?(\d+)?/(.+)$#', $databaseUrl, $matches)) {
                    $type = ott_normalize_db_type($matches[1]);
                    $config['user'] = rawurldecode($matches[2]);
                    $config['pass'] = rawurldecode($matches[3]);
                    $config['host'] = $matches[4];
                    $config['port'] = !empty($matches[5]) ? $matches[5] : ott_default_port($type);
                    $config['name'] = rawurldecode($matches[6]);
                    error_log('[DB_CONFIG] ✅ Parsing manuel réussi');
                } else {
                    error_log('[DB_CONFIG] ❌ Format DATABASE_URL non reconnu');
                }
            } else {
                if (!empty($parts['scheme'])) {
                    $type = ott_normalize_db_type($parts['scheme']);
                }
                if (!empty($parts['host'])) {
                    $config['host'] = $parts['host'];
                }
                if (!empty($parts['path'])) {
                    $config['name'] = ltrim($parts['path'], '/');
                }
                if (!empty($parts['user'])) {
                    $config['user'] = rawurldecode($parts['user']);
                }
                if (array_key_exists('pass', $parts)) {
                    $config['pass'] = rawurldecode($parts['pass'] ?? '');
                }
                if (!empty($parts['port'])) {
                    $config['port'] = $parts['port'];
                }
                error_log('[DB_CONFIG] ✅ Parsing parse_url() réussi');
            }
            
            // Log final (sans mot de passe)
            error_log('[DB_CONFIG] Config finale: host=' . ($config['host'] ?? 'null') . ', port=' . ($config['port'] ?? 'null') . ', db=' . ($config['name'] ?? 'null') . ', user=' . ($config['user'] ?? 'null'));
        }

        $config['type'] = $type;

        if (empty($config['port'])) {
            $config['port'] = ott_default_port($type);
        }

        if (empty($config['name'])) {
            return null;
        }

        $config['dsn'] = ott_build_dsn($type, $config['host'], $config['port'], $config['name']);

        return $config;
    }

    function ott_pdo_options(string $type): array
    {
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        if ($type === 'mysql' && defined('PDO::MYSQL_ATTR_INIT_COMMAND')) {
            $options[PDO::MYSQL_ATTR_INIT_COMMAND] = "SET NAMES utf8mb4";
        }

        return $options;
    }
}

