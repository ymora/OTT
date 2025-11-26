<?php
/**
 * Firmware Compilation Operations
 * Compile firmware and send SSE messages
 */

// Include functions from old file if not already defined (temporary during refactoring)
if (!function_exists('handleCompileFirmware')) {
    require_once __DIR__ . '/../firmwares.php.old';
}

