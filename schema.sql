-- ================================================================================
-- OTT Database Schema - VERSION 2.0 COMPLÈTE
-- ================================================================================
-- HAPPLYZ MEDICAL SAS
-- Base de données enterprise avec multi-users, JWT, OTA, notifications, audit
-- ================================================================================

-- Créer la base de données
CREATE DATABASE IF NOT EXISTS ott_data CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ott_data;

-- ============================================================================
-- TABLES V1 (Conservation compatibilité)
-- ============================================================================

CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sim_iccid VARCHAR(20) UNIQUE NOT NULL,
    device_serial VARCHAR(50) UNIQUE,
    device_name VARCHAR(100) COMMENT 'Nom personnalisé du dispositif',
    firmware_version VARCHAR(20) DEFAULT 'v2.0',
    status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
    patient_id INT,
    installation_date DATETIME COMMENT 'Date installation chez patient actuel',
    first_use_date DATETIME COMMENT 'Toute première utilisation du dispositif',
    last_seen DATETIME,
    last_battery DECIMAL(5,2),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_sim (sim_iccid),
    INDEX idx_patient (patient_id),
    INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(10),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS measurements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    timestamp DATETIME NOT NULL,
    flowrate DECIMAL(5,2) NOT NULL COMMENT 'Débit en L/min',
    battery DECIMAL(5,2) COMMENT 'Niveau batterie en %',
    signal_strength INT COMMENT 'Force signal en dBm',
    device_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_device_time (device_id, timestamp DESC),
    INDEX idx_timestamp (timestamp),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(50) PRIMARY KEY,
    device_id INT NOT NULL,
    type ENUM('low_flowrate', 'high_flowrate', 'low_battery', 'device_offline', 'abnormal_flowrate') NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    message TEXT NOT NULL,
    status ENUM('unresolved', 'acknowledged', 'resolved') DEFAULT 'unresolved',
    created_at DATETIME NOT NULL,
    resolved_at DATETIME,
    resolved_by INT COMMENT 'User ID qui a résolu',
    resolution TEXT,
    
    INDEX idx_device (device_id),
    INDEX idx_status (status, severity),
    INDEX idx_created (created_at DESC),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    timestamp DATETIME NOT NULL,
    level ENUM('ERROR', 'WARN', 'INFO', 'SUCCESS') NOT NULL,
    event_type VARCHAR(50) NOT NULL COMMENT 'Type événement: boot, network, measurement, alert...',
    message TEXT NOT NULL,
    details TEXT COMMENT 'Informations supplémentaires JSON',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_device_time (device_id, timestamp DESC),
    INDEX idx_level (level),
    INDEX idx_type (event_type),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- TABLES V2 (Nouvelles fonctionnalités)
-- ============================================================================

-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt hash',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_role (role_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE COMMENT 'admin, medecin, technicien, viewer',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE COMMENT 'devices.view, devices.edit, users.manage...',
    description TEXT,
    category VARCHAR(50) COMMENT 'devices, users, settings, reports...',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notifications
CREATE TABLE IF NOT EXISTS user_notifications_preferences (
    user_id INT PRIMARY KEY,
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    push_enabled BOOLEAN DEFAULT TRUE,
    phone_number VARCHAR(20),
    notify_battery_low BOOLEAN DEFAULT TRUE,
    notify_device_offline BOOLEAN DEFAULT TRUE,
    notify_abnormal_flow BOOLEAN DEFAULT TRUE,
    notify_new_patient BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME COMMENT 'ex: 22:00:00',
    quiet_hours_end TIME COMMENT 'ex: 08:00:00',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications_queue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('email', 'sms', 'push') NOT NULL,
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    subject VARCHAR(255),
    message TEXT NOT NULL,
    data JSON COMMENT 'Données additionnelles',
    status ENUM('pending', 'sent', 'failed', 'cancelled') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    send_after DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_status_type (status, type),
    INDEX idx_user (user_id),
    INDEX idx_send_after (send_after),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL COMMENT 'user.login, device.edit, firmware.upload...',
    entity_type VARCHAR(50) COMMENT 'user, device, patient, firmware...',
    entity_id VARCHAR(50) COMMENT 'ID entité concernée',
    ip_address VARCHAR(45),
    user_agent TEXT,
    old_value JSON COMMENT 'Valeur avant modification',
    new_value JSON COMMENT 'Valeur après modification',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at DESC),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- OTA & Configuration
