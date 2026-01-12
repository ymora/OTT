<?php
/**
 * Initialisation de la base de données SQLite pour OTT
 */

header('Content-Type: application/json');

try {
    // Connexion à la base SQLite
    $pdo = new PDO('sqlite:../database.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Lecture du schéma PostgreSQL
    $schema = file_get_contents('../sql/schema.sql');
    
    // Conversion PostgreSQL vers SQLite
    $sqlite_schema = $schema;
    
    // Remplacements PostgreSQL vers SQLite
    $replacements = [
        'CREATE EXTENSION IF NOT EXISTS pgcrypto;' => '-- Extension pgcrypto non nécessaire pour SQLite',
        'SERIAL PRIMARY KEY' => 'INTEGER PRIMARY KEY AUTOINCREMENT',
        'TIMESTAMPTZ DEFAULT NOW()' => 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        'NOW()' => 'datetime("now")',
        'pgcrypto' => 'sqlite',
        'plpgsql' => 'sqlite',
        'CREATE OR REPLACE FUNCTION' => '-- Fonction PostgreSQL remplacée par trigger SQLite',
        'CREATE TRIGGER' => '-- Trigger PostgreSQL remplacé par trigger SQLite',
        'FOR EACH ROW EXECUTE FUNCTION' => '-- Trigger PostgreSQL remplacé',
        'VARCHAR(50)' => 'TEXT',
        'VARCHAR(100)' => 'TEXT',
        'VARCHAR(255)' => 'TEXT',
        'TEXT' => 'TEXT',
        'BOOLEAN' => 'INTEGER',
        'DOUBLE PRECISION' => 'REAL',
        'UUID' => 'TEXT',
        'JSONB' => 'TEXT',
        'INET' => 'TEXT',
        'BIGINT' => 'INTEGER',
        'SMALLINT' => 'INTEGER',
        'UNIQUE NOT NULL' => 'UNIQUE NOT NULL',
        'REFERENCES' => 'REFERENCES',
        'ON DELETE CASCADE' => 'ON DELETE CASCADE',
        'ON DELETE SET NULL' => 'ON DELETE SET NULL',
        'ON UPDATE CASCADE' => 'ON UPDATE CASCADE'
    ];
    
    foreach ($replacements as $pg => $sqlite) {
        $sqlite_schema = str_replace($pg, $sqlite, $sqlite_schema);
    }
    
    // Suppression des fonctions PostgreSQL
    $sqlite_schema = preg_replace('/CREATE OR REPLACE FUNCTION.*?END;\s*\$\$ LANGUAGE plpgsql;/s', '-- Fonction PostgreSQL supprimée', $sqlite_schema);
    
    // Exécution du schéma
    $statements = explode(';', $sqlite_schema);
    
    foreach ($statements as $statement) {
        $statement = trim($statement);
        if (!empty($statement) && !str_starts_with($statement, '--')) {
            try {
                $pdo->exec($statement);
            } catch (Exception $e) {
                // Ignorer les erreurs de tables existantes
            }
        }
    }
    
    // Insertion des données de base
    $pdo->exec("INSERT OR IGNORE INTO roles (id, name, description) VALUES (1, 'admin', 'Administrateur système')");
    $pdo->exec("INSERT OR IGNORE INTO roles (id, name, description) VALUES (2, 'medecin', 'Médecin')");
    $pdo->exec("INSERT OR IGNORE INTO roles (id, name, description) VALUES (3, 'technicien', 'Technicien')");
    
    $pdo->exec("INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, role_id, is_active, email_verified) VALUES (1, 'ymora@free.fr', '\$2y\$10\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Yves', 'Mora', 1, 1, 1)");
    
    echo json_encode(['success' => true, 'message' => 'Base de données initialisée']);
    
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
