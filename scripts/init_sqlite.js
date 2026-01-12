const fs = require('fs');
const path = require('path');

// Créer une base de données SQLite simple avec Node.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

console.log('✓ Connexion à SQLite réussie');

// Lecture du schéma
const schema = fs.readFileSync('sql/schema.sql', 'utf8');

// Conversion PostgreSQL vers SQLite
let sqliteSchema = schema;

// Remplacements PostgreSQL vers SQLite
const replacements = [
    ['CREATE EXTENSION IF NOT EXISTS pgcrypto;', '-- Extension pgcrypto non nécessaire pour SQLite'],
    ['SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT'],
    ['TIMESTAMPTZ DEFAULT NOW()', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ['NOW()', 'datetime("now")'],
    ['VARCHAR(50)', 'TEXT'],
    ['VARCHAR(100)', 'TEXT'],
    ['VARCHAR(255)', 'TEXT'],
    ['BOOLEAN', 'INTEGER'],
    ['DOUBLE PRECISION', 'REAL'],
    ['UUID', 'TEXT'],
    ['JSONB', 'TEXT'],
    ['INET', 'TEXT'],
    ['BIGINT', 'INTEGER'],
    ['SMALLINT', 'INTEGER']
];

replacements.forEach(([pg, sqlite]) => {
    sqliteSchema = sqliteSchema.replace(new RegExp(pg, 'g'), sqlite);
});

// Suppression des fonctions PostgreSQL
sqliteSchema = sqliteSchema.replace(/CREATE OR REPLACE FUNCTION.*?END;\s*\$\$ LANGUAGE plpgsql;/gs, '-- Fonction PostgreSQL supprimée');

// Création des tables de base
db.serialize(() => {
    // Table users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        role_id INTEGER,
        is_active INTEGER DEFAULT 1,
        email_verified INTEGER DEFAULT 0,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table roles
    db.run(`CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table devices
    db.run(`CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_name TEXT,
        device_serial TEXT UNIQUE,
        sim_iccid TEXT UNIQUE,
        device_type TEXT DEFAULT 'OTT',
        firmware_version TEXT,
        last_seen DATETIME,
        last_battery REAL,
        last_latitude REAL,
        last_longitude REAL,
        last_ip TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table patients
    db.run(`CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        date_of_birth DATE,
        medical_id TEXT UNIQUE,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        postal_code TEXT,
        country TEXT DEFAULT 'France',
        emergency_contact TEXT,
        emergency_phone TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insertion des données de base
    db.run("INSERT OR IGNORE INTO roles (id, name, description) VALUES (1, 'admin', 'Administrateur système')");
    db.run("INSERT OR IGNORE INTO roles (id, name, description) VALUES (2, 'medecin', 'Médecin')");
    db.run("INSERT OR IGNORE INTO roles (id, name, description) VALUES (3, 'technicien', 'Technicien')");

    // Utilisateur test
    db.run("INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, role_id, is_active, email_verified) VALUES (1, 'ymora@free.fr', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Yves', 'Mora', 1, 1, 1)");

    console.log('✓ Base de données SQLite initialisée avec succès');
    console.log('✓ Tables créées: users, roles, devices, patients');
    console.log('✓ Utilisateur test: ymora@free.fr / password');
    
    db.close();
});