CREATE TABLE IF NOT EXISTS device_configurations (
    device_id INT PRIMARY KEY,
    firmware_version VARCHAR(20) DEFAULT '2.0.0',
    target_firmware_version VARCHAR(20) COMMENT 'Version cible pour OTA',
    firmware_url TEXT COMMENT 'URL binaire firmware',
    sleep_minutes INT DEFAULT 30,
    measurement_duration_ms INT DEFAULT 100,
    send_every_n_wakeups INT DEFAULT 1,
    calibration_coefficients JSON COMMENT '[a, b, c] pour polynôme',
    ota_pending BOOLEAN DEFAULT FALSE,
    ota_requested_at DATETIME,
    ota_completed_at DATETIME,
    last_config_update DATETIME,
    config_applied_at DATETIME COMMENT 'Dernière fois device a récupéré config',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_ota_pending (ota_pending),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS firmware_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(20) NOT NULL UNIQUE,
    file_path VARCHAR(255) NOT NULL COMMENT 'Chemin fichier .bin',
    file_size BIGINT,
    checksum VARCHAR(64) COMMENT 'SHA256',
    release_notes TEXT,
    is_stable BOOLEAN DEFAULT FALSE,
    min_battery_pct INT DEFAULT 30 COMMENT 'Batterie min pour OTA',
    uploaded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_version (version),
    INDEX idx_stable (is_stable),
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- DONNÉES INITIALES
-- ============================================================================

-- Rôles
INSERT INTO roles (id, name, description) VALUES
(1, 'admin', 'Administrateur système - Accès complet'),
(2, 'medecin', 'Médecin - Consultation patients et dispositifs'),
(3, 'technicien', 'Technicien - Maintenance dispositifs'),
(4, 'viewer', 'Observateur - Lecture seule')
ON DUPLICATE KEY UPDATE name=name;

-- Permissions
INSERT INTO permissions (code, description, category) VALUES
-- Devices
('devices.view', 'Voir liste et détails dispositifs', 'devices'),
('devices.edit', 'Modifier dispositifs', 'devices'),
('devices.delete', 'Supprimer dispositifs', 'devices'),
('devices.ota', 'Mise à jour OTA firmware', 'devices'),
('devices.configure', 'Configurer paramètres à distance', 'devices'),
-- Patients
('patients.view', 'Voir liste et détails patients', 'patients'),
('patients.edit', 'Modifier patients', 'patients'),
('patients.delete', 'Supprimer patients', 'patients'),
('patients.export', 'Exporter données patients', 'patients'),
-- Users
('users.view', 'Voir utilisateurs', 'users'),
('users.manage', 'Gérer utilisateurs', 'users'),
('users.roles', 'Gérer rôles et permissions', 'users'),
-- Reports & Alerts
('reports.view', 'Voir rapports', 'reports'),
('reports.export', 'Exporter rapports', 'reports'),
('alerts.view', 'Voir alertes', 'alerts'),
('alerts.manage', 'Gérer alertes', 'alerts'),
-- Audit & Settings
('audit.view', 'Voir logs audit', 'audit'),
('settings.view', 'Voir paramètres', 'settings'),
('settings.edit', 'Modifier paramètres', 'settings')
ON DUPLICATE KEY UPDATE code=code;

-- Permissions par rôle
-- Admin: toutes
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
ON DUPLICATE KEY UPDATE role_id=role_id;

-- Médecin: patients + devices (lecture) + reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN (
    'devices.view', 'patients.view', 'patients.edit', 'patients.export',
    'reports.view', 'reports.export', 'alerts.view'
)
ON DUPLICATE KEY UPDATE role_id=role_id;

-- Technicien: devices + OTA + alerts
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN (
    'devices.view', 'devices.edit', 'devices.ota', 'devices.configure',
    'alerts.view', 'alerts.manage', 'reports.view'
)
ON DUPLICATE KEY UPDATE role_id=role_id;

-- Viewer: lecture seule
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code IN (
    'devices.view', 'patients.view', 'reports.view', 'alerts.view'
)
ON DUPLICATE KEY UPDATE role_id=role_id;

-- Utilisateurs système (mots de passe à définir lors du premier déploiement)
-- IMPORTANT: Changer les password_hash avec de vrais hashes bcrypt
-- Pour générer: <?php echo password_hash('VotreMotDePasse', PASSWORD_BCRYPT); ?>
INSERT INTO users (id, email, password_hash, first_name, last_name, role_id) VALUES
(1, 'admin@example.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'Demo', 1),
(2, 'tech@example.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Tech', 'Demo', 3)
ON DUPLICATE KEY UPDATE email=email;

-- Préférences notifications
INSERT INTO user_notifications_preferences (user_id, email_enabled, sms_enabled, phone_number) VALUES
(1, TRUE, TRUE, '+33612345678'),
(2, TRUE, FALSE, '+33612345679')
ON DUPLICATE KEY UPDATE user_id=user_id;

-- Patients réels
INSERT INTO patients (id, first_name, last_name, phone, city, postal_code, birth_date) VALUES
(1, 'Pierre', 'Durand', '0612345601', 'Paris', '75015', '1945-03-15'),
(2, 'Paul', 'Martin', '0612345602', 'Lyon', '69001', '1952-07-22'),
(3, 'Jacques', 'Bernard', '0612345603', 'Marseille', '13001', '1948-11-30')
ON DUPLICATE KEY UPDATE id=id;

-- Dispositifs OTT pour les 3 patients
INSERT INTO devices (id, sim_iccid, device_serial, device_name, patient_id, installation_date, first_use_date, last_seen, last_battery, latitude, longitude) VALUES
(1, '89330123456789012345', 'OTT-PIERRE-001', 'OTT Pierre Paris', 1, DATE_SUB(NOW(), INTERVAL 45 DAY), DATE_SUB(NOW(), INTERVAL 120 DAY), NOW(), 85.5, 48.8566, 2.3522),
(2, '89330123456789012346', 'OTT-PAUL-002', 'OTT Paul Lyon', 2, DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 2 HOUR), 72.3, 45.7640, 4.8357),
(3, '89330123456789012347', 'OTT-JACQUES-003', 'OTT Jacques Marseille', 3, DATE_SUB(NOW(), INTERVAL 60 DAY), DATE_SUB(NOW(), INTERVAL 150 DAY), DATE_SUB(NOW(), INTERVAL 5 HOUR), 68.9, 43.2965, 5.3698)
ON DUPLICATE KEY UPDATE id=id;

-- Configuration par défaut pour dispositifs
INSERT INTO device_configurations (device_id, firmware_version, sleep_minutes, measurement_duration_ms, calibration_coefficients) VALUES
(1, '2.0.0', 30, 100, '[0, 1, 0]'),
(2, '2.0.0', 30, 100, '[0, 1, 0]'),
(3, '2.0.0', 30, 100, '[0, 1, 0]')
ON DUPLICATE KEY UPDATE device_id=device_id;

-- Firmware versions
INSERT INTO firmware_versions (version, file_path, file_size, is_stable, release_notes, uploaded_by) VALUES
('2.0.0', 'firmwares/fw_ott_v2.0.0.bin', 925000, TRUE, 'Version 2.0 stable avec OTA + JWT + Notifications', 1)
ON DUPLICATE KEY UPDATE version=version;

-- Mesures exemple pour les 3 dispositifs (dernières 24h)
INSERT INTO measurements (device_id, timestamp, flowrate, battery, device_status) VALUES
-- Pierre (device 1) - Usage régulier
(1, DATE_SUB(NOW(), INTERVAL 30 MINUTE), 3.45, 85.5, 'TIMER'),
(1, DATE_SUB(NOW(), INTERVAL 60 MINUTE), 3.21, 85.8, 'TIMER'),
(1, DATE_SUB(NOW(), INTERVAL 90 MINUTE), 3.67, 86.0, 'TIMER'),
(1, DATE_SUB(NOW(), INTERVAL 2 HOUR), 2.98, 86.2, 'TIMER'),
(1, DATE_SUB(NOW(), INTERVAL 3 HOUR), 3.12, 86.5, 'TIMER'),
-- Paul (device 2) - Débit plus élevé
(2, DATE_SUB(NOW(), INTERVAL 2 HOUR), 4.12, 72.3, 'TIMER'),
(2, DATE_SUB(NOW(), INTERVAL 3 HOUR), 4.35, 73.1, 'TIMER'),
(2, DATE_SUB(NOW(), INTERVAL 4 HOUR), 4.01, 73.8, 'TIMER'),
-- Jacques (device 3) - Usage léger
(3, DATE_SUB(NOW(), INTERVAL 5 HOUR), 2.15, 68.9, 'TIMER'),
(3, DATE_SUB(NOW(), INTERVAL 6 HOUR), 2.34, 69.5, 'TIMER'),
(3, DATE_SUB(NOW(), INTERVAL 7 HOUR), 1.98, 70.1, 'TIMER')
ON DUPLICATE KEY UPDATE id=id;

-- ============================================================================
-- VUES
-- ============================================================================

CREATE OR REPLACE VIEW device_stats AS
SELECT 
    d.id,
    d.sim_iccid,
    d.device_name,
    d.status,
    d.last_seen,
    d.last_battery,
    p.first_name,
    p.last_name,
    dc.firmware_version,
    dc.ota_pending,
    COUNT(DISTINCT m.id) as total_measurements,
    AVG(m.flowrate) as avg_flowrate_7d,
    TIMESTAMPDIFF(MINUTE, d.last_seen, NOW()) as minutes_since_last_seen
FROM devices d
LEFT JOIN patients p ON d.patient_id = p.id
LEFT JOIN device_configurations dc ON d.id = dc.device_id
LEFT JOIN measurements m ON d.id = m.device_id 
    AND m.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY d.id;

CREATE OR REPLACE VIEW users_with_roles AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.is_active,
    u.last_login,
    r.name as role_name,
    r.description as role_description,
    GROUP_CONCAT(p.code) as permissions
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.last_login, r.name, r.description;

-- ================================================================================
-- FIN SCHÉMA V2.0
-- ================================================================================

