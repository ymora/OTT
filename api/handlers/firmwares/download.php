<?php
/**
 * Firmware Download Operations
 * Download firmware .bin and get .ino content
 */

// Include functions from old file if not already defined (temporary during refactoring)
if (!function_exists('handleDownloadFirmware')) {
    require_once __DIR__ . '/../firmwares.php.old';
}

