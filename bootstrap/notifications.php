<?php
/**
 * Configuration des services de notifications
 * Charge les constantes SendGrid et Twilio depuis les variables d'environnement
 */

// ============================================================================
// SENDGRID - Configuration Email
// ============================================================================

/**
 * Clé API SendGrid pour l'envoi d'emails
 * Obtenir une clé : https://app.sendgrid.com/settings/api_keys
 */
if (!defined('SENDGRID_API_KEY')) {
    define('SENDGRID_API_KEY', getenv('SENDGRID_API_KEY') ?: '');
}

/**
 * Adresse email d'envoi SendGrid (doit être vérifiée dans SendGrid)
 * Format : noreply@votredomaine.com
 */
if (!defined('SENDGRID_FROM_EMAIL')) {
    define('SENDGRID_FROM_EMAIL', getenv('SENDGRID_FROM_EMAIL') ?: '');
}

// ============================================================================
// TWILIO - Configuration SMS
// ============================================================================

/**
 * Account SID Twilio
 * Obtenir depuis : https://console.twilio.com/
 */
if (!defined('TWILIO_ACCOUNT_SID')) {
    define('TWILIO_ACCOUNT_SID', getenv('TWILIO_ACCOUNT_SID') ?: '');
}

/**
 * Auth Token Twilio
 * Obtenir depuis : https://console.twilio.com/
 */
if (!defined('TWILIO_AUTH_TOKEN')) {
    define('TWILIO_AUTH_TOKEN', getenv('TWILIO_AUTH_TOKEN') ?: '');
}

/**
 * Numéro d'envoi Twilio (format E.164 : +33123456789)
 * Obtenir depuis : https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
 */
if (!defined('TWILIO_FROM_NUMBER')) {
    define('TWILIO_FROM_NUMBER', getenv('TWILIO_FROM_NUMBER') ?: '');
}

