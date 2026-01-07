<?php
/**
 * API REST V2.0 - HAPPLYZ MEDICAL OTT
 * Version refactorisée et modulaire
 */

// Charger le bootstrap (tous les requires)
require_once __DIR__ . '/api/bootstrap.php';

// Charger la configuration CORS
require_once __DIR__ . '/api/cors.php';

// Router principal
require_once __DIR__ . '/api/index.php';
