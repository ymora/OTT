<?php
/**
 * API Bootstrap - Centralise tous les requires
 * Version refactorisée pour api.php
 */

// Bootstrap core - corriger les chemins (remonter d'un niveau)
require_once __DIR__ . '/../bootstrap/env_loader.php';
require_once __DIR__ . '/../bootstrap/database.php';
require_once __DIR__ . '/../bootstrap/notifications.php';

// Helpers et utilitaires
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/helpers_sql.php';
require_once __DIR__ . '/validators.php';
require_once __DIR__ . '/cache.php';

// Handlers principaux
require_once __DIR__ . '/handlers/auth.php';

// Handlers Devices (modulaires)
require_once __DIR__ . '/handlers/devices/utils.php';
require_once __DIR__ . '/handlers/devices/crud.php';
require_once __DIR__ . '/handlers/devices/patients.php';
require_once __DIR__ . '/handlers/devices/measurements.php';
require_once __DIR__ . '/handlers/devices/commands.php';
require_once __DIR__ . '/handlers/devices/alerts.php';
require_once __DIR__ . '/handlers/devices/logs.php';
require_once __DIR__ . '/handlers/devices/config.php';
require_once __DIR__ . '/handlers/devices/ota.php';
require_once __DIR__ . '/handlers/devices/reports.php';

// Autres handlers
require_once __DIR__ . '/handlers/firmwares.php';
require_once __DIR__ . '/handlers/notifications.php';
require_once __DIR__ . '/handlers/usb_logs.php';
require_once __DIR__ . '/handlers/database_audit.php';
require_once __DIR__ . '/handlers/migrations/migration_handlers.php';
require_once __DIR__ . '/handlers/system.php';
