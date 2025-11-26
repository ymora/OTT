<?php
/**
 * Firmware Upload Operations
 * Upload firmware .bin, upload .ino, and update .ino operations
 */

// Include functions from old file if not already defined (temporary during refactoring)
if (!function_exists('handleUploadFirmware')) {
    require_once __DIR__ . '/../firmwares.php.old';
}

