/**
 * Valeurs par défaut pour la configuration des dispositifs
 * Ces valeurs remplacent les valeurs par défaut du firmware
 * et sont envoyées via USB lors de la configuration
 */

export const DEVICE_DEFAULTS = {
  // Réseau
  sim_pin: '1234',
  operator: '', // Vide = détection automatique
  apn: 'free', // APN par défaut (sera remplacé par détection automatique si opérateur détecté)
  
  // Mesure
  sleep_minutes: 1440, // 24 heures
  measurement_duration_ms: 5000, // 5 secondes
  send_every_n_wakeups: 1, // Envoi à chaque réveil
  calibration_coefficients: [0, 1, 0], // [a0, a1, a2]
  gps_enabled: false,
  roaming_enabled: false,
  
  // Airflow
  airflow_passes: 2,
  airflow_samples_per_pass: 10,
  airflow_delay_ms: 5, // 5ms
  
  // Modem
  watchdog_seconds: 30, // 30 secondes
  modem_boot_timeout_ms: 20000, // 20 secondes
  sim_ready_timeout_ms: 45000, // 45 secondes
  network_attach_timeout_ms: 120000, // 120 secondes (2 minutes)
  modem_max_reboots: 3,
  
  // OTA
  ota_primary_url: '',
  ota_fallback_url: '',
  ota_md5: ''
}

/**
 * Applique les valeurs par défaut à une configuration
 * @param {Object} config - Configuration partielle
 * @returns {Object} Configuration complète avec valeurs par défaut
 */
export function applyDeviceDefaults(config = {}) {
  return {
    ...DEVICE_DEFAULTS,
    ...config
  }
}

/**
 * Construit une configuration complète avec valeurs par défaut pour l'envoi USB
 * @param {Object} config - Configuration partielle depuis le formulaire
 * @returns {Object} Configuration complète prête à être envoyée
 */
export function buildCompleteConfigForUsb(config = {}) {
  // Appliquer les valeurs par défaut
  const completeConfig = applyDeviceDefaults(config)
  
  // Convertir les valeurs pour l'envoi (sec → ms, min → sec, etc.)
  return {
    // Réseau
    sim_pin: completeConfig.sim_pin || DEVICE_DEFAULTS.sim_pin,
    operator: completeConfig.operator || '',
    apn: completeConfig.apn || DEVICE_DEFAULTS.apn,
    
    // Mesure
    sleep_minutes: completeConfig.sleep_minutes ?? DEVICE_DEFAULTS.sleep_minutes,
    measurement_duration_ms: completeConfig.measurement_duration_ms ?? DEVICE_DEFAULTS.measurement_duration_ms,
    send_every_n_wakeups: completeConfig.send_every_n_wakeups ?? DEVICE_DEFAULTS.send_every_n_wakeups,
    calibration_coefficients: completeConfig.calibration_coefficients || DEVICE_DEFAULTS.calibration_coefficients,
    gps_enabled: completeConfig.gps_enabled ?? DEVICE_DEFAULTS.gps_enabled,
    roaming_enabled: completeConfig.roaming_enabled ?? DEVICE_DEFAULTS.roaming_enabled,
    
    // Airflow
    airflow_passes: completeConfig.airflow_passes ?? DEVICE_DEFAULTS.airflow_passes,
    airflow_samples_per_pass: completeConfig.airflow_samples_per_pass ?? DEVICE_DEFAULTS.airflow_samples_per_pass,
    airflow_delay_ms: completeConfig.airflow_delay_ms ?? DEVICE_DEFAULTS.airflow_delay_ms,
    
    // Modem
    watchdog_seconds: completeConfig.watchdog_seconds ?? DEVICE_DEFAULTS.watchdog_seconds,
    modem_boot_timeout_ms: completeConfig.modem_boot_timeout_ms ?? DEVICE_DEFAULTS.modem_boot_timeout_ms,
    sim_ready_timeout_ms: completeConfig.sim_ready_timeout_ms ?? DEVICE_DEFAULTS.sim_ready_timeout_ms,
    network_attach_timeout_ms: completeConfig.network_attach_timeout_ms ?? DEVICE_DEFAULTS.network_attach_timeout_ms,
    modem_max_reboots: completeConfig.modem_max_reboots ?? DEVICE_DEFAULTS.modem_max_reboots,
    
    // OTA
    ota_primary_url: completeConfig.ota_primary_url || '',
    ota_fallback_url: completeConfig.ota_fallback_url || '',
    ota_md5: completeConfig.ota_md5 || ''
  }
}








