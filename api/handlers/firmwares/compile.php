<?php
/**
 * Firmware Compilation Operations
 * Compile firmware and send SSE messages
 */

// Temporarily include functions from old file - will be extracted progressively
// The old file now has the fix for exec() -> popen() fallback
require_once __DIR__ . '/../firmwares.php.old';

