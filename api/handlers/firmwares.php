<?php
/**
 * API Handlers - Firmwares (Modular)
 * This file includes all firmware-related handlers from modular files
 */

// Include helper functions
require_once __DIR__ . '/firmwares/helpers.php';

// Include modular handlers
require_once __DIR__ . '/firmwares/crud.php';
require_once __DIR__ . '/firmwares/upload.php';
require_once __DIR__ . '/firmwares/download.php';
// compile.php supprimé - remplacé par compile_optimized.php (plus rapide, moins de logs)

