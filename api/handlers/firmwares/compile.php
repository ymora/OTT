<?php
/**
 * Firmware Compilation Operations
 * Compile firmware and send SSE messages
 */

// Include functions from old file (temporary during refactoring)
// The old file has been corrected with:
// - popen() fallback instead of exec() for non-blocking SSE
// - getProjectRoot() instead of __DIR__ for path resolution
require_once __DIR__ . '/../firmwares.php.old';

