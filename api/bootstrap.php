<?php
/**
 * API Bootstrap - Centralise tous les requires
 * Version refactorisée pour api.php
 */

// Bootstrap core
require_once __DIR__ . '/bootstrap/env_loader.php';
require_once __DIR__ . '/bootstrap/database.php';
require_once __DIR__ . '/bootstrap/notifications.php';

// Helpers et utilitaires
require_once __DIR__ . '/api/helpers.php';
require_once __DIR__ . '/api/helpers_sql.php';
require_once __DIR__ . '/api/validators.php';
require_once __DIR__ . '/api/cache.php';

// Handlers principaux
require_once __DIR__ . '/api/handlers/auth.php';

// Handlers Devices (modulaires)
require_once __DIR__ . '/api/handlers/devices/utils.php';
require_once __DIR__ . '/api/handlers/devices/crud.php';
require_once __DIR__ . '/api/handlers/devices/patients.php';
require_once __DIR__ . '/api/handlers/devices/measurements.php';
require_once __DIR__ . '/api/handlers/devices/commands.php';
require_once __DIR__ . '/api/handlers/devices/alerts.php';
require_once __DIR__ . '/api/handlers/devices/logs.php';
require_once __DIR__ . '/api/handlers/devices/config.php';
require_once __DIR__ . '/api/handlers/devices/ota.php';
require_once __DIR__ . '/api/handlers/devices/reports.php';

// Autres handlers
require_once __DIR__ . '/api/handlers/firmwares.php';
require_once __DIR__ . '/api/handlers/notifications.php';
require_once __DIR__ . '/api/handlers/usb_logs.php';
require_once __DIR__ . '/api/handlers/database_audit.php';
require_once __DIR__ . '/api/handlers/statistics.php';
require_once __DIR__ . '/api/handlers/system.php';
