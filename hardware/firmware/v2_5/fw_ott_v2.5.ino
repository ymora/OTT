/**
 * ================================================================
 *  OTT Firmware v2.5
 * ================================================================
 * 
 * MATÉRIEL : LILYGO TTGO T-A7670G ESP32 Dev Board
 * ================================================
 * - ESP32-WROVER-B (240MHz dual-core, 4MB Flash, 8MB PSRAM)
 * - Module SIMCOM A7670G (LTE Cat-1, 4G, GPRS, GPS)
 * - Support batterie 18650 avec circuit de charge intégré
 * - Carte microSD, antenne 4G/GPS externe
 * 
 * FONCTIONNALITÉS PRINCIPALES :
 * ===============================
 * - Mesure du débit d'oxygène, batterie, RSSI, GPS
 * - Envoi automatique des mesures via OTA (réseau) et USB (si connecté)
 * - Format unifié : identifiants + mesures + configuration dans chaque message
 * - Mode hybride : envoi au boot + envoi sur changement de flux d'air
 * - Configuration via USB (prioritaire) ou OTA
 * - TinyGSM A7670G : GPRS, HTTPS, GPS
 * - Détection automatique opérateur : IMSI (prioritaire) + ICCID (fallback)
 * - Support automatique opérateurs français : Orange, SFR, Free, Bouygues
 * - Gestion intelligente roaming : APN de la carte SIM (pas du réseau)
 * - Détection spéciale Free Pro : via IMSI + APN par défaut (résout préfixes ICCID partagés)
 * - Persistence : APN/ICCID/PIN/Serial/calibration en NVS
 * - Logs clairs et informatifs : messages compréhensibles (plus de codes techniques)
 * - Logs : POST /devices/logs + tampon NVS si réseau coupé
 * - Commandes OTA : SET_SLEEP_SECONDS, UPDATE_CONFIG, UPDATE_CALIBRATION, OTA_REQUEST, RESET_CONFIG
 * - Deep sleep : économie d'énergie quand inactif
 * - Numérotation automatique : OTT-XX-XXX → OTT-25-001 (généré par backend)
 */

// Configuration du modem SIMCOM A7670G (LTE Cat-1)
// Utilisation du driver SIM7600 (compatible avec A7670G)
// Le A7670G et SIM7600 sont de la même famille SIMCOM et partagent
// la plupart des commandes AT. Le driver SIM7600 fonctionne correctement.
#define TINY_GSM_MODEM_SIM7600   // Compatible avec A7670G (même famille SIMCOM)
#define TINY_GSM_RX_BUFFER 1024  // Buffer AT -> augmente la stabilité HTTPS

#include <Arduino.h>
#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Update.h>
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <esp_sleep.h>
#include <vector>
#include <algorithm>

#define MODEM_BAUDRATE 115200
#define MODEM_TX_PIN 26
#define MODEM_RX_PIN 27
#define MODEM_RESET_PIN 5
#define MODEM_RESET_LEVEL HIGH
#define BOARD_PWRKEY_PIN 4
#define BOARD_POWERON_PIN 12
#define SerialAT Serial1

#define SENSOR_PIN 33
#define BATTERY_ADC_PIN 35

// VALEURS PAR DÉFAUT RETIRÉES - Les valeurs par défaut sont maintenant gérées par le frontend
// et envoyées via USB lors de la configuration UPDATE_CONFIG
// Ces constantes sont conservées uniquement comme fallback de sécurité si aucune config n'est reçue
static constexpr uint32_t DEFAULT_SLEEP_MINUTES = 1440;  // 24 heures (fallback uniquement - sera écrasé par config USB)
static constexpr uint8_t MAX_COMMANDS = 4;
static constexpr uint32_t MODEM_BOOT_TIMEOUT_DEFAULT_MS = 20000;       // Fallback uniquement
static constexpr uint32_t SIM_READY_TIMEOUT_DEFAULT_MS = 45000;        // Fallback uniquement
static constexpr uint32_t NETWORK_ATTACH_TIMEOUT_DEFAULT_MS = 120000;  // Fallback uniquement
static constexpr uint8_t MODEM_MAX_REBOOTS_DEFAULT = 3;  // Fallback uniquement
static constexpr uint32_t WATCHDOG_TIMEOUT_DEFAULT_SEC = 30;  // Fallback uniquement
static constexpr uint8_t MIN_WATCHDOG_TIMEOUT_SEC = 5;
static constexpr uint32_t OTA_STREAM_TIMEOUT_MS = 20000;

static constexpr uint32_t USB_BOOT_DETECT_WINDOW_MS = 2000;  // Fenêtre au boot pour laisser le temps au PC d'ouvrir le port série

// --- Paramètres modifiables localement (puis écrasés via UPDATE_CONFIG) ---
// VALEURS PAR DÉFAUT RETIRÉES - Les valeurs par défaut sont maintenant gérées par le frontend
// et envoyées via USB lors de la configuration
#ifndef OTT_DEFAULT_SIM_PIN
#define OTT_DEFAULT_SIM_PIN ""  // Vide - sera configuré par le frontend
#endif
#ifndef OTT_DEFAULT_APN
#define OTT_DEFAULT_APN ""  // Vide - sera configuré par le frontend
#endif
#ifndef OTT_DEFAULT_ICCID
#define OTT_DEFAULT_ICCID "89330123456789012345"
#endif

// Numérotation automatique des dispositifs (v2.5)
// ================================================
// À la sortie d'usine, le firmware est flashé avec le serial par défaut "OTT-XX-XXX"
//
// Lors de la première connexion au backend (via OTA ou USB), le serveur :
// 1. Détecte le serial temporaire "OTT-XX-XXX"
// 2. Génère automatiquement un serial définitif au format : OTT-YY-NNN
//    - YY = année en cours (25 pour 2025, 26 pour 2026, etc.)
//    - NNN = numéro séquentiel à 3 chiffres (001, 002, 003...)
// 3. Envoie une commande UPDATE_CONFIG pour mettre à jour le serial en NVS
//
// Exemples :
// - Premier dispositif de 2025 : OTT-XX-XXX → OTT-25-001
// - Deuxième dispositif de 2025 : OTT-XX-XXX → OTT-25-002
// - Premier dispositif de 2026 : OTT-XX-XXX → OTT-26-001
//
// Note : Le serial est IMMUABLE après attribution (identifiant unique du dispositif)
#ifndef OTT_DEFAULT_SERIAL
#define OTT_DEFAULT_SERIAL "OTT-XX-XXX"
#endif

// ============================================================================
// AUTHENTIFICATION API
// ============================================================================
// L'API authentifie les dispositifs par leur sim_iccid UNIQUEMENT.
// Pas de JWT requis pour l'envoi de mesures (endpoint /devices/measurements).
// Sécurité : L'ICCID est un identifiant unique de 20 chiffres (ex: 89331508210512788370)
//            difficilement falsifiable, cryptographiquement sécurisé par l'opérateur SIM.
String SIM_PIN = OTT_DEFAULT_SIM_PIN;  // Vide par défaut - sera configuré par frontend via USB
String NETWORK_APN = "";  // Vide par défaut - sera configuré par frontend via USB (plus de valeur par défaut "free")
String DEVICE_ICCID = OTT_DEFAULT_ICCID;
String DEVICE_SERIAL = OTT_DEFAULT_SERIAL;
String DETECTED_OPERATOR = "";  // Opérateur détecté (MCC+MNC) - sauvegardé pour réutilisation
bool apnManual = false;         // Flag indiquant que l'APN a été configuré manuellement (ne pas écraser par détection auto)
bool apnLoadedFromNVS = false;  // Flag indiquant que l'APN a été chargé depuis NVS (donc configuré, même si c'est la valeur par défaut)

const char* API_HOST = "ott-jbln.onrender.com";
const uint16_t API_PORT = 443;
const char* API_PREFIX = "/api.php";
const char* PATH_MEASURE = "/devices/measurements";
const char* PATH_ACK = "/devices/commands/ack";
const char* PATH_LOGS = "/devices/logs";

// Version du firmware - stockée dans une section spéciale pour extraction depuis le binaire
// Cette constante sera visible dans le binaire compilé via une section .version
#define FIRMWARE_VERSION_STR "2.5"
const char* FIRMWARE_VERSION = FIRMWARE_VERSION_STR;

// Section de version lisible depuis le binaire (utilise __attribute__ pour créer une section)
// Cette section sera visible dans le fichier .bin compilé
__attribute__((section(".version"))) const char firmware_version_section[] = "OTT_FW_VERSION=" FIRMWARE_VERSION_STR "\0";

const size_t MAX_OFFLINE_LOGS = 10;  // Taille max du tampon de logs NVS

// ============================================================================
// SYSTÈME DE LOGS AVEC NIVEAUX
// ============================================================================
enum LogLevel {
  LOG_ERROR = 0,  // Erreurs critiques uniquement
  LOG_WARN = 1,   // Avertissements importants
  LOG_INFO = 2,   // Informations normales (default)
  LOG_DEBUG = 3   // Debug verbeux
};

LogLevel currentLogLevel = LOG_INFO;  // Niveau par défaut

struct Measurement {
  float flow;     // Débit en L/min (après calibration)
  float battery;  // Batterie en %
  int rssi;       // Force du signal en dBm
};

struct Command {
  int32_t id;         // Identifiant unique (utilisé pour ACK)
  String verb;        // Nom de la commande (SET_SLEEP_SECONDS, ...)
  String payloadRaw;  // Payload JSON complet (ex. UPDATE_CONFIG)
};

TinyGsm modem(SerialAT);
TinyGsmClientSecure netClient(modem);
TinyGsmClient plainNetClient(modem);
Preferences prefs;
float CAL_OVERRIDE_A0 = NAN;
float CAL_OVERRIDE_A1 = NAN;
float CAL_OVERRIDE_A2 = NAN;
bool modemReady = false;

struct PendingLog {
  String level;
  String type;
  String message;
};
std::vector<PendingLog> offlineLogs;

// VALEURS PAR DÉFAUT RETIRÉES - Les valeurs par défaut sont maintenant gérées par le frontend
// Ces variables sont initialisées à 0/vide et doivent être configurées via USB
static uint32_t modemBootTimeoutMs = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint32_t simReadyTimeoutMs = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint32_t networkAttachTimeoutMs = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint8_t modemMaxReboots = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint32_t configuredSleepMinutes = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint8_t sendEveryNWakeups = 0;  // 0 = non configuré - sera configuré par frontend via USB
// Utiliser RTC_DATA_ATTR pour persister le compteur à travers les deep sleeps
RTC_DATA_ATTR static uint8_t wakeupCounter = 0;  // Compteur de wakeups depuis le dernier envoi (persiste après deep sleep)
static uint16_t airflowPasses = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint16_t airflowSamplesPerPass = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint16_t airflowSampleDelayMs = 0;  // 0 = non configuré - sera configuré par frontend via USB
static uint32_t watchdogTimeoutSeconds = 0;  // 0 = non configuré - sera configuré par frontend via USB
static bool gpsEnabled = false;     // GPS DÉSACTIVÉ par défaut (peut bloquer modem/consommer batterie)
static bool roamingEnabled = true;  // Itinérance ACTIVÉE par défaut (permet utilisation réseau autre opérateur)

// Variables pour mode hybride (détection changement flux)
static float lastFlowValue = 0.0;
static unsigned long lastMeasurementTime = 0;
static unsigned long lastOtaCheck = 0;                        // Initialisé à 0 pour première vérification immédiate
static const float FLOW_CHANGE_THRESHOLD = 0.5;               // Seuil de changement (L/min)
static const unsigned long MIN_INTERVAL_MS = 5000;            // Intervalle minimum entre mesures (5s)
static const unsigned long IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes sans changement → light sleep
static const unsigned long OTA_CHECK_INTERVAL_MS = 30000;     // Vérifier commandes OTA toutes les 30s

// Variables pour mode USB dynamique
static bool usbModeActive = false;
static unsigned long lastUsbCheck = 0;
static const unsigned long USB_CHECK_INTERVAL_MS = 1000;  // Vérifier USB toutes les 1000ms (réduit oscillations)
static int usbStateCounter = 0;                          // Compteur pour debounce (éviter oscillations)
static const int USB_STATE_THRESHOLD = 6;                // Nombre de vérifications consécutives nécessaires pour changer d'état (augmenté pour stabilité)
static bool watchdogConfigured = false;
static String otaPrimaryUrl;
static String otaFallbackUrl;
static String otaExpectedMd5;
static String currentFirmwareVersion;   // Version actuellement flashée (pour rollback)
static String previousFirmwareVersion;  // Version précédente (pour rollback)
static bool otaInProgress = false;      // Flag pour indiquer qu'une OTA est en cours
static uint8_t bootFailureCount = 0;    // Compteur d'échecs de boot (pour rollback automatique)

// --- Prototypes (chaque fonction est documentée dans son bloc) ---
void initSerial();
void initBoard();
void initModem();
bool startModem();
void stopModem();
bool waitForSimReady(uint32_t timeoutMs);
bool attachNetwork(uint32_t timeoutMs);
bool connectData(uint32_t timeoutMs);
String detectSimOperatorFromIccid(const String& iccid);  // Détecte l'opérateur de la carte SIM via ICCID
String detectSimOperatorFromImsi();                      // Détecte l'opérateur de la carte SIM via IMSI (plus fiable)
String getRecommendedApnForOperator(const String& operatorCode);
String getOperatorName(const String& operatorCode);
void saveNetworkParams(const String& oper, const String& apn);  // Helper pour sauvegarder opérateur et APN
bool checkEpsStatus(bool& epsOk, String& epsStatus);            // Helper pour vérifier l'état EPS (LTE)
bool setApn(const String& apn);                                 // Helper pour configurer l'APN (évite la duplication de code)
bool attachNetworkWithRetry(uint32_t timeoutMs, uint8_t maxRetries = 3);
void goToSleep(uint32_t minutes);
void configureWatchdog(uint32_t timeoutSeconds);
void feedWatchdog();
void logRuntimeConfig();
void logRadioSnapshot(const char* stage);
static const char* regStatusToString(RegStatus status);

// Fonction utilitaire pour formater le temps depuis millis() en HH:MM:SS
String formatTimeFromMillis(unsigned long ms) {
  unsigned long seconds = ms / 1000;
  unsigned long hours = seconds / 3600;
  unsigned long minutes = (seconds % 3600) / 60;
  unsigned long secs = seconds % 60;

  char buffer[9];
  snprintf(buffer, sizeof(buffer), "%02lu:%02lu:%02lu", hours, minutes, secs);
  return String(buffer);
}

// ============================================================================
// FONCTIONS DE LOG AVEC NIVEAUX
// ============================================================================
void logMsg(LogLevel level, const char* tag, const String& message) {
  if (level <= currentLogLevel) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[%s] %s\n", timeStr.c_str(), tag, message.c_str());
  }
}

// Raccourcis pour faciliter l'utilisation
#define LOG_E(tag, msg) logMsg(LOG_ERROR, tag, msg)
#define LOG_W(tag, msg) logMsg(LOG_WARN, tag, msg)
#define LOG_I(tag, msg) logMsg(LOG_INFO, tag, msg)
#define LOG_D(tag, msg) logMsg(LOG_DEBUG, tag, msg)

// Fonction utilitaire pour construire le nom du dispositif (évite duplication)
String buildDeviceName() {
  String deviceName = "OTT-";
  if (DEVICE_ICCID.length() >= 4) {
    deviceName += DEVICE_ICCID.substring(DEVICE_ICCID.length() - 4);
  } else if (DEVICE_SERIAL.length() >= 4) {
    deviceName += DEVICE_SERIAL.substring(DEVICE_SERIAL.length() - 4);
  } else {
    deviceName += "XXXX";
  }
  return deviceName;
}

// Fonction utilitaire pour valider des coordonnées GPS
bool isValidGpsCoordinates(float lat, float lon) {
  return (lat >= -90.0f && lat <= 90.0f && lon >= -180.0f && lon <= 180.0f && (lat != 0.0f || lon != 0.0f));
}

// Fonction utilitaire pour valider et limiter une String
String sanitizeString(const String& input, size_t maxLength) {
  if (input.length() > maxLength) {
    return input.substring(0, maxLength);
  }
  return input;
}

float measureBattery();
float measureAirflowRaw();
float airflowToLpm(float raw);
int8_t csqToRssi(int8_t csq);  // Conversion CSQ (0-31) vers dBm selon 3GPP TS 27.007

bool httpPost(const char* path, const String& body, String* response = nullptr);
bool httpGet(const char* path, String* response);
bool sendLog(const char* level, const String& message, const char* type = "firmware");

bool sendMeasurement(const Measurement& m, float* latitude = nullptr, float* longitude = nullptr, const char* status = "TIMER");
bool sendMeasurementWithContext(const char* context);  // Fonction factorisée pour éviter duplication
int fetchCommands(Command* out, size_t maxCount);
bool acknowledgeCommand(const Command& cmd, bool success, const char* message);
void handleCommand(const Command& cmd, uint32_t& nextSleepMinutes);
void loadConfig();
void saveConfig();
void updateCalibration(float a0, float a1, float a2);
void flushOfflineLogs();
void saveOfflineLogs();
bool sendLogImmediate(const String& level, const String& message, const String& type);
void enqueueOfflineLog(const String& level, const String& type, const String& message);
bool deserializePayload(const Command& cmd, DynamicJsonDocument& doc);
uint32_t extractSleepSeconds(const DynamicJsonDocument& payloadDoc);
bool performOtaUpdate(const String& url, const String& expectedMd5, const String& expectedVersion);
bool parseUrl(const String& url, bool& secure, String& host, uint16_t& port, String& path);
void validateBootAndMarkStable();
void checkBootFailureAndRollback();
void markFirmwareAsStable();
void rollbackToPreviousFirmware();
Measurement captureSensorSnapshot();
void emitDebugMeasurement(const Measurement& m, uint32_t sequence, uint32_t intervalMs, float* latitude = nullptr, float* longitude = nullptr);
void handleSerialCommand(const String& command);
bool getDeviceLocation(float* latitude, float* longitude);
bool getDeviceLocationFast(float* latitude, float* longitude);

void setup() {
  // ⚠️ CRITIQUE: Initialiser le watchdog IMMÉDIATEMENT pour éviter les resets RTCWDT
  // Le RTC watchdog peut reset avant que le firmware ne démarre si on attend trop
  // Utiliser une valeur par défaut si non configurée (évite timeout de 0)
  uint32_t initialWatchdogTimeout = (watchdogTimeoutSeconds > 0) ? watchdogTimeoutSeconds : WATCHDOG_TIMEOUT_DEFAULT_SEC;
  configureWatchdog(initialWatchdogTimeout);
  feedWatchdog();
  
  // Petit délai pour laisser le système s'initialiser après le watchdog
  delay(50);
  feedWatchdog();
  
  initSerial();
  feedWatchdog();
  
  Serial.println(F("\n═══ OTT Firmware v2.5 ═══"));
  feedWatchdog();
  
  Serial.printf("Serial: %s | ICCID: %s\n",
                DEVICE_SERIAL.c_str(),
                DEVICE_ICCID.substring(0, 10).c_str());
  feedWatchdog();
  
  if (DEVICE_SERIAL == "OTT-XX-XXX") {
    Serial.println(F("⚠️ Serial temporaire → Backend assignera OTT-YY-NNN"));
    feedWatchdog();
  }

  initBoard();
  feedWatchdog();
  
  loadConfig();
  feedWatchdog();

  // Fallbacks de sécurité si la config n'a jamais été envoyée via USB/OTA
  if (configuredSleepMinutes == 0) {
    configuredSleepMinutes = DEFAULT_SLEEP_MINUTES;
  }
  if (sendEveryNWakeups == 0) {
    sendEveryNWakeups = 1;
  }
  if (modemBootTimeoutMs == 0) {
    modemBootTimeoutMs = MODEM_BOOT_TIMEOUT_DEFAULT_MS;
  }
  if (simReadyTimeoutMs == 0) {
    simReadyTimeoutMs = SIM_READY_TIMEOUT_DEFAULT_MS;
  }
  if (networkAttachTimeoutMs == 0) {
    networkAttachTimeoutMs = NETWORK_ATTACH_TIMEOUT_DEFAULT_MS;
  }
  if (modemMaxReboots == 0) {
    modemMaxReboots = MODEM_MAX_REBOOTS_DEFAULT;
  }
  if (watchdogTimeoutSeconds == 0) {
    watchdogTimeoutSeconds = WATCHDOG_TIMEOUT_DEFAULT_SEC;
  }

  // Vérifier si on doit faire un rollback (si le boot a échoué plusieurs fois)
  checkBootFailureAndRollback();
  feedWatchdog();

  // Valider le boot et marquer le firmware comme stable si c'est un boot réussi
  validateBootAndMarkStable();
  feedWatchdog();

  // Auth: ICCID uniquement (pas de JWT)
  Serial.println(F("🔐 Auth: ICCID uniquement (pas de JWT)"));
  feedWatchdog();

  // Reconfigurer le watchdog avec la valeur chargée depuis la config (si différente)
  if (watchdogTimeoutSeconds > 0 && watchdogTimeoutSeconds != initialWatchdogTimeout) {
    configureWatchdog(watchdogTimeoutSeconds);
  }
  feedWatchdog();
  logRuntimeConfig();

  // Toujours initialiser le modem - mode normal uniquement
  initModem();

  // Les identifiants et la configuration seront envoyés dans le premier message unifié

  // =========================================================================
  // DÉTECTION USB EN PRIORITÉ (avant modem pour ne pas bloquer)
  // =========================================================================
  // Méthode de détection USB plus stable au boot
  // Laisser une fenêtre de temps au PC/dashboard pour ouvrir le port série
  // (sinon availableForWrite peut rester à 0 alors que l'USB est bien branché)
  unsigned long usbDetectStart = millis();
  bool usbConnected = false;
  while (!usbConnected && (millis() - usbDetectStart) < USB_BOOT_DETECT_WINDOW_MS) {
    feedWatchdog();
    uint32_t availableWrite = Serial.availableForWrite();
    usbConnected = (availableWrite >= 64);
    delay(20);
  }
  usbModeActive = usbConnected;
  if (usbConnected) {
    usbStateCounter = USB_STATE_THRESHOLD * 2;  // Initialiser avec valeur élevée pour éviter oscillations
  }

  if (usbConnected) {
    Serial.println(F("\n🔌 USB: Mode streaming (1s interval)"));
  } else {
    Serial.println(F("\n📡 Mode: Hybride (détection changement flux)"));
  }

  // =========================================================================
  // DÉMARRAGE MODEM (optionnel en mode USB, requis en mode hybride)
  // =========================================================================
  if (usbModeActive) {
    // Mode USB : Streaming + OTA périodique
    Serial.println(F("⚡ Mode USB: Streaming 1s + OTA périodique"));
    modemReady = false;
    lastMeasurementTime = millis();
    return;  // Continuer vers loop() sans attendre le modem
  } else {
    // Mode hybride : OTA uniquement
    LOG_I("BOOT", "Mode hybride - Démarrage modem...");
    if (!startModem()) {
      LOG_E("BOOT", "Modem échec → Sleep 1min");
      goToSleep(1);
      return;
    }
    LOG_I("BOOT", "Modem prêt");
  }

  // Mode hybride activé (pas d'USB au boot)

  // ✅ ENVOI AU RESET HARD (mesure initiale)
  Serial.println(F("[BOOT] 📤 Envoi mesure initiale (reset hard)"));
  Measurement mInit = captureSensorSnapshot();

  // Obtenir RSSI
  int8_t csq = modem.getSignalQuality();
  mInit.rssi = csqToRssi(csq);

  // Obtenir GPS
  float latitudeInit = 0.0, longitudeInit = 0.0;
  bool hasLocationInit = getDeviceLocation(&latitudeInit, &longitudeInit);

  // Envoyer mesure initiale
  bool sentInit = sendMeasurement(mInit, hasLocationInit ? &latitudeInit : nullptr, hasLocationInit ? &longitudeInit : nullptr, "BOOT");
  if (sentInit) {
    Serial.println(F("[BOOT] ✅ Mesure initiale envoyée"));
    lastFlowValue = mInit.flow;
    lastMeasurementTime = millis();
  } else {
    Serial.println(F("[BOOT] ⚠️ Échec envoi mesure initiale"));
  }

  // Traiter les commandes OTA initiales
  Command cmdsInit[MAX_COMMANDS];
  int countInit = fetchCommands(cmdsInit, MAX_COMMANDS);
  if (countInit > 0) {
    Serial.printf("[COMMANDS] %d commande(s) reçue(s)\n", countInit);
    uint32_t dummySleep = configuredSleepMinutes;
    for (int i = 0; i < countInit; ++i) {
      handleCommand(cmdsInit[i], dummySleep);
    }
  }

  // Toujours faire deep sleep après le boot (qu'on ait envoyé ou non)
  // Si on n'a pas envoyé (wakeupCounter < sendEveryNWakeups), on se réveillera au prochain cycle
  Serial.printf("[SLEEP] Deep sleep %lu minutes\n", static_cast<unsigned long>(configuredSleepMinutes));

  // Arrêter modem avant sleep
  stopModem();

  // Deep sleep périodique
  goToSleep(configuredSleepMinutes);
  // Note: goToSleep() ne retourne jamais (deep sleep réinitialise le MCU)
}

void loop() {
  feedWatchdog();
  unsigned long now = millis();

  // =========================================================================
  // DÉTECTION USB DYNAMIQUE (vérification toutes les 1000ms avec debounce amélioré)
  // =========================================================================
  if (now - lastUsbCheck >= USB_CHECK_INTERVAL_MS) {
    lastUsbCheck = now;
    feedWatchdog();  // Nourrir le watchdog pendant la vérification USB
    
    // Méthode de détection USB plus stable : vérifier si on peut écrire ET si le buffer n'est pas plein
    // availableForWrite() peut être instable, donc on vérifie aussi que le buffer TX n'est pas saturé
    bool currentUsbState = false;
    uint32_t availableWrite = Serial.availableForWrite();
    if (availableWrite > 0 && availableWrite >= 64) {  // Buffer doit avoir au moins 64 bytes disponibles
      // Test d'écriture non-bloquant : essayer d'écrire un caractère de test (sans vraiment l'écrire)
      // Si availableForWrite() est stable et > 0, USB est probablement connecté
      currentUsbState = true;
    }

    // Debounce amélioré : compter les états consécutifs pour éviter les oscillations
    if (currentUsbState) {
      // USB détecté : incrémenter le compteur (avec limite max pour éviter overflow)
      if (usbStateCounter < USB_STATE_THRESHOLD * 2) {
        usbStateCounter++;
      }
    } else {
      // USB non détecté : décrémenter le compteur (avec limite min)
      if (usbStateCounter > 0) {
        usbStateCounter--;
      }
    }

    // Changer d'état seulement si le compteur atteint le seuil
    bool newUsbState = (usbStateCounter >= USB_STATE_THRESHOLD);

    // Transition OFF → ON (USB branché)
    if (newUsbState && !usbModeActive) {
      usbModeActive = true;
      usbStateCounter = USB_STATE_THRESHOLD * 2;  // Verrouiller l'état (valeur élevée pour éviter oscillations)
      Serial.println(F("\n🔌 USB connecté → Streaming 1s"));
      // NE PAS utiliser Serial.flush() qui peut bloquer et causer des reconnexions
      // Le buffer sera vidé naturellement lors des prochaines écritures
      
      // 🚀 APPROCHE 3 (HYBRIDE) : Envoyer boot_info automatiquement
      // Attendre un petit délai pour que le dashboard soit prêt à recevoir
      // Utiliser une boucle avec feedWatchdog() au lieu de delay() bloquant
      unsigned long waitStart = millis();
      while (millis() - waitStart < 100) {
        feedWatchdog();
        delay(10);  // Petit delay pour éviter de surcharger le CPU
      }
      sendBootInfo();
    }
    // Transition ON → OFF (USB débranché)
    else if (!newUsbState && usbModeActive) {
      usbModeActive = false;
      usbStateCounter = 0;  // Réinitialiser le compteur
      Serial.println(F("\n📡 USB déconnecté → Mode hybride"));
      // NE PAS utiliser Serial.flush() qui peut bloquer
    }
  }

  // =========================================================================
  // MODE USB ACTIF : Streaming 1s + OTA périodique
  // =========================================================================
  if (usbModeActive) {
    // Initialiser le modem pour permettre l'envoi OTA (processus normal)
    static unsigned long lastModemInitAttempt = 0;
    static bool modemInitInProgress = false;
    static bool firstInitAttempt = true;

    // Première tentative : immédiatement, puis toutes les 30 secondes si échec
    unsigned long retryInterval = firstInitAttempt ? 0 : 30000;

    if (!modemReady && !modemInitInProgress && (now - lastModemInitAttempt >= retryInterval)) {
      lastModemInitAttempt = now;
      firstInitAttempt = false;
      modemInitInProgress = true;

      LOG_I("MODEM", "Initialisation modem (mode USB)...");
      if (startModem()) {
        LOG_I("MODEM", "Modem initialisé - OTA activé");
        if (gpsEnabled) {
          LOG_D("GPS", "GPS activé automatiquement");
        }

        // Envoi automatique après connexion réseau
        sendMeasurementWithContext("NETWORK_READY");
      } else {
        LOG_W("MODEM", "Échec init modem (réessai 30s) - OTA désactivé");
        if (gpsEnabled) {
          LOG_D("GPS", "GPS non dispo sans modem");
        }
      }
      modemInitInProgress = false;
    }

    // Si le modem est prêt mais pas connecté, essayer de se connecter périodiquement
    if (modemReady && !modem.isNetworkConnected() && (now - lastModemInitAttempt >= 60000)) {
      LOG_I("MODEM", "Tentative reconnexion...");
      if (attachNetwork(60000)) {
        LOG_I("MODEM", "Réseau reconnecté");
        if (connectData(30000)) {
          LOG_I("MODEM", "Données mobiles OK - OTA activé");
        } else {
          LOG_W("MODEM", "Réseau OK mais données KO");
        }
        lastModemInitAttempt = now;

        // Envoi automatique après reconnexion
        sendMeasurementWithContext("NETWORK_RECONNECT");
      }
    }

    // ====================================================================
    // PROCESSUS 1 : DEBUG USB - Affichage des mesures toutes les secondes
    // ====================================================================
    static uint32_t usbSequence = 0;
    static unsigned long lastUsbDisplay = 0;
    static bool firstUsbDisplay = true;

    if (now - lastUsbDisplay >= 1000) {
      lastUsbDisplay = now;
      usbSequence++;

      // Message de démarrage au premier affichage
      if (firstUsbDisplay) {
        firstUsbDisplay = false;
        LOG_I("USB", String(F("Streaming démarré | Modem: ")) + (modemReady ? F("OK") : F("KO")));
      }

      // Capturer mesure pour affichage USB
      Measurement m = captureSensorSnapshot();

      // RSSI (seulement si modem prêt)
      if (modemReady) {
        int8_t csq = modem.getSignalQuality();
        m.rssi = csqToRssi(csq);
        // Afficher l'état du réseau toutes les 30 secondes (réduit de 10s)
        if (usbSequence % 30 == 0) {
          bool networkOk = modem.isNetworkConnected();
          bool gprsOk = modem.isGprsConnected();
          LOG_D("USB", String(F("Signal: ")) + m.rssi + F(" dBm | Net: ") + (networkOk ? F("OK") : F("KO")) + F(" | GPRS: ") + (gprsOk ? F("OK") : F("KO")));
        }
      } else {
        m.rssi = 0;
        // Afficher que le modem n'est pas prêt toutes les 30 secondes (réduit de 10s)
        if (usbSequence % 30 == 0) {
          LOG_W("USB", "Modem non init - En attente...");
        }
      }

      // GPS (tentative rapide, seulement si modem prêt ET GPS activé)
      float latitude = 0.0, longitude = 0.0;
      bool hasLocation = false;
      if (modemReady && gpsEnabled) {
        hasLocation = getDeviceLocationFast(&latitude, &longitude);
        // Afficher uniquement si GPS valide et toutes les 30 secondes (réduit spam)
        if (hasLocation && usbSequence % 30 == 0) {
          LOG_D("USB", String(F("GPS: ")) + latitude + F(",") + longitude);
        }
      }

      // Envoyer via USB (affichage seulement, pas d'envoi à l'API ici)
      emitDebugMeasurement(m, usbSequence, 1000, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr);
    }

    // ====================================================================
    // PROCESSUS 2 : NORMAL OTA - Envoi périodique selon configuredSleepMinutes
    // ====================================================================
    // Vérifier si on doit envoyer une mesure (processus normal)
    static unsigned long lastOtaMeasurementTime = 0;
    unsigned long sleepMinutesMs = configuredSleepMinutes * 60 * 1000;
    unsigned long timeSinceLastOtaMeasurement = now - lastOtaMeasurementTime;

    // En mode USB, on ignore sendEveryNWakeups (pas de deep sleep, donc pas de wakeups)
    // Le compteur wakeupCounter n'est utilisé qu'en mode normal (avec deep sleep)
    // En mode USB, on envoie simplement selon le délai de temps
    bool timeElapsed = (lastOtaMeasurementTime == 0) || (timeSinceLastOtaMeasurement >= sleepMinutesMs);
    bool shouldSendOtaMeasurement = timeElapsed;  // En mode USB, ignorer wakeupCounter

    if (shouldSendOtaMeasurement && modemReady && modem.isNetworkConnected()) {
      LOG_I("OTA", "Envoi mesure périodique...");

      // Utiliser la fonction factorisée pour l'envoi
      Measurement mOta = captureSensorSnapshot();
      int8_t csq = modem.getSignalQuality();
      mOta.rssi = csqToRssi(csq);

      // GPS (si activé) - utiliser getDeviceLocation pour plus de précision en OTA
      float latOta = 0.0, lonOta = 0.0;
      bool hasLocationOta = false;
      if (gpsEnabled) {
        hasLocationOta = getDeviceLocation(&latOta, &lonOta);
        if (hasLocationOta) {
          LOG_D("OTA", String(F("GPS: ")) + latOta + F(",") + lonOta);
        }
      }

      // Envoyer via OTA
      bool sent = sendMeasurement(mOta, hasLocationOta ? &latOta : nullptr, hasLocationOta ? &lonOta : nullptr, "TIMER");
      if (sent) {
        lastOtaMeasurementTime = now;
        lastFlowValue = mOta.flow;
        lastMeasurementTime = now;
        LOG_I("OTA", String(F("Mesure OK (")) + mOta.flow + F(" L/min, ") + (int)mOta.battery + F("%, ") + mOta.rssi + F(" dBm)"));
        LOG_D("OTA", String(F("Prochaine dans ")) + configuredSleepMinutes + F(" min"));
      } else {
        LOG_W("OTA", "Échec envoi - réessai prochain cycle");
      }

      // Traiter les commandes OTA après envoi
      Command cmds[MAX_COMMANDS];
      int count = fetchCommands(cmds, MAX_COMMANDS);
      if (count > 0) {
        String timeStrCmd = formatTimeFromMillis(millis());
        Serial.printf("%s[OTA] 📡 %d commande(s) reçue(s) depuis la base de données\n", timeStrCmd.c_str(), count);
        uint32_t dummySleep = configuredSleepMinutes;
        for (int i = 0; i < count; ++i) {
          handleCommand(cmds[i], dummySleep);
        }
      }
    } else if (shouldSendOtaMeasurement && !modemReady) {
      Serial.println(F("[OTA] ⚠️ Modem non prêt - Mesure OTA reportée"));
    } else if (shouldSendOtaMeasurement && !modem.isNetworkConnected()) {
      Serial.println(F("[OTA] ⚠️ Réseau non connecté - Mesure OTA reportée"));
    }

    // Vérifier les commandes OTA périodiquement (même sans envoi de mesure)
    static unsigned long lastOtaCheckUsb = 0;
    if (now - lastOtaCheckUsb >= OTA_CHECK_INTERVAL_MS) {
      lastOtaCheckUsb = now;
      if (modemReady && modem.isNetworkConnected()) {
        String timeStr = formatTimeFromMillis(millis());
        Serial.printf("%s[OTA] 🔍 Vérification commandes OTA depuis la base de données...\n", timeStr.c_str());
        Command cmds[MAX_COMMANDS];
        int count = fetchCommands(cmds, MAX_COMMANDS);
        if (count > 0) {
          Serial.printf("%s[OTA] 📡 %d commande(s) reçue(s) depuis la base de données\n", timeStr.c_str(), count);
          uint32_t dummySleep = configuredSleepMinutes;
          for (int i = 0; i < count; ++i) {
            handleCommand(cmds[i], dummySleep);
          }
        } else {
          Serial.printf("%s[OTA] ✓ Aucune commande en attente\n", timeStr.c_str());
        }
      } else if (!modemReady) {
        String timeStr = formatTimeFromMillis(millis());
        Serial.printf("%s[OTA] ⚠️ Modem non prêt - Vérification commandes reportée\n", timeStr.c_str());
      } else if (!modem.isNetworkConnected()) {
        String timeStr = formatTimeFromMillis(millis());
        Serial.printf("%s[OTA] ⚠️ Réseau non connecté - Vérification commandes reportée\n", timeStr.c_str());
      }
    }

    delay(100);  // Petit délai pour ne pas surcharger
    return;      // Sortir de loop(), on reviendra au prochain cycle
  }

  // =========================================================================
  // TRAITEMENT COMMANDES SÉRIE (toujours actif, même sans mode USB)
  // =========================================================================
  // Traiter commandes série (config, calibration, etc.) - TOUJOURS, même si pas en mode USB
  // Cela permet de recevoir des commandes même si le firmware n'a pas détecté USB
  static String commandBuffer = "";
  if (Serial.available() > 0) {
    while (Serial.available()) {
      char incoming = Serial.read();
      if (incoming == '\r') continue;
      if (incoming == '\n') {
        commandBuffer.trim();
        if (commandBuffer.length() > 0) {
          Serial.print(F("[CMD] Buffer complet: "));
          Serial.println(commandBuffer);
          handleSerialCommand(commandBuffer);
        }
        commandBuffer = "";
      } else {
        commandBuffer += incoming;
        if (commandBuffer.length() > 128) {
          Serial.println(F("[CMD] Buffer trop long, reset"));
          commandBuffer = "";
        }
      }
    }
  }

  // =========================================================================
  // MODE HYBRIDE : Détection changement flux
  // =========================================================================

  // Lire le capteur
  float currentFlowRaw = measureAirflowRaw();
  float currentFlow = airflowToLpm(currentFlowRaw);

  // Calculer le changement
  float flowChange = abs(currentFlow - lastFlowValue);

  // Vérifier si changement significatif ET intervalle minimum respecté
  bool shouldMeasure = false;

  if (flowChange > FLOW_CHANGE_THRESHOLD && (now - lastMeasurementTime >= MIN_INTERVAL_MS)) {
    shouldMeasure = true;
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[SENSOR] Changement: %.2f→%.2f L/min (Δ%.2f)\n",
                  timeStr.c_str(), lastFlowValue, currentFlow, flowChange);
  }

  // Si changement détecté, mesurer et envoyer
  if (shouldMeasure) {
    // Activer modem si nécessaire
    if (!modemReady) {
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[MODEM] ⚠️ Modem non prêt, démarrage...\n", timeStr.c_str());
      if (startModem()) {
        Serial.println(F("[MODEM] Modem activé pour envoi"));
      } else {
        Serial.println(F("[MODEM] ❌ Échec démarrage modem"));
        return;  // Sortir si modem ne démarre pas
      }
    }

    // Vérifier que le modem est bien connecté au réseau
    if (!modem.isNetworkConnected()) {
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[MODEM] ⚠️ Modem non connecté au réseau (GPRS OK mais réseau non attaché)\n", timeStr.c_str());
      sendLog("WARN", "Modem GPRS connecté mais réseau non attaché", "network");
      return;  // Sortir si réseau non attaché
    }

    if (!modem.isGprsConnected()) {
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[MODEM] ⚠️ GPRS non connecté\n", timeStr.c_str());
      sendLog("WARN", "GPRS non connecté malgré connexion réseau", "network");
      return;  // Sortir si GPRS non connecté
    }

    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[API] 📤 Préparation envoi mesure...\n", timeStr.c_str());

    // Capturer mesure complète
    Measurement m = captureSensorSnapshot();

    // Obtenir RSSI (si modem actif)
    if (modemReady && modem.isNetworkConnected()) {
      int8_t csq = modem.getSignalQuality();
      m.rssi = csqToRssi(csq);
      Serial.printf("%s[API] 📶 Signal: %d dBm\n", timeStr.c_str(), m.rssi);
    } else {
      m.rssi = -999;
      Serial.printf("%s[API] ⚠️ RSSI non disponible\n", timeStr.c_str());
    }

    // Obtenir GPS (si disponible)
    float latitude = 0.0, longitude = 0.0;
    bool hasLocation = getDeviceLocation(&latitude, &longitude);
    if (hasLocation) {
      Serial.printf("%s[API] 📍 GPS: %.6f, %.6f\n", timeStr.c_str(), latitude, longitude);
    } else {
      Serial.printf("%s[API] ℹ️ GPS non disponible\n", timeStr.c_str());
    }

    // Envoyer immédiatement
    Serial.printf("%s[API] 📤 Envoi mesure à l'API...\n", timeStr.c_str());
    bool sent = sendMeasurement(m, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr, "EVENT");

    if (sent) {
      lastFlowValue = currentFlow;
      lastMeasurementTime = now;
      Serial.printf("%s[SENSOR] ✅ Envoyé: %.2f L/min | %.0f%% | %d dBm\n",
                    timeStr.c_str(), m.flow, m.battery, m.rssi);
      sendLog("INFO", String(F("Mesure envoyée avec succès: ")) + String(m.flow) + F(" L/min"), "measurements");
    } else {
      Serial.printf("%s[SENSOR] ❌ Échec envoi mesure\n", timeStr.c_str());
      sendLog("ERROR", "Échec envoi mesure - vérifier connexion API", "measurements");
    }

    // Traiter les commandes OTA périodiquement (toutes les 30 secondes)
    // Note: lastOtaCheck est initialisé à 0, donc la première vérification se fera immédiatement
    if (now - lastOtaCheck >= OTA_CHECK_INTERVAL_MS) {
      lastOtaCheck = now;
      if (modemReady && modem.isNetworkConnected()) {
        String timeStr = formatTimeFromMillis(millis());
        Serial.printf("%s[OTA] 🔍 Vérification commandes OTA depuis la base de données...\n", timeStr.c_str());
        Command cmds[MAX_COMMANDS];
        int count = fetchCommands(cmds, MAX_COMMANDS);
        if (count > 0) {
          Serial.printf("%s[OTA] 📡 %d commande(s) reçue(s) depuis la base de données\n", timeStr.c_str(), count);
          uint32_t dummySleep = configuredSleepMinutes;
          for (int i = 0; i < count; ++i) {
            handleCommand(cmds[i], dummySleep);
          }
        } else {
          Serial.printf("%s[OTA] ✓ Aucune commande en attente\n", timeStr.c_str());
        }
      }
    }

    // Après envoi réussi, faire deep sleep pour économiser l'énergie
    // (sauf si on vient juste de se réveiller d'un deep sleep)
    static unsigned long lastDeepSleepTime = 0;
    static bool firstMeasurementAfterBoot = true;

    // Initialiser lastDeepSleepTime au premier boot
    if (firstMeasurementAfterBoot) {
      lastDeepSleepTime = now;
      firstMeasurementAfterBoot = false;
    }

    unsigned long timeSinceLastSleep = now - lastDeepSleepTime;
    if (sent && timeSinceLastSleep > 60000) {  // Au moins 1 minute depuis le dernier deep sleep
      // Incrémenter le compteur de wakeups avant le deep sleep
      wakeupCounter++;

      Serial.printf("[SLEEP] Mesure envoyée → Deep sleep %lu minutes\n", static_cast<unsigned long>(configuredSleepMinutes));

      // Mettre à jour le timestamp avant le sleep
      lastDeepSleepTime = now;

      // Arrêter modem avant sleep
      stopModem();

      // Deep sleep pour configuredSleepMinutes
      goToSleep(configuredSleepMinutes);
      // Note: goToSleep() ne retourne jamais (deep sleep réinitialise le MCU)
    }
  } else {
    // Pas de changement détecté depuis la dernière mesure
    unsigned long idleTime = now - lastMeasurementTime;

    // Si pas de mesure depuis configuredSleepMinutes, faire deep sleep périodique
    unsigned long sleepMinutesMs = configuredSleepMinutes * 60 * 1000;
    if (idleTime > sleepMinutesMs && modemReady) {
      Serial.printf("[SLEEP] Pas de changement depuis %lu min → Deep sleep %lu minutes\n",
                    idleTime / 60000, static_cast<unsigned long>(configuredSleepMinutes));

      // Arrêter modem avant sleep
      stopModem();

      // Deep sleep périodique
      goToSleep(configuredSleepMinutes);
      // Note: goToSleep() ne retourne jamais (deep sleep réinitialise le MCU)
    }
    // Sinon, si inactif depuis longtemps mais moins que sleepMinutesMs, light sleep
    else if (idleTime > IDLE_TIMEOUT_MS && modemReady) {
      Serial.printf("[SLEEP] Inactif depuis %lu min → Light sleep 1 min\n", idleTime / 60000);

      // Arrêter modem pour économie
      stopModem();

      // Light sleep 1 minute, puis réveil pour vérification
      esp_sleep_enable_timer_wakeup(60 * 1000000ULL);
      esp_light_sleep_start();

      // Après réveil, réinitialiser modem si nécessaire
      if (!modemReady) {
        initModem();
      }
    }
  }

  // Attendre avant la prochaine vérification
  delay(1000);  // Vérifier toutes les secondes
}

// ----------------------------------------------------------------------------- //
// Hardware / Modem                                                              //
// ----------------------------------------------------------------------------- //

void initSerial() {
  // Démarrer Serial avec un délai pour laisser le temps au bootloader de s'initialiser
  // Cela peut aider à éviter les problèmes de "invalid header" si le système est instable
  delay(100);
  Serial.begin(115200);
  delay(200);  // Délai augmenté pour laisser le temps à Serial de s'initialiser
  while (Serial.available()) Serial.read();
  Serial.println(F("\n[BOOT] UART prêt"));
}

void initBoard() {
  pinMode(BOARD_POWERON_PIN, OUTPUT);
  digitalWrite(BOARD_POWERON_PIN, HIGH);

  pinMode(BOARD_PWRKEY_PIN, OUTPUT);
  digitalWrite(BOARD_PWRKEY_PIN, LOW);
  delay(100);
  digitalWrite(BOARD_PWRKEY_PIN, HIGH);
  delay(100);
  digitalWrite(BOARD_PWRKEY_PIN, LOW);
}

void initModem() {
  SerialAT.begin(MODEM_BAUDRATE, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  pinMode(MODEM_RESET_PIN, OUTPUT);
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);
  delay(100);
  digitalWrite(MODEM_RESET_PIN, MODEM_RESET_LEVEL);
  delay(5000);  // Augmenté de 2600ms à 5000ms pour laisser plus de temps au modem
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);

  // Vérifier que le modem répond avant de continuer
  unsigned long testStart = millis();
  while (!modem.testAT(500) && (millis() - testStart < 10000)) {
    delay(500);
    feedWatchdog();
  }
}

bool startModem() {
  // Vérifier si on est en mode USB pour réduire les logs
  bool isUsbMode = Serial.availableForWrite() > 0;

  if (!isUsbMode) {
    Serial.println(F("[MODEM] start"));
  }
  uint8_t rebootCount = 0;
  while (true) {
    unsigned long start = millis();
    while (!modem.testAT(1000)) {
      if (!isUsbMode) {
        Serial.print('.');
      }
      feedWatchdog();
      if (millis() - start > modemBootTimeoutMs) {
        if (!isUsbMode) {
          Serial.println(F("\n[MODEM] pas de reponse AT"));
        }
        if (++rebootCount > modemMaxReboots) {
          sendLog("ERROR", "Modem unresponsive");
          return false;
        }
        if (!isUsbMode) {
          Serial.println(F("[MODEM] toggling PWRKEY"));
        }
        digitalWrite(BOARD_PWRKEY_PIN, LOW);
        delay(100);
        digitalWrite(BOARD_PWRKEY_PIN, HIGH);
        delay(1000);
        digitalWrite(BOARD_PWRKEY_PIN, LOW);
        break;
      }
    }
    if (modem.testAT()) {
      if (!isUsbMode) {
        Serial.println();
        Serial.println(F("[MODEM] AT OK"));
      }
      break;
    }
    feedWatchdog();
  }

  if (!waitForSimReady(simReadyTimeoutMs)) {
    if (!isUsbMode) {
      Serial.println(F("[MODEM] SIM non prête"));
    }
    sendLog("ERROR", "SIM not ready");
    return false;
  }
  if (!isUsbMode) {
    Serial.println(F("[MODEM] SIM prête"));
  }

  // Lire l'ICCID réel de la SIM si disponible (fallback si non configuré)
  String realIccid = modem.getSimCCID();
  if (realIccid.length() > 0 && realIccid.length() <= 20) {
    // Si DEVICE_ICCID est la valeur par défaut ou vide, utiliser l'ICCID réel de la SIM
    if (DEVICE_ICCID == OTT_DEFAULT_ICCID || DEVICE_ICCID.isEmpty()) {
      Serial.printf("[MODEM] ICCID réel lu depuis SIM: %s\n", realIccid.c_str());
      DEVICE_ICCID = realIccid;
      saveConfig();  // Sauvegarder l'ICCID réel en NVS
    } else if (DEVICE_ICCID != realIccid) {
      // Avertir si l'ICCID configuré diffère de l'ICCID réel
      Serial.printf("[MODEM] ATTENTION: ICCID configuré (%s) diffère de l'ICCID réel (%s)\n",
                    DEVICE_ICCID.c_str(), realIccid.c_str());
      sendLog("WARN", String(F("ICCID mismatch: config=")) + DEVICE_ICCID + F(" real=") + realIccid, "config");
    }
  } else if (realIccid.length() > 0) {
    Serial.printf("[MODEM] ICCID réel invalide (longueur %d): %s\n", realIccid.length(), realIccid.c_str());
  }

  // Configuration APN pour internet (type IP, pas MMS)
  // ═══════════════════════════════════════════════════════════════════════════
  // HIÉRARCHIE DE PRIORITÉ (3 NIVEAUX):
  // ═══════════════════════════════════════════════════════════════════════════
  // NIVEAU 1 (PRIORITÉ ABSOLUE) : APN MANUEL (apnManual = true)
  //   → CONSERVER NETWORK_APN tel quel, JAMAIS le modifier
  //   → NE PAS utiliser détection automatique
  //   → NE PAS corriger même si REG_DENIED
  //
  // NIVEAU 2 : APN SAUVEGARDÉ EN NVS (apnLoadedFromNVS = true, apnManual = false)
  //   → CONSERVER NETWORK_APN sauvegardé
  //   → NE PAS utiliser détection automatique SAUF si changement d'opérateur détecté
  //   → Si changement d'opérateur → détecter nouveau opérateur et utiliser son APN
  //
  // NIVEAU 3 : DÉTECTION AUTOMATIQUE (apnLoadedFromNVS = false, apnManual = false)
  //   → Détecter opérateur/SIM et utiliser APN recommandé
  //   → Priorité: Carte SIM > Opérateur réseau > APN par défaut
  // ═══════════════════════════════════════════════════════════════════════════

  String apnToUse = NETWORK_APN;  // Utiliser l'APN chargé depuis NVS (ou valeur par défaut)
  String oper = "";

  // Si APN manuel, TOUJOURS conserver l'APN configuré (ne pas écraser)
  if (apnManual) {
    if (DETECTED_OPERATOR.length() > 0) {
      oper = DETECTED_OPERATOR;
      String operatorName = getOperatorName(oper);
      Serial.printf("[MODEM] 🔒 APN manuel activé: \"%s\" (ne sera pas modifié) | Opérateur sauvegardé: %s\n",
                    NETWORK_APN.c_str(), operatorName.c_str());
    } else {
      Serial.printf("[MODEM] 🔒 APN manuel activé: \"%s\" (ne sera pas modifié)\n", NETWORK_APN.c_str());
    }
  } else if (DETECTED_OPERATOR.length() > 0) {
    // APN non manuel ET opérateur sauvegardé disponible
    // Vérifier si l'APN actuel correspond à l'opérateur sauvegardé
    oper = DETECTED_OPERATOR;
    String operatorName = getOperatorName(oper);
    String recommendedApn = getRecommendedApnForOperator(oper);

    // Si l'APN actuel correspond déjà à l'opérateur, le conserver
    if (recommendedApn == NETWORK_APN) {
      Serial.printf("[MODEM] ✅ APN \"%s\" correspond à l'opérateur sauvegardé %s - Conservation\n",
                    NETWORK_APN.c_str(), operatorName.c_str());
      apnToUse = NETWORK_APN;
    } else if (recommendedApn.length() > 0) {
      // APN ne correspond pas - utiliser l'APN recommandé pour cet opérateur
      // MAIS seulement si l'APN actuel est la valeur par défaut ET n'a PAS été chargé depuis NVS
      // Si l'APN vient de NVS, il a été configuré → le conserver
      if (NETWORK_APN.length() == 0 && !apnLoadedFromNVS) {
        // L'APN est vide ET n'a pas été sauvegardé → utiliser l'APN recommandé
        apnToUse = recommendedApn;
        Serial.printf("[MODEM] 💾 Opérateur sauvegardé: %s → APN: %s (remplace défaut non sauvegardé: %s)\n",
                      operatorName.c_str(), recommendedApn.c_str(), NETWORK_APN.c_str());
        NETWORK_APN = apnToUse;  // Mettre à jour pour cette session
      } else {
        // L'APN a été sauvegardé en NVS ou configuré différemment → le conserver
        Serial.printf("[MODEM] 💾 Opérateur sauvegardé: %s mais APN \"%s\" différe de recommandé \"%s\" - Conservation de l'APN configuré\n",
                      operatorName.c_str(), NETWORK_APN.c_str(), recommendedApn.c_str());
        apnToUse = NETWORK_APN;
      }
    }
  }

  // CRITIQUE: Vérifier que l'opérateur actuel correspond à celui sauvegardé
  // Si différent ou si aucun opérateur sauvegardé, détecter l'opérateur actuel
  Serial.println(F("[MODEM] 🔍 Vérification opérateur actuel..."));
  String currentOper = "";
  unsigned long operatorDetectStart = millis();
  unsigned long lastProgressLog = 0;
  while (currentOper.length() == 0 && (millis() - operatorDetectStart < 15000)) {
    currentOper = modem.getOperator();
    if (currentOper.length() == 0) {
      delay(500);
      feedWatchdog();
      // Afficher progression toutes les 2 secondes
      unsigned long elapsed = millis() - operatorDetectStart;
      if (elapsed - lastProgressLog >= 2000) {
        unsigned long remaining = (15000 - elapsed) / 1000;
        if (remaining > 0) {
          Serial.printf("[MODEM] ⏳ Attente détection opérateur... (%lu s restantes)\n", remaining);
        }
        lastProgressLog = elapsed;
      }
    }
  }

  // CRITIQUE: Détecter la carte SIM réelle pour déterminer l'APN correct
  // En roaming, il faut utiliser l'APN de la carte SIM, pas de l'opérateur en roaming
  // MÉTHODE 1 : Essayer de détecter via IMSI (plus fiable, contient le MCC+MNC réel)
  String simOperator = detectSimOperatorFromImsi();

  // MÉTHODE 2 : Si IMSI n'a pas fonctionné, utiliser ICCID (moins fiable car préfixes partagés)
  if (simOperator.length() == 0) {
    simOperator = detectSimOperatorFromIccid(DEVICE_ICCID);
    if (simOperator.length() == 0) {
      Serial.println(F("[MODEM] 💡 IMSI non disponible, utilisation ICCID (moins fiable)"));
    } else {
      Serial.println(F("[MODEM] ✅ Détection via IMSI (méthode fiable)"));
    }
  } else {
    Serial.println(F("[MODEM] ✅ Détection via IMSI (méthode la plus fiable)"));
  }

  String simOperatorName = simOperator.length() > 0 ? getOperatorName(simOperator) : "";
  bool isFreeSim = (simOperator.indexOf("20815") >= 0 || simOperator.indexOf("20816") >= 0);

  // Si l'ICCID ne permet pas de détecter (Orange/Free partagent des préfixes 893301/893302),
  // on utilise plusieurs indices pour déterminer l'opérateur réel :
  // 1. Si l'APN par défaut est "free", c'est probablement une carte Free Pro
  // 2. Si l'opérateur détecté est Free (20815/20816), c'est Free
  // 3. Si l'opérateur détecté est Orange (20801/20802) ET l'APN par défaut est "free",
  //    c'est probablement une carte Free Pro en roaming sur Orange
  // 4. Sinon, on assume que c'est l'opérateur détecté (Orange si détecté)
  if (simOperator.length() == 0 && currentOper.length() > 0) {
    String iccidPrefix = DEVICE_ICCID.length() >= 6 ? DEVICE_ICCID.substring(0, 6) : "";
    bool isAmbiguousPrefix = (iccidPrefix == "893301" || iccidPrefix == "893302" || iccidPrefix == "893303" || iccidPrefix == "893304");

    if (isAmbiguousPrefix) {
      // Préfixe ambigu (Orange/Free) - utiliser plusieurs indices
      if (NETWORK_APN == "free" || OTT_DEFAULT_APN == "free") {
        // L'APN par défaut est "free" → c'est probablement une carte Free Pro
        isFreeSim = true;
        simOperator = "20815";  // Free Mobile
        simOperatorName = "Free Mobile";
        Serial.printf("[MODEM] 🔍 Carte SIM Free Pro détectée via APN par défaut (ICCID: %s...)\n",
                      DEVICE_ICCID.substring(0, 10).c_str());
        Serial.println(F("[MODEM] 💡 Les cartes Free Pro partagent les préfixes ICCID avec Orange"));
        Serial.println(F("[MODEM] 💡 L'APN par défaut \"free\" indique que c'est une carte Free"));
      } else if (currentOper.indexOf("20815") >= 0 || currentOper.indexOf("20816") >= 0) {
        // Opérateur détecté = Free
        isFreeSim = true;
        simOperator = currentOper;
        simOperatorName = getOperatorName(currentOper);
        Serial.printf("[MODEM] 🔍 Carte SIM Free détectée via opérateur (ICCID: %s...)\n",
                      DEVICE_ICCID.substring(0, 10).c_str());
      } else if (currentOper.indexOf("20801") >= 0 || currentOper.indexOf("20802") >= 0) {
        // Opérateur détecté = Orange
        // Si l'APN par défaut est "free", c'est probablement une carte Free Pro en roaming
        if (NETWORK_APN == "free" || OTT_DEFAULT_APN == "free") {
          isFreeSim = true;
          simOperator = "20815";  // Free Mobile
          simOperatorName = "Free Mobile";
          Serial.printf("[MODEM] 🔍 Carte SIM Free Pro détectée (en roaming sur Orange)\n");
          Serial.printf("[MODEM] 💡 Opérateur détecté: Orange, mais APN \"free\" indique carte Free Pro\n");
        } else {
          // Probablement Orange (réseau home)
          simOperator = currentOper;
          simOperatorName = getOperatorName(currentOper);
          Serial.printf("[MODEM] 🔍 Carte SIM Orange détectée (ICCID: %s...)\n",
                        DEVICE_ICCID.substring(0, 10).c_str());
        }
      }
    } else if (currentOper.length() > 0) {
      // Préfixe non ambigu, utiliser l'opérateur détecté
      if (currentOper.indexOf("20815") >= 0 || currentOper.indexOf("20816") >= 0) {
        isFreeSim = true;
        simOperator = currentOper;
        simOperatorName = getOperatorName(currentOper);
      } else {
        simOperator = currentOper;
        simOperatorName = getOperatorName(currentOper);
      }
    }
  }

  if (simOperator.length() > 0) {
    Serial.printf("[MODEM] 🔍 Carte SIM détectée: %s (ICCID: %s...)\n",
                  simOperatorName.c_str(), DEVICE_ICCID.substring(0, 10).c_str());
  }

  // CRITIQUE: Utiliser l'APN de la carte SIM réelle, pas de l'opérateur en roaming
  // MAIS: Ne pas écraser l'APN si il a été configuré manuellement (apnManual = true)
  // Si on a détecté la carte SIM, utiliser son APN (sauf si APN manuel)
  // Sinon, utiliser l'APN de l'opérateur détecté (réseau home) (sauf si APN manuel)
  if (apnManual) {
    // APN configuré manuellement - ne pas écraser par détection automatique
    Serial.printf("[MODEM] 🔒 APN configuré manuellement: \"%s\" (ne sera pas écrasé par détection auto)\n", NETWORK_APN.c_str());
    apnToUse = NETWORK_APN;
  } else if (simOperator.length() > 0) {
    // Carte SIM détectée : utiliser son APN (même en roaming)
    // MAIS: Si l'APN a été chargé depuis NVS, le conserver (il a été configuré)
    String simApn = getRecommendedApnForOperator(simOperator);
    if (simApn.length() > 0 && simApn != NETWORK_APN && !apnLoadedFromNVS) {
      // L'APN ne vient pas de NVS → utiliser l'APN recommandé pour la carte SIM
      apnToUse = simApn;
      NETWORK_APN = apnToUse;
      String currentOperatorName = currentOper.length() > 0 ? getOperatorName(currentOper) : "inconnu";
      if (currentOper != simOperator) {
        Serial.printf("[MODEM] 🔄 ROAMING détecté: Carte %s sur réseau %s\n",
                      simOperatorName.c_str(), currentOperatorName.c_str());
        Serial.printf("[MODEM] ✅ Utilisation APN de la carte SIM: \"%s\" (pas de l'opérateur en roaming)\n",
                      apnToUse.c_str());
      } else {
        Serial.printf("[MODEM] ✅ Carte %s sur réseau home → APN: \"%s\"\n",
                      simOperatorName.c_str(), apnToUse.c_str());
      }
    } else if (simApn.length() > 0 && !apnLoadedFromNVS) {
      apnToUse = simApn;
      Serial.printf("[MODEM] ✅ Carte %s → APN: \"%s\"\n", simOperatorName.c_str(), apnToUse.c_str());
    } else if (apnLoadedFromNVS) {
      // APN chargé depuis NVS → le conserver même si différent de l'APN recommandé
      apnToUse = NETWORK_APN;
      Serial.printf("[MODEM] 🔒 APN \"%s\" chargé depuis NVS - Conservation (carte %s détectée, APN recommandé: %s)\n",
                    NETWORK_APN.c_str(), simOperatorName.c_str(), simApn.length() > 0 ? simApn.c_str() : "N/A");
    }
  } else if (currentOper.length() > 0 && !apnLoadedFromNVS) {
    // Carte SIM non détectée : utiliser l'APN de l'opérateur détecté
    // MAIS: Si l'APN a été chargé depuis NVS, le conserver (il a été configuré)
    oper = currentOper;
    String operatorName = getOperatorName(oper);
    String recommendedApn = getRecommendedApnForOperator(oper);
    if (recommendedApn.length() > 0) {
      apnToUse = recommendedApn;
      if (recommendedApn != NETWORK_APN) {
        Serial.printf("[MODEM] 🔄 Opérateur détecté: %s (code: %s) → APN automatique: %s\n",
                      operatorName.c_str(), oper.c_str(), recommendedApn.c_str());
      } else {
        Serial.printf("[MODEM] ✅ Opérateur détecté: %s (code: %s) → APN: %s\n",
                      operatorName.c_str(), oper.c_str(), NETWORK_APN.c_str());
      }
      NETWORK_APN = apnToUse;
    } else {
      Serial.printf("[MODEM] ⚠️  Opérateur détecté: %s (code: %s) mais APN non reconnu → Utilisation APN configuré: %s\n",
                    operatorName.c_str(), oper.c_str(), NETWORK_APN.c_str());
    }
  } else {
    // Aucune détection : utiliser l'APN configuré ou sauvegardé
    if (oper.length() > 0) {
      String operatorName = getOperatorName(oper);
      Serial.printf("[MODEM] ⚠️  Opérateur non détecté après 15s → Utilisation opérateur sauvegardé: %s avec APN: %s\n",
                    operatorName.c_str(), apnToUse.c_str());
    } else {
      Serial.printf("[MODEM] ⚠️  Opérateur non détecté après 15s → Utilisation APN configuré: %s\n", NETWORK_APN.c_str());
      Serial.println(F("[MODEM] 💡 L'APN sera détecté automatiquement lors de l'attachement réseau"));
    }
  }

  // CRITIQUE: Vérifier que apnToUse n'est pas vide
  // Si vide, la configuration doit être envoyée par le frontend via USB
  if (apnToUse.length() == 0) {
    Serial.println(F("[MODEM] ⚠️ APN vide détecté → Attente configuration depuis frontend via USB"));
    Serial.println(F("[MODEM] 💡 La configuration complète avec valeurs par défaut doit être envoyée via UPDATE_CONFIG"));
    // Ne pas utiliser de valeur par défaut - attendre la configuration depuis le frontend
    apnToUse = "";
    NETWORK_APN = "";
    apnLoadedFromNVS = false;
  }

  // Configurer l'APN détecté/recommandé (ou configuré par défaut si non détecté)
  // Format: +CGDCONT=1,"IP","apn" (1=context ID, IP=type internet, apn=nom APN)
  Serial.printf("[MODEM] 📡 Configuration APN: %s (type: IP pour internet)\n", apnToUse.c_str());
  if (!setApn(apnToUse)) {
    Serial.printf("[MODEM] ⚠️ Échec configuration APN \"%s\" → Retry avec APN par défaut\n", apnToUse.c_str());
    // Plus de valeur par défaut - la configuration doit venir du frontend
    String fallbackApn = "";  // Vide - sera configuré par frontend via USB
    if (setApn(fallbackApn)) {
      apnToUse = fallbackApn;
      NETWORK_APN = fallbackApn;
      Serial.printf("[MODEM] ✅ APN par défaut configuré: %s\n", fallbackApn.c_str());
    } else {
      Serial.println(F("[MODEM] ❌ Échec configuration même avec APN par défaut"));
      // Continue quand même, le modem peut avoir un APN par défaut
    }
  }

  if (!attachNetwork(networkAttachTimeoutMs)) {
    if (!isUsbMode) {
      Serial.println(F("[MODEM] réseau indisponible"));
    }
    sendLog("ERROR", "Network unavailable");
    return false;
  }
  Serial.println(F("[MODEM] ✅ Réseau attaché"));
  if (!connectData(networkAttachTimeoutMs)) {
    Serial.println(F("[MODEM] ❌ GPRS KO - Échec connexion données"));
    sendLog("ERROR", "GPRS connection failed");
    return false;
  }
  Serial.println(F("[MODEM] ✅ Session data active (GPRS connecté)"));
  Serial.println(F("[MODEM] ✅ Prêt pour envoi de données à la base de données"));

#ifdef TINY_GSM_MODEM_SIM7600
  // TLS géré par le modem SIM7600 (certificats chargés côté module)
#else
  netClient.setInsecure();
#endif
  modemReady = true;

  // Activer le GPS si configuré
  if (gpsEnabled) {
    // Logs GPS concis
    if (modem.enableGPS()) {
      Serial.println(F("[GPS] ✅ Activé | Fix: 30-60s"));
      sendLog("INFO", "GPS activé sur le modem");
    } else {
      Serial.println(F("[GPS] ❌ Échec activation"));
      sendLog("ERROR", "Échec activation GPS - vérifier antenne et modem");
    }
  } else {
    // S'assurer que le GPS est désactivé
    modem.disableGPS();
    if (!isUsbMode) {
      Serial.println(F("[GPS] GPS désactivé (config: gps_enabled=false)"));
    }
  }

  flushOfflineLogs();
  sendLog("INFO", "Modem connecté");
  return true;
}

void stopModem() {
  // Désactiver le GPS avant d'arrêter le modem (économie d'énergie)
  if (gpsEnabled) {
    Serial.println(F("[GPS] Désactivation GPS (arrêt modem)"));
    modem.disableGPS();
  }
  modem.gprsDisconnect();
  modemReady = false;
}

void goToSleep(uint32_t minutes) {
  Serial.printf("[SLEEP] %lu minutes\n", minutes);
  esp_sleep_enable_timer_wakeup(minutes * 60ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void logRuntimeConfig() {
  Serial.printf("⚙️  Sleep %lumin | GPS %s | WDT %lus | APN %s\n",
                static_cast<unsigned long>(configuredSleepMinutes),
                gpsEnabled ? "ON" : "OFF",
                watchdogTimeoutSeconds,
                NETWORK_APN.c_str());
}

Measurement captureSensorSnapshot() {
  Measurement m{};
  m.flow = airflowToLpm(measureAirflowRaw());
  m.battery = measureBattery();
  m.rssi = -999;
  return m;
}


// ================================================================
// APPROCHE 3 (HYBRIDE) : Envoi automatique au boot + streaming
// ================================================================
// Envoyer les informations complètes au boot/connexion USB
// Appelé automatiquement dès que le port série est prêt
void sendBootInfo() {
  StaticJsonDocument<1536> doc;  // Augmenté pour configuration complète
  
  // Type spécial pour boot_info (priorité max côté dashboard)
  doc["type"] = "boot_info";
  doc["mode"] = "usb_stream";
  doc["seq"] = 0;  // Séquence 0 = message de boot
  
  // === IDENTIFIANTS COMPLETS ===
  doc["sim_iccid"] = DEVICE_ICCID;
  doc["device_serial"] = DEVICE_SERIAL;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["device_name"] = buildDeviceName();
  
  // === PREMIÈRE MESURE ===
  Measurement m = captureSensorSnapshot();
  doc["flow_lpm"] = m.flow;
  doc["battery_percent"] = m.battery;
  doc["rssi"] = m.rssi;
  
  // === CONFIGURATION COMPLÈTE (comme GET_CONFIG) ===
  // Mesures
  doc["sleep_minutes"] = configuredSleepMinutes;
  doc["measurement_duration_ms"] = airflowSampleDelayMs;
  doc["send_every_n_wakeups"] = sendEveryNWakeups;
  
  // Calibration
  JsonArray calArray = doc.createNestedArray("calibration_coefficients");
  float a0 = isnan(CAL_OVERRIDE_A0) ? 0.0f : CAL_OVERRIDE_A0;
  float a1 = isnan(CAL_OVERRIDE_A1) ? 1.0f : CAL_OVERRIDE_A1;
  float a2 = isnan(CAL_OVERRIDE_A2) ? 0.0f : CAL_OVERRIDE_A2;
  calArray.add(a0);
  calArray.add(a1);
  calArray.add(a2);
  
  // Airflow
  doc["airflow_passes"] = airflowPasses;
  doc["airflow_samples_per_pass"] = airflowSamplesPerPass;
  doc["airflow_delay_ms"] = airflowSampleDelayMs;
  
  // GPS et roaming
  doc["gps_enabled"] = gpsEnabled;
  doc["roaming_enabled"] = roamingEnabled;
  
  // Modem
  doc["watchdog_seconds"] = watchdogTimeoutSeconds;
  doc["modem_boot_timeout_ms"] = modemBootTimeoutMs;
  doc["sim_ready_timeout_ms"] = simReadyTimeoutMs;
  doc["network_attach_timeout_ms"] = networkAttachTimeoutMs;
  doc["modem_max_reboots"] = modemMaxReboots;
  
  // Réseau
  doc["apn"] = NETWORK_APN;
  doc["sim_pin"] = SIM_PIN;
  doc["operator"] = "auto";  // Opérateur détecté automatiquement par le modem
  
  // OTA
  doc["ota_primary_url"] = otaPrimaryUrl.length() > 0 ? otaPrimaryUrl : "";
  doc["ota_fallback_url"] = otaFallbackUrl.length() > 0 ? otaFallbackUrl : "";
  doc["ota_md5"] = otaExpectedMd5.length() > 0 ? otaExpectedMd5 : "";
  
  // Timestamp
  doc["timestamp_ms"] = millis();
  doc["status"] = "BOOT_INFO";
  
  // Envoyer en une seule fois
  String jsonOutput;
  serializeJson(doc, jsonOutput);
  jsonOutput += '\n';
  Serial.print(jsonOutput);
  // NE PAS utiliser Serial.flush() - peut bloquer et causer des reconnexions USB en boucle
  // Le buffer se vide naturellement lors des prochaines écritures
  
  // Log de confirmation
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[BOOT] 🚀 Configuration complète envoyée au dashboard (boot_info)\n", timeStr.c_str());
}

void emitDebugMeasurement(const Measurement& m, uint32_t sequence, uint32_t intervalMs, float* latitude, float* longitude) {
  // Envoyer TOUTES les données en USB (format complet)
  StaticJsonDocument<1024> doc;  // Augmenté pour tous les paramètres

  // Mode et séquence
  doc["mode"] = "usb_stream";
  doc["type"] = "usb_stream";
  doc["seq"] = sequence;

  // Identifiants
  doc["sim_iccid"] = DEVICE_ICCID;
  doc["device_serial"] = DEVICE_SERIAL;
  doc["firmware_version"] = FIRMWARE_VERSION;

  // Calculer device_name (fonction utilitaire pour éviter duplication)
  doc["device_name"] = buildDeviceName();

  // Mesures principales
  // Mesures principales (format unifié uniquement)
  doc["flow_lpm"] = m.flow;
  doc["battery_percent"] = m.battery;
  doc["rssi"] = m.rssi;

  // Position GPS/réseau cellulaire (validation avant inclusion)
  if (latitude != nullptr && longitude != nullptr && isValidGpsCoordinates(*latitude, *longitude)) {
    doc["latitude"] = *latitude;
    doc["longitude"] = *longitude;
  }

  // Configuration essentielle seulement (pour réduire la taille des messages)
  // La config complète est disponible via GET_CONFIG
  doc["interval_ms"] = intervalMs;
  doc["sleep_minutes"] = configuredSleepMinutes;
  doc["measurement_duration_ms"] = airflowSampleDelayMs;

  // Coefficients de calibration (essentiels pour les calculs)
  JsonArray calArray = doc.createNestedArray("calibration_coefficients");
  float a0 = isnan(CAL_OVERRIDE_A0) ? 0.0f : CAL_OVERRIDE_A0;
  float a1 = isnan(CAL_OVERRIDE_A1) ? 1.0f : CAL_OVERRIDE_A1;
  float a2 = isnan(CAL_OVERRIDE_A2) ? 0.0f : CAL_OVERRIDE_A2;
  calArray.add(a0);
  calArray.add(a1);
  calArray.add(a2);

  // Timestamp
  doc["timestamp_ms"] = millis();

  // Statut
  doc["status"] = "USB_STREAM";

  // Envoyer le JSON complet en une seule fois (une seule ligne)
  // Utiliser un buffer String pour envoyer tout d'un coup (plus efficace)
  String jsonOutput;
  serializeJson(doc, jsonOutput);
  jsonOutput += '\n';        // Nouvelle ligne pour terminer le JSON
  Serial.print(jsonOutput);  // Envoyer tout d'un coup
  // NE PAS utiliser Serial.flush() - peut bloquer et causer des reconnexions USB en boucle
  // Le buffer se vide naturellement lors des prochaines écritures

  // Message de debug (seulement toutes les 20 mesures pour réduire le bruit)
  if (sequence % 20 == 0) {
    String timeStr = formatTimeFromMillis(millis());
    if (latitude != nullptr && longitude != nullptr) {
      Serial.printf("%s[USB] Flow=%.2f L/min | Bat=%.0f%% | RSSI=%d dBm | GPS=%.4f,%.4f\n",
                    timeStr.c_str(), m.flow, m.battery, m.rssi, *latitude, *longitude);
    } else {
      Serial.printf("%s[USB] Flow=%.2f L/min | Bat=%.0f%% | RSSI=%d dBm\n",
                    timeStr.c_str(), m.flow, m.battery, m.rssi);
    }
  }
}


// Gérer les commandes série (config, calibration, etc.)
void handleSerialCommand(const String& command) {
  String trimmed = command;
  trimmed.trim();

  // Debug : afficher la commande reçue
  Serial.print(F("[CMD] 🔍 DEBUG: Commande reçue: "));
  Serial.println(trimmed);
  Serial.print(F("[CMD] 🔍 DEBUG: Longueur: "));
  Serial.print(trimmed.length());
  Serial.println(F(" caractères"));

  // Vérifier si c'est une commande JSON entrante (commence par '{' et contient "command")
  if (trimmed.startsWith("{")) {
    // C'est peut-être une commande JSON entrante, vérifier
    if (trimmed.indexOf("\"command\"") >= 0 || trimmed.indexOf("'command'") >= 0) {
      // C'est une commande JSON entrante, la traiter
      StaticJsonDocument<512> cmdDoc;
      DeserializationError error = deserializeJson(cmdDoc, trimmed);

      if (!error && cmdDoc.containsKey("command")) {
        String cmdVerb = cmdDoc["command"].as<String>();
        cmdVerb.toUpperCase();

        Serial.print(F("[CMD] 🔍 DEBUG: Commande JSON détectée: "));
        Serial.println(cmdVerb);

        // Créer une structure Command pour compatibilité avec handleCommand
        Command cmd;
        cmd.id = 0;  // Pas d'ID pour les commandes USB
        cmd.verb = cmdVerb;
        cmd.payloadRaw = "";  // Le payload sera dans cmdDoc si nécessaire

        // Extraire le payload si présent
        // CRITIQUE: Extraire uniquement le payload, pas le JSON complet avec "command"
        if (cmdDoc.containsKey("payload")) {
          JsonObject payloadObj = cmdDoc["payload"].as<JsonObject>();
          serializeJson(payloadObj, cmd.payloadRaw);
        } else if (cmdDoc.containsKey("config")) {
          JsonObject configObj = cmdDoc["config"].as<JsonObject>();
          serializeJson(configObj, cmd.payloadRaw);
        }

        Serial.print(F("[CMD] 🔍 DEBUG: Appel handleCommand pour: "));
        Serial.println(cmdVerb);

        // Traiter la commande
        uint32_t dummySleep = configuredSleepMinutes;
        handleCommand(cmd, dummySleep);

        Serial.print(F("[CMD] 🔍 DEBUG: handleCommand terminé pour: "));
        Serial.println(cmdVerb);
        return;
      } else if (error) {
        Serial.print(F("[CMD] 🔍 DEBUG: Erreur parsing JSON: "));
        Serial.println(error.c_str());
      } else {
        Serial.println(F("[CMD] 🔍 DEBUG: JSON valide mais pas de clé 'command'"));
      }
    }

    // C'est du JSON de streaming sortant, pas une commande - ignorer silencieusement
    return;
  }

  // Ignorer les fragments de JSON (fins de tableaux, etc.)
  // Exemples: "0,1,0]}", "]}" , etc.
  if (trimmed.endsWith("]}") || trimmed.endsWith("}") || (trimmed.indexOf(',') >= 0 && trimmed.indexOf(']') >= 0)) {
    // C'est probablement un fragment de JSON, ignorer silencieusement
    return;
  }

  String lowered = command;
  lowered.toLowerCase();

  // Commande config {...} - Configuration directe via USB
  if (lowered.startsWith("config ")) {
    String jsonPayload = command.substring(7);
    jsonPayload.trim();

    // SÉCURITÉ: Limiter la taille du payload pour éviter overflow
    if (jsonPayload.length() > 512) {
      Serial.println(F("❌ Payload trop long (max 512 caractères)"));
      return;
    }

    StaticJsonDocument<512> payloadDoc;
    DeserializationError error = deserializeJson(payloadDoc, jsonPayload);

    if (error) {
      Serial.printf("❌ Erreur JSON: %s\n", error.c_str());
      return;
    }

    {
      bool configUpdated = false;

      if (payloadDoc.containsKey("sleep_minutes")) {
        uint32_t newSleep = payloadDoc["sleep_minutes"].as<uint32_t>();
        if (newSleep > 0 && newSleep <= 10080) {
          configuredSleepMinutes = newSleep;
          configUpdated = true;
        }
      }

      if (payloadDoc.containsKey("measurement_duration_ms")) {
        uint32_t newDuration = payloadDoc["measurement_duration_ms"].as<uint32_t>();
        if (newDuration >= 100 && newDuration <= 60000) {
          airflowSampleDelayMs = newDuration;
          configUpdated = true;
        }
      }

      if (payloadDoc.containsKey("gps_enabled")) {
        bool newGpsState = payloadDoc["gps_enabled"].as<bool>();
        if (newGpsState != gpsEnabled) {
          gpsEnabled = newGpsState;
          configUpdated = true;
          Serial.printf("✅ GPS: %s\n", gpsEnabled ? "ON" : "OFF");

          // Activer/désactiver le GPS sur le modem si le modem est prêt
          if (modemReady) {
            if (gpsEnabled) {
              Serial.println(F("[GPS] Activation GPS sur le modem (via USB)..."));
              if (modem.enableGPS()) {
                Serial.println(F("[GPS] ✅ GPS activé avec succès"));
                Serial.println(F("[GPS] ⏱️  Le premier fix peut prendre 30-60 secondes"));
              } else {
                Serial.println(F("[GPS] ❌ ÉCHEC activation GPS"));
                Serial.println(F("[GPS]   Vérifier: antenne GPS connectée, modem compatible"));
              }
            } else {
              Serial.println(F("[GPS] Désactivation GPS..."));
              modem.disableGPS();
              Serial.println(F("[GPS] ✅ GPS désactivé"));
            }
          } else {
            Serial.println(F("[GPS] ⚠️  Modem non prêt - GPS sera activé au prochain démarrage modem"));
          }
        }
      }

      if (configUpdated) {
        saveConfig();
        Serial.printf("✅ Config: ⏰%lu min | ⏱️%lu ms | 📡 GPS: %s\n",
                      static_cast<unsigned long>(configuredSleepMinutes),
                      static_cast<unsigned long>(airflowSampleDelayMs),
                      gpsEnabled ? "ON" : "OFF");
      }
    }
    return;
  }

  // Commande calibration {...} - Calibration directe via USB
  if (lowered.startsWith("calibration ")) {
    String jsonPayload = command.substring(12);
    jsonPayload.trim();

    // SÉCURITÉ: Limiter la taille du payload
    if (jsonPayload.length() > 256) {
      Serial.println(F("❌ Payload trop long (max 256 caractères)"));
      return;
    }

    StaticJsonDocument<256> payloadDoc;
    DeserializationError error = deserializeJson(payloadDoc, jsonPayload);

    if (error) {
      Serial.printf("❌ Erreur JSON: %s\n", error.c_str());
      return;
    }

    {
      if (payloadDoc.containsKey("a0") && payloadDoc.containsKey("a1") && payloadDoc.containsKey("a2")) {
        float a0 = payloadDoc["a0"].as<float>();
        float a1 = payloadDoc["a1"].as<float>();
        float a2 = payloadDoc["a2"].as<float>();

        updateCalibration(a0, a1, a2);
        saveConfig();
        Serial.printf("✅ Calibration: [%.3f, %.3f, %.3f]\n", a0, a1, a2);
      } else {
        Serial.println(F("❌ Coefficients manquants"));
      }
    }
    return;
  }

  // Commande inconnue
  Serial.printf("⚠️  Commande inconnue: %s\n", command.c_str());
}

void configureWatchdog(uint32_t timeoutSeconds) {
  uint32_t applied = std::max<uint32_t>(timeoutSeconds, static_cast<uint32_t>(MIN_WATCHDOG_TIMEOUT_SEC));
  watchdogTimeoutSeconds = applied;

  // Nettoie toute instance précédente potentiellement créée par l'ESP-IDF
  // Ignorer l'erreur si la tâche n'est pas dans le watchdog (première initialisation)
  if (watchdogConfigured) {
    esp_task_wdt_delete(NULL);
  }
  esp_task_wdt_deinit();
  watchdogConfigured = false;

  esp_task_wdt_config_t config = {
    .timeout_ms = watchdogTimeoutSeconds * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true,
  };

  if (esp_task_wdt_init(&config) == ESP_OK) {
    esp_task_wdt_add(NULL);
    watchdogConfigured = true;
    Serial.printf("[WDT] armé (%lus)\n", watchdogTimeoutSeconds);
  } else {
    Serial.println(F("[WDT] init échouée"));
    watchdogConfigured = false;
  }
}

void feedWatchdog() {
  if (watchdogConfigured) {
    esp_task_wdt_reset();
  }
}

static const char* regStatusToString(RegStatus status) {
  switch (status) {
    case REG_UNREGISTERED: return "non enregistré";
    case REG_SEARCHING: return "recherche opérateur";
    case REG_DENIED: return "refusé";
    case REG_OK_HOME: return "attaché (home)";
    case REG_OK_ROAMING: return "attaché (roaming)";
    case REG_UNKNOWN: return "inconnu";
    default: return "indéfini";
  }
}

// Fonction pour obtenir une description claire du statut d'enregistrement
String getRegistrationStatusDescription(RegStatus reg) {
  switch (reg) {
    case REG_UNREGISTERED: return "Non enregistré sur le réseau";
    case REG_SEARCHING: return "Recherche de réseau en cours";
    case REG_DENIED: return "Accès refusé par le réseau";
    case REG_OK_HOME: return "Enregistré sur le réseau (domicile)";
    case REG_OK_ROAMING: return "Enregistré sur le réseau (roaming)";
    case REG_UNKNOWN: return "Statut inconnu";
    default: return "Statut inconnu";
  }
}

// Fonction pour obtenir une description claire de l'opérateur
String getOperatorDescription(const String& oper) {
  if (oper.length() == 0) return "Opérateur non détecté";

  String name = getOperatorName(oper);
  if (name.length() > 0) {
    return name;
  }

  // Si le nom n'est pas trouvé, retourner le code avec explication
  if (oper.indexOf("20801") >= 0 || oper.indexOf("20802") >= 0) return "Orange France";
  if (oper.indexOf("20810") >= 0 || oper.indexOf("20811") >= 0) return "SFR France";
  if (oper.indexOf("20815") >= 0 || oper.indexOf("20816") >= 0) return "Free Mobile";
  if (oper.indexOf("20820") >= 0 || oper.indexOf("20821") >= 0) return "Bouygues Telecom";

  return "Opérateur inconnu";
}

// Fonction pour obtenir une description claire du signal
String getSignalDescription(int8_t csq) {
  if (csq == 99) return "Signal invalide";
  if (csq >= 20) return "Signal excellent";
  if (csq >= 15) return "Signal bon";
  if (csq >= 10) return "Signal moyen";
  if (csq >= 5) return "Signal faible";
  return "Signal très faible";
}

void logRadioSnapshot(const char* stage) {
  RegStatus reg = modem.getRegistrationStatus();
  int8_t csq = modem.getSignalQuality();
  String oper = modem.getOperator();
  bool eps = modem.isNetworkConnected();
  bool gprs = modem.isGprsConnected();

  // Vérifier l'état EPS (LTE) avec la fonction helper
  bool epsOk = false;
  String epsStatus = "Non disponible";
  checkEpsStatus(epsOk, epsStatus);

  // Description claire du stage
  String stageDesc = "";
  if (strcmp(stage, "attach:start") == 0) stageDesc = "Début de connexion";
  else if (strcmp(stage, "attach:success") == 0) stageDesc = "Connexion réussie";
  else if (strcmp(stage, "attach:retry") == 0) stageDesc = "Nouvelle tentative";
  else if (strcmp(stage, "attach:timeout") == 0) stageDesc = "Délai dépassé";
  else if (strcmp(stage, "attach:csq_warn") == 0) stageDesc = "Avertissement signal";
  else if (strcmp(stage, "attach:csq_fail") == 0) stageDesc = "Échec signal";
  else if (strcmp(stage, "data:start") == 0) stageDesc = "Début connexion données";
  else if (strcmp(stage, "data:connected") == 0) stageDesc = "Données connectées";
  else if (strcmp(stage, "data:timeout") == 0) stageDesc = "Délai connexion données";
  else stageDesc = stage;

  Serial.println(F("┌─────────────────────────────────────────────────────────┐"));
  Serial.printf("│ 📡 État réseau - %s\n", stageDesc.c_str());
  Serial.println(F("├─────────────────────────────────────────────────────────┤"));

  // Signal
  if (csq == 99) {
    Serial.println(F("│ ⚠️  Signal: Invalide (antenne déconnectée ou pas de couverture)"));
  } else {
    int rssi = csqToRssi(csq);
    String signalDesc = getSignalDescription(csq);
    Serial.printf("│ 📶 Signal: %s (RSSI: %d dBm)\n", signalDesc.c_str(), rssi);
  }

  // Enregistrement réseau
  String regDesc = getRegistrationStatusDescription(reg);
  Serial.printf("│ 📍 Réseau: %s\n", regDesc.c_str());

  // Opérateur
  String operDesc = getOperatorDescription(oper);
  Serial.printf("│ 🏢 Opérateur: %s\n", operDesc.c_str());

  // EPS (LTE)
  if (epsOk) {
    Serial.printf("│ 📡 4G/LTE: Connecté (%s)\n", epsStatus.c_str());
  } else {
    Serial.printf("│ 📡 4G/LTE: Non connecté (%s)\n", epsStatus.c_str());
  }

  // GPRS
  if (gprs) {
    Serial.println(F("│ 📱 Données mobiles: Connectées"));
  } else {
    Serial.println(F("│ 📱 Données mobiles: Non connectées"));
  }

  Serial.println(F("└─────────────────────────────────────────────────────────┘"));

  // Messages d'aide supplémentaires pour les problèmes courants
  if (reg == REG_DENIED) {
    Serial.println(F(""));
    Serial.println(F("⚠️  ENREGISTREMENT REFUSÉ PAR LE RÉSEAU"));
    Serial.println(F("   Causes possibles:"));
    Serial.println(F("   • Carte SIM non activée pour les données"));
    Serial.println(F("   • APN incorrect pour l'opérateur"));
    Serial.println(F("   • Problème d'authentification réseau"));
    if (oper.length() > 0) {
      String recommendedApn = getRecommendedApnForOperator(oper);
      if (recommendedApn.length() > 0 && recommendedApn != NETWORK_APN) {
        Serial.printf("   → APN recommandé pour %s: %s (actuel: %s)\n",
                      operDesc.c_str(), recommendedApn.c_str(), NETWORK_APN.c_str());
      }
    }
    Serial.println(F(""));
  }

  if (csq == 99) {
    Serial.println(F(""));
    Serial.println(F("⚠️  SIGNAL INVALIDE"));
    Serial.println(F("   Causes possibles:"));
    Serial.println(F("   • Antenne déconnectée ou défectueuse"));
    Serial.println(F("   • Pas de couverture réseau à cet emplacement"));
    Serial.println(F("   • Modem non initialisé correctement"));
    Serial.println(F("   • Problème matériel (câble, connecteur)"));
    Serial.println(F(""));
  }
}

bool waitForSimReady(uint32_t timeoutMs) {
  bool isUsbMode = Serial.availableForWrite() > 0;
  unsigned long start = millis();
  if (!isUsbMode) {
    Serial.println(F("[MODEM] attente SIM"));
  }
  while (millis() - start < timeoutMs) {
    SimStatus sim = modem.getSimStatus();
    feedWatchdog();
    if (sim == SIM_READY) {
      Serial.println(F("[MODEM] SIM READY"));
      return true;
    }
    if (sim == SIM_LOCKED && SIM_PIN.length()) {
      Serial.println(F("[MODEM] SIM verrouillée → déverrouillage"));
      modem.simUnlock(SIM_PIN.c_str());
    }
    delay(500);
  }
  return false;
}

/**
 * Détecte l'opérateur de la carte SIM réelle via l'ICCID (MÉTHODE FALLBACK)
 * 
 * Cette fonction est utilisée en fallback si detectSimOperatorFromImsi() échoue.
 * 
 * LIMITATIONS :
 * - Free et Orange partagent les préfixes ICCID (893301, 893302, etc.)
 * - Ne peut pas distinguer Free Pro d'Orange uniquement par ICCID
 * - Utilise l'APN par défaut et l'opérateur détecté pour trancher
 * 
 * Pour une détection plus fiable, utiliser detectSimOperatorFromImsi() en priorité.
 * 
 * @param iccid ICCID de la carte SIM
 * @return Code opérateur détecté ("20801" pour Orange, "20815" pour Free, etc.) ou "" si non détecté
 */
String detectSimOperatorFromIccid(const String& iccid) {
  if (iccid.length() < 6) {
    return "";
  }

  // Préfixes ICCID français (les 6 premiers chiffres)
  // Format ICCID: 89 (France) + 3 (mobile) + XXX (opérateur)
  String prefix = iccid.substring(0, 6);

  // Orange France : 893301, 893302, 893303, 893304 (mais partagé avec Free)
  // SFR France : 893310, 893311
  // Bouygues Telecom : 893320, 893321
  // Free Mobile : 893301, 893302 (partagé avec Orange - nécessite autre méthode)

  // Note: Free et Orange partagent des préfixes ICCID, donc on ne peut pas
  // les distinguer uniquement par ICCID. On utilisera une combinaison de méthodes.

  if (prefix == "893310" || prefix == "893311") {
    return "20810";  // SFR
  } else if (prefix == "893320" || prefix == "893321") {
    return "20820";  // Bouygues
  }

  // Pour Orange/Free (893301, 893302, 893303, 893304), on ne peut pas distinguer
  // uniquement par ICCID.
  //
  // IMPORTANT: Les cartes Free Pro utilisent souvent ces préfixes et sont souvent
  // en roaming sur Orange. Si l'APN par défaut est "free", c'est probablement une carte Free.
  // Sinon, on utilisera l'opérateur détecté par le modem pour décider.
  //
  // On retourne "" pour indiquer qu'une détection supplémentaire est nécessaire.
  // La logique dans startModem() et attachNetworkWithRetry() privilégiera Free
  // si l'APN par défaut est "free" ou si l'opérateur détecté est Free.

  return "";  // Nécessite détection supplémentaire (vérifier APN par défaut ou opérateur détecté)
}

/**
 * Détecte l'opérateur de la carte SIM réelle via l'IMSI (MÉTHODE LA PLUS FIABLE)
 * 
 * L'IMSI contient le MCC+MNC de l'opérateur réel, même en roaming.
 * Format IMSI : MCC (3 chiffres) + MNC (2-3 chiffres) + MSIN (numéro d'abonné)
 * Pour la France : MCC = 208
 * 
 * Avantages par rapport à ICCID :
 * - Plus fiable : contient le MCC+MNC réel de l'opérateur
 * - Fonctionne même en roaming (identifie l'opérateur de la carte SIM, pas du réseau)
 * - Résout le problème des cartes Free Pro qui partagent les préfixes ICCID avec Orange
 * 
 * @return Code opérateur détecté ("20801" pour Orange, "20815" pour Free, etc.) ou "" si non détecté
 */
String detectSimOperatorFromImsi() {
  // Lire l'IMSI avec la commande AT+CIMI
  modem.sendAT(GF("+CIMI"));
  if (modem.waitResponse(2000, GF("+CIMI:")) == 1) {
    String imsi = modem.stream.readStringUntil('\n');
    imsi.trim();

    if (imsi.length() >= 5) {
      // Extraire MCC+MNC (5 premiers chiffres pour la France)
      String mccMnc = imsi.substring(0, 5);

      // Codes opérateurs français (MCC: 208)
      if (mccMnc == "20801" || mccMnc == "20802") {
        return "20801";  // Orange France
      } else if (mccMnc == "20810" || mccMnc == "20811") {
        return "20810";  // SFR France
      } else if (mccMnc == "20815" || mccMnc == "20816") {
        return "20815";  // Free Mobile
      } else if (mccMnc == "20820" || mccMnc == "20821") {
        return "20820";  // Bouygues Telecom
      }

      // Si le MCC n'est pas 208, vérifier les 3 premiers chiffres (MCC)
      if (imsi.length() >= 3) {
        String mcc = imsi.substring(0, 3);
        if (mcc == "208") {
          // MCC français mais MNC non reconnu
          Serial.printf("[MODEM] ⚠️ IMSI détecté (MCC: 208) mais MNC non reconnu: %s\n", mccMnc.c_str());
        }
      }
    }
  }

  return "";  // IMSI non lu ou format invalide
}

/**
 * Configure l'APN sur le modem (factorise les appels répétés pour éviter la duplication)
 * 
 * Cette fonction centralise la configuration de l'APN pour éviter la duplication de code.
 * Tous les appels à modem.sendAT(GF("+CGDCONT=1,\"IP\",\"...")) sont remplacés par setApn().
 * 
 * @param apn APN à configurer (ex: "free", "orange", "sl2sfr", "mmsbouygtel")
 * @return true si la configuration a réussi, false sinon
 */
bool setApn(const String& apn) {
  if (apn.length() == 0) {
    return false;
  }

  modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), apn.c_str(), "\"");
  if (modem.waitResponse(2000) == 1) {
    NETWORK_APN = apn;
    return true;
  }
  return false;
}

/**
 * Obtient l'APN recommandé selon l'opérateur détecté
 * 
 * Configuration des opérateurs français:
 * - Orange: "orange" ou "orange.fr"
 * - SFR: "sl2sfr"
 * - Free Mobile: "free" (même en roaming sur Orange)
 * - Bouygues: "mmsbouygtel"
 */
String getRecommendedApnForOperator(const String& operatorCode) {
  // Codes opérateurs français (MCC+MNC)
  // OPTIMISATION RAM: Utiliser des constantes au lieu de String() pour économiser la RAM
  if (operatorCode.indexOf("20801") >= 0 || operatorCode.indexOf("20802") >= 0) {
    // Orange France (MCC: 208, MNC: 01/02)
    // APN Internet: "orange" ou "orange.fr" (les deux fonctionnent généralement)
    // On utilise "orange" car c'est le plus court et le plus commun
    return F("orange");
  } else if (operatorCode.indexOf("20810") >= 0 || operatorCode.indexOf("20811") >= 0) {
    // SFR France (MCC: 208, MNC: 10/11)
    return F("sl2sfr");
  } else if (operatorCode.indexOf("20815") >= 0 || operatorCode.indexOf("20816") >= 0) {
    // Free Mobile France (MCC: 208, MNC: 15/16)
    // APN Internet: "free" (pour données/internet)
    // Note: "mmsfree" existe mais est uniquement pour MMS, pas pour internet
    return F("free");
  } else if (operatorCode.indexOf("20820") >= 0) {
    // Bouygues Telecom France (MCC: 208, MNC: 20)
    return F("mmsbouygtel");
  }

  // Par défaut, retourner l'APN configuré
  return NETWORK_APN;
}

/**
 * Convertit le code opérateur (MCC+MNC) en nom d'opérateur lisible
 * @param operatorCode Code opérateur (ex: "20801" pour Orange France)
 * @return Nom de l'opérateur ou le code si non reconnu
 */
String getOperatorName(const String& operatorCode) {
  // Codes opérateurs français (MCC+MNC)
  // OPTIMISATION RAM: Utiliser F() au lieu de String() pour économiser la RAM
  if (operatorCode.indexOf("20801") >= 0 || operatorCode.indexOf("20802") >= 0) {
    return F("Orange France");
  } else if (operatorCode.indexOf("20810") >= 0 || operatorCode.indexOf("20811") >= 0) {
    return F("SFR France");
  } else if (operatorCode.indexOf("20815") >= 0 || operatorCode.indexOf("20816") >= 0) {
    return F("Free Mobile");
  } else if (operatorCode.indexOf("20820") >= 0) {
    return F("Bouygues Telecom");
  }

  // Si le code commence par 208, c'est un opérateur français non reconnu
  if (operatorCode.indexOf("208") >= 0) {
    return String(F("Opérateur FR (")) + operatorCode + F(")");
  }

  // Par défaut, retourner le code tel quel
  return operatorCode;
}

/**
 * Vérifie l'état EPS (LTE) du modem
 * @param epsOk Référence pour retourner si EPS est OK
 * @param epsStatus Référence pour retourner le statut lisible
 * @return true si la commande AT a réussi, false sinon
 */
bool checkEpsStatus(bool& epsOk, String& epsStatus) {
  epsOk = false;
  epsStatus = "N/A";

  modem.sendAT(GF("+CEREG?"));
  if (modem.waitResponse(2000, GF("+CEREG:")) == 1) {
    String res = modem.stream.readStringUntil('\n');
    res.trim();
    // Format: +CEREG: <n>,<stat>[,<tac>[,<ci>[,<AcT>]]]
    // Exemple: "+CEREG: 2,1" ou "+CEREG: 2,1,\"1234\",\"5678\",7"
    int commaPos = res.indexOf(',');
    if (commaPos > 0) {
      int stat = res.substring(commaPos + 1).toInt();
      // stat: 0=not registered, 1=registered home, 2=searching, 3=denied, 4=unknown, 5=registered roaming
      if (stat == 1 || stat == 5) {
        epsOk = true;
        epsStatus = (stat == 1) ? "OK (home)" : "OK (roaming)";
      } else if (stat == 0) {
        epsStatus = "KO (not registered)";
      } else if (stat == 2) {
        epsStatus = "KO (searching)";
      } else if (stat == 3) {
        epsStatus = "KO (denied)";
      } else if (stat == 4) {
        epsStatus = "KO (unknown)";
      } else {
        epsStatus = String(F("KO (stat=")) + String(stat) + F(")");
      }
    } else {
      epsStatus = "KO (parse error)";
    }
    return true;
  }
  epsStatus = "N/A (timeout)";
  return false;
}

/**
 * Attache le réseau avec retry et backoff exponentiel
 * 
 * Cette fonction gère l'attachement au réseau mobile :
 * - Détection intelligente de l'opérateur via IMSI (prioritaire) ou ICCID (fallback)
 * - Détection spéciale Free Pro en roaming (via IMSI + APN par défaut)
 * - Configuration automatique de l'APN selon l'opérateur détecté
 * - Gestion du roaming : utilise l'APN de la carte SIM, pas du réseau en roaming
 * - Retry avec backoff exponentiel en cas d'échec
 * - Gestion spécifique du cas REG_DENIED avec tentative d'APN alternatif
 * - Logs clairs et informatifs pour faciliter le débogage
 * 
 * @param timeoutMs Timeout total en millisecondes
 * @param maxRetries Nombre maximum de tentatives
 * @return true si l'attachement a réussi, false sinon
 */
bool attachNetworkWithRetry(uint32_t timeoutMs, uint8_t maxRetries) {
  unsigned long start = millis();
  uint8_t retryCount = 0;
  uint32_t baseDelay = 5000;  // 5 secondes de base

  Serial.println(F(""));
  Serial.println(F("═══════════════════════════════════════════════════════════"));
  Serial.println(F("📡 Connexion au réseau mobile en cours..."));
  Serial.println(F("═══════════════════════════════════════════════════════════"));
  logRadioSnapshot("attach:start");

  // CRITIQUE: Détecter l'opérateur AVANT la première tentative d'attachement
  // Si l'opérateur n'a pas été détecté dans startModem(), on l'attend ici (jusqu'à 10s)
  // Cela évite les tentatives inutiles avec le mauvais APN
  String apnToUse = NETWORK_APN;
  String oper = modem.getOperator();

  // Si l'opérateur n'est pas encore détecté, attendre un peu (peut prendre quelques secondes après SIM ready)
  if (oper.length() == 0) {
    Serial.println(F("[MODEM] ⏳ Opérateur non encore détecté - Attente détection (max 10s)..."));
    unsigned long operatorWaitStart = millis();
    unsigned long lastWaitLog = 0;
    while (oper.length() == 0 && (millis() - operatorWaitStart < 10000)) {
      oper = modem.getOperator();
      if (oper.length() == 0) {
        delay(500);
        feedWatchdog();
        // Afficher progression toutes les 2 secondes
        unsigned long elapsed = millis() - operatorWaitStart;
        if (elapsed - lastWaitLog >= 2000) {
          unsigned long remaining = (10000 - elapsed) / 1000;
          if (remaining > 0) {
            Serial.printf("[MODEM] ⏳ Attente détection opérateur... (%lu s restantes)\n", remaining);
          }
          lastWaitLog = elapsed;
        }
      }
    }
  }

  // CRITIQUE: Détecter la carte SIM réelle pour déterminer l'APN correct
  // En roaming, il faut utiliser l'APN de la carte SIM, pas de l'opérateur en roaming
  // MÉTHODE 1 : Essayer de détecter via IMSI (plus fiable, contient le MCC+MNC réel)
  String simOperator = detectSimOperatorFromImsi();

  // MÉTHODE 2 : Si IMSI n'a pas fonctionné, utiliser ICCID (moins fiable car préfixes partagés)
  if (simOperator.length() == 0) {
    simOperator = detectSimOperatorFromIccid(DEVICE_ICCID);
  }
  String simOperatorName = simOperator.length() > 0 ? getOperatorName(simOperator) : "";

  // Si l'ICCID ne permet pas de détecter (Orange/Free partagent des préfixes 893301/893302),
  // on utilise plusieurs indices pour déterminer l'opérateur réel :
  // 1. Si l'APN par défaut est "free", c'est probablement une carte Free Pro
  // 2. Si l'opérateur détecté est Free (20815/20816), c'est Free
  // 3. Si l'opérateur détecté est Orange (20801/20802) ET l'APN par défaut est "free",
  //    c'est probablement une carte Free Pro en roaming sur Orange
  // 4. Sinon, on assume que c'est l'opérateur détecté (Orange si détecté)
  if (simOperator.length() == 0 && oper.length() > 0) {
    String iccidPrefix = DEVICE_ICCID.length() >= 6 ? DEVICE_ICCID.substring(0, 6) : "";
    bool isAmbiguousPrefix = (iccidPrefix == "893301" || iccidPrefix == "893302" || iccidPrefix == "893303" || iccidPrefix == "893304");

    if (isAmbiguousPrefix) {
      // Préfixe ambigu (Orange/Free) - utiliser plusieurs indices
      if (NETWORK_APN == "free" || OTT_DEFAULT_APN == "free") {
        // L'APN par défaut est "free" → c'est probablement une carte Free Pro
        simOperator = "20815";  // Free Mobile
        simOperatorName = "Free Mobile";
        Serial.printf("[MODEM] 🔍 Carte SIM Free Pro détectée via APN par défaut (ICCID: %s...)\n",
                      DEVICE_ICCID.substring(0, 10).c_str());
        Serial.println(F("[MODEM] 💡 Les cartes Free Pro partagent les préfixes ICCID avec Orange"));
        Serial.println(F("[MODEM] 💡 L'APN par défaut \"free\" indique que c'est une carte Free"));
      } else if (oper.indexOf("20815") >= 0 || oper.indexOf("20816") >= 0) {
        // Opérateur détecté = Free
        simOperator = oper;
        simOperatorName = getOperatorName(oper);
        Serial.printf("[MODEM] 🔍 Carte SIM Free détectée via opérateur (ICCID: %s...)\n",
                      DEVICE_ICCID.substring(0, 10).c_str());
      } else if (oper.indexOf("20801") >= 0 || oper.indexOf("20802") >= 0) {
        // Opérateur détecté = Orange
        // Si l'APN par défaut est "free", c'est probablement une carte Free Pro en roaming
        if (NETWORK_APN == "free" || OTT_DEFAULT_APN == "free") {
          simOperator = "20815";  // Free Mobile
          simOperatorName = "Free Mobile";
          Serial.printf("[MODEM] 🔍 Carte SIM Free Pro détectée (en roaming sur Orange)\n");
          Serial.printf("[MODEM] 💡 Opérateur détecté: Orange, mais APN \"free\" indique carte Free Pro\n");
        } else {
          // Probablement Orange (réseau home)
          simOperator = oper;
          simOperatorName = getOperatorName(oper);
          Serial.printf("[MODEM] 🔍 Carte SIM Orange détectée (ICCID: %s...)\n",
                        DEVICE_ICCID.substring(0, 10).c_str());
        }
      }
    } else if (oper.length() > 0) {
      // Préfixe non ambigu, utiliser l'opérateur détecté
      simOperator = oper;
      simOperatorName = getOperatorName(oper);
    }
  }

  if (simOperator.length() > 0) {
    Serial.printf("[MODEM] 🔍 Carte SIM détectée: %s (ICCID: %s...)\n",
                  simOperatorName.c_str(), DEVICE_ICCID.substring(0, 10).c_str());
  }

  // Maintenant que l'opérateur est détecté (ou non), configurer l'APN correct
  // CRITIQUE: Utiliser l'APN de la carte SIM réelle, pas de l'opérateur en roaming
  // MAIS: Ne pas écraser l'APN si il a été configuré manuellement (apnManual = true)
  if (apnManual) {
    // APN configuré manuellement - ne pas écraser par détection automatique
    Serial.printf("[MODEM] 🔒 APN configuré manuellement: \"%s\" (ne sera pas écrasé par détection auto)\n", NETWORK_APN.c_str());
    // Utiliser l'APN configuré manuellement
    apnToUse = NETWORK_APN;
  } else if (simOperator.length() > 0) {
    // Carte SIM détectée : utiliser son APN (même en roaming)
    String simApn = getRecommendedApnForOperator(simOperator);
    if (simApn.length() > 0 && simApn != apnToUse) {
      String currentOperatorName = oper.length() > 0 ? getOperatorName(oper) : "inconnu";
      if (oper != simOperator && oper.length() > 0) {
        Serial.printf("[MODEM] 🔄 ROAMING détecté: Carte %s sur réseau %s\n",
                      simOperatorName.c_str(), currentOperatorName.c_str());
        Serial.printf("[MODEM] ✅ Utilisation APN de la carte SIM: \"%s\" (pas de l'opérateur en roaming)\n",
                      simApn.c_str());
      } else {
        Serial.printf("[MODEM] ✅ Carte %s sur réseau home → APN: \"%s\"\n",
                      simOperatorName.c_str(), simApn.c_str());
      }
      apnToUse = simApn;
      if (setApn(apnToUse)) {
        LOG_I("MODEM", String(F("APN configuré: ")) + apnToUse);
      }
      delay(1000);
      feedWatchdog();
    } else if (simApn.length() > 0) {
      apnToUse = simApn;
      LOG_D("MODEM", simOperatorName + F(" → APN: ") + apnToUse);
    }
  } else if (oper.length() > 0) {
    // Carte SIM non détectée : utiliser l'APN de l'opérateur détecté
    String operatorName = getOperatorName(oper);
    String recommendedApn = getRecommendedApnForOperator(oper);
    if (recommendedApn.length() > 0 && recommendedApn != apnToUse) {
      LOG_I("MODEM", operatorName + F(" (") + oper + F(") → APN: ") + apnToUse + F(" → ") + recommendedApn);
      apnToUse = recommendedApn;
      if (setApn(apnToUse)) {
        LOG_D("MODEM", String(F("APN configuré: ")) + apnToUse);
      }
      delay(1000);
      feedWatchdog();
    } else if (recommendedApn.length() > 0) {
      LOG_D("MODEM", operatorName + F(" (") + oper + F(") | APN: ") + apnToUse);
    } else {
      LOG_W("MODEM", operatorName + F(" (") + oper + F(") APN non reconnu | APN: ") + apnToUse);
    }
  } else {
    LOG_W("MODEM", String(F("Opérateur non détecté | APN: ")) + apnToUse);
  }

  // Attendre stabilisation modem
  LOG_D("MODEM", "Stabilisation modem (5s)...");
  unsigned long stabilStart = millis();
  while (millis() - stabilStart < 5000) {
    delay(500);
    feedWatchdog();
  }
  LOG_D("MODEM", "Stabilisation OK");

  int8_t initialCsq = modem.getSignalQuality();
  if (initialCsq == 99) {
    LOG_W("MODEM", "Signal invalide - Attente 10s...");
    unsigned long waitStart = millis();
    while (millis() - waitStart < 10000) {
      delay(1000);
      feedWatchdog();
      initialCsq = modem.getSignalQuality();
      if (initialCsq != 99) {
        LOG_I("MODEM", String(F("Signal récupéré: ")) + initialCsq + F(" (") + csqToRssi(initialCsq) + F(" dBm)"));
        break;
      }
    }

    if (initialCsq == 99) {
      LOG_W("MODEM", "Signal toujours invalide - Réinitialisation modem...");
      modem.restart();
      // Attendre après reset
      unsigned long resetWaitStart = millis();
      while (millis() - resetWaitStart < 10000) {
        delay(1000);
        feedWatchdog();
        initialCsq = modem.getSignalQuality();
        if (initialCsq != 99) {
          LOG_I("MODEM", String(F("Signal récupéré après reset: ")) + initialCsq + F(" (") + csqToRssi(initialCsq) + F(" dBm)"));
          break;
        }
      }

      if (initialCsq == 99) {
        LOG_W("MODEM", "Signal toujours invalide après reset - Continuation");
        logRadioSnapshot("attach:csq_warn");
      }
    }
  } else {
    LOG_D("MODEM", String(F("Signal initial OK: ")) + initialCsq + F(" (") + csqToRssi(initialCsq) + F(" dBm)"));
  }

  while (millis() - start < timeoutMs && retryCount < maxRetries) {
    feedWatchdog();

    // Vérifier si déjà connecté
    if (modem.isNetworkConnected()) {
      logRadioSnapshot("attach:success");
      return true;
    }

    // Vérifier CSQ avant chaque tentative
    int8_t csq = modem.getSignalQuality();
    if (csq == 99 && retryCount >= 2) {
      Serial.println(F("[MODEM] ⚠️ Signal invalide persistant après 2 tentatives - Réinitialisation du modem..."));
      modem.restart();
      delay(5000);
      csq = modem.getSignalQuality();
      if (csq == 99) {
        Serial.println(F("[MODEM] ❌ Signal toujours invalide après réinitialisation"));
        logRadioSnapshot("attach:csq_fail");
        return false;
      }
    }

    // Obtenir le statut d'enregistrement
    RegStatus reg = modem.getRegistrationStatus();

    // Si REG_DENIED, essayer avec un APN alternatif (fallback uniquement si l'APN n'a pas été détecté dans startModem)
    // Normalement, l'APN devrait déjà être correct grâce à la détection dans startModem()
    // Ce fallback n'est qu'une sécurité supplémentaire
    // CRITIQUE: Ne pas corriger si APN configuré manuellement (apnManual = true)
    if (reg == REG_DENIED && retryCount == 0 && !apnManual) {
      // CRITIQUE: Détecter la carte SIM réelle pour utiliser son APN
      String simOperator2 = detectSimOperatorFromIccid(DEVICE_ICCID);
      String oper2 = modem.getOperator();

      // Si l'ICCID ne permet pas de détecter, utiliser l'opérateur détecté
      if (simOperator2.length() == 0 && oper2.length() > 0) {
        if (oper2.indexOf("20815") >= 0 || oper2.indexOf("20816") >= 0) {
          simOperator2 = oper2;
        } else if (oper2.indexOf("20801") >= 0 || oper2.indexOf("20802") >= 0) {
          simOperator2 = oper2;
        }
      }

      if (simOperator2.length() > 0) {
        String simOperatorName2 = getOperatorName(simOperator2);
        String simApn = getRecommendedApnForOperator(simOperator2);

        if (simApn.length() > 0 && simApn != apnToUse) {
          String currentOperatorName2 = oper2.length() > 0 ? getOperatorName(oper2) : "inconnu";
          if (oper2 != simOperator2 && oper2.length() > 0) {
            Serial.printf("[MODEM] ⚠️  Accès refusé par le réseau - ROAMING détecté: Carte %s sur réseau %s\n",
                          simOperatorName2.c_str(), currentOperatorName2.c_str());
            Serial.printf("[MODEM] ✅ Correction APN: %s → %s (APN de la carte SIM)\n",
                          apnToUse.c_str(), simApn.c_str());
          } else {
            Serial.printf("[MODEM] ⚠️  Accès refusé par le réseau - Correction APN: %s → %s (carte: %s)\n",
                          apnToUse.c_str(), simApn.c_str(), simOperatorName2.c_str());
          }
          if (setApn(simApn)) {
            apnToUse = simApn;
            Serial.printf("[MODEM] ✅ APN configuré: %s\n", apnToUse.c_str());
          }
          NETWORK_APN = apnToUse;
          Serial.printf("[MODEM] ✅ APN corrigé: %s\n", apnToUse.c_str());

          // Attendre que l'APN soit pris en compte
          unsigned long apnDelayStart = millis();
          while (millis() - apnDelayStart < 2000) {
            delay(100);
            feedWatchdog();
          }
          feedWatchdog();
          Serial.println(F("[MODEM] 🔄 Nouvelle tentative d'attachement avec APN corrigé..."));
        } else if (simApn.length() > 0) {
          // L'APN est déjà correct mais REG_DENIED quand même
          Serial.printf("[MODEM] ⚠️  Accès refusé par le réseau avec APN correct (%s) pour carte %s\n",
                        apnToUse.c_str(), simOperatorName2.c_str());
          Serial.println(F("[MODEM] 💡 Vérifier: Carte SIM activée pour les données? Forfait actif?"));
        }
      } else if (oper2.length() > 0) {
        // Carte SIM non détectée : utiliser l'APN de l'opérateur détecté
        String operatorName2 = getOperatorName(oper2);
        String recommendedApn = getRecommendedApnForOperator(oper2);
        if (recommendedApn.length() > 0 && recommendedApn != apnToUse) {
          Serial.printf("[MODEM] ⚠️  Accès refusé par le réseau - Correction APN: %s → %s (opérateur: %s)\n",
                        apnToUse.c_str(), recommendedApn.c_str(), operatorName2.c_str());
          Serial.println(F("[MODEM] 💡 L'APN devrait normalement être détecté avant l'attachement"));
          if (setApn(recommendedApn)) {
            apnToUse = recommendedApn;
            Serial.printf("[MODEM] ✅ APN configuré: %s\n", apnToUse.c_str());
          }
          NETWORK_APN = apnToUse;
          Serial.printf("[MODEM] ✅ APN corrigé: %s\n", apnToUse.c_str());

          // Attendre que l'APN soit pris en compte
          unsigned long apnDelayStart = millis();
          while (millis() - apnDelayStart < 2000) {
            delay(100);
            feedWatchdog();
          }
          feedWatchdog();
          Serial.println(F("[MODEM] 🔄 Nouvelle tentative d'attachement avec APN corrigé..."));
        } else if (recommendedApn.length() > 0) {
          // L'APN est déjà correct mais REG_DENIED quand même
          Serial.printf("[MODEM] ⚠️  Accès refusé par le réseau avec APN correct (%s) pour %s\n",
                        apnToUse.c_str(), operatorName2.c_str());
          Serial.println(F("[MODEM] 💡 Vérifier: SIM activée pour données? Forfait actif?"));
        }
      }
    } else if (reg == REG_DENIED && retryCount == 0 && apnManual) {
      // APN configuré manuellement - ne pas corriger automatiquement
      Serial.println(F("[MODEM] 🔒 APN manuel activé - Correction automatique désactivée"));
      Serial.printf("[MODEM] ⚠️  Accès refusé par le réseau avec APN manuel: \"%s\"\n", apnToUse.c_str());
      Serial.println(F("[MODEM] 💡 Si l'APN est incorrect, utiliser UPDATE_CONFIG pour le modifier"));
    }

    // Attendre l'enregistrement réseau avec feedWatchdog() régulier
    // Augmenter le timeout à 60 secondes pour laisser plus de temps
    unsigned long networkWaitStart = millis();
    bool networkAttached = false;
    uint8_t checkCount = 0;
    while (millis() - networkWaitStart < 60000 && !networkAttached) {
      feedWatchdog();

      // Vérifier d'abord le statut d'enregistrement (plus fiable que waitForNetwork)
      RegStatus reg = modem.getRegistrationStatus();

      // Vérifier si l'itinérance est autorisée
      if (reg == REG_OK_ROAMING && !roamingEnabled) {
        Serial.println(F("[MODEM] ⚠️  Itinérance détectée mais désactivée - Rejet de la connexion"));
        Serial.println(F("[MODEM] 💡 Activez l'itinérance dans la configuration pour autoriser le roaming"));
        logRadioSnapshot("attach:roaming_rejected");
        // Continuer à attendre une connexion sur le réseau de l'opérateur (REG_OK_HOME)
        delay(2000);
        feedWatchdog();
        continue;
      }

      if (reg == REG_OK_HOME || (reg == REG_OK_ROAMING && roamingEnabled)) {
        // Attendre un peu pour que la connexion se stabilise
        delay(1000);
        feedWatchdog();

        // Vérifier que isNetworkConnected() confirme
        if (modem.isNetworkConnected()) {
          networkAttached = true;
          logRadioSnapshot("attach:success");
          String oper = modem.getOperator();
          String operatorName = getOperatorName(oper);

          // Vérifier l'état GPRS et EPS
          bool gprsOk = modem.isGprsConnected();
          bool epsOk = false;
          String epsStatus = "N/A";
          checkEpsStatus(epsOk, epsStatus);

          Serial.printf("[MODEM] ✅ Réseau attaché avec succès (opérateur: %s, APN: %s)\n",
                        operatorName.c_str(), apnToUse.c_str());

          // Connecter les données mobiles après attachement réseau réussi
          if (!gprsOk) {
            Serial.println(F("[MODEM] 📡 Connexion des données mobiles en cours..."));
            if (connectData(30000)) {
              Serial.println(F("[MODEM] ✅ Données mobiles connectées"));
            } else {
              Serial.println(F("[MODEM] ⚠️ Attachement réseau OK mais données mobiles non connectées"));
            }
          }

          // Vérifier l'état final
          gprsOk = modem.isGprsConnected();
          checkEpsStatus(epsOk, epsStatus);
          Serial.printf("[MODEM] 📊 État final: Données mobiles=%s | 4G/LTE=%s\n",
                        gprsOk ? "Connectées" : "Non connectées", epsStatus.c_str());
          Serial.println(F("[MODEM] ✅ Prêt pour envoi de données à la base de données"));

          // Sauvegarder l'APN et l'opérateur détectés pour réutilisation au prochain réveil
          saveNetworkParams(oper, apnToUse);
          return true;
        } else {
          // Statut OK mais isNetworkConnected() retourne false - attendre un peu plus
          Serial.println(F("[MODEM] ⏳ Statut OK mais connexion en cours de stabilisation..."));
          delay(2000);
          feedWatchdog();
          if (modem.isNetworkConnected()) {
            networkAttached = true;
            logRadioSnapshot("attach:success");
            String oper = modem.getOperator();
            String operatorName = getOperatorName(oper);

            // Vérifier l'état GPRS et EPS
            bool gprsOk = modem.isGprsConnected();
            bool epsOk = false;
            String epsStatus = "N/A";
            checkEpsStatus(epsOk, epsStatus);

            Serial.printf("[MODEM] ✅ Réseau attaché après stabilisation (opérateur: %s, APN: %s)\n",
                          operatorName.c_str(), apnToUse.c_str());

            // Connecter les données mobiles après attachement réseau réussi
            if (!gprsOk) {
              Serial.println(F("[MODEM] 📡 Connexion des données mobiles en cours..."));
              if (connectData(30000)) {
                Serial.println(F("[MODEM] ✅ Données mobiles connectées"));
              } else {
                Serial.println(F("[MODEM] ⚠️ Attachement réseau OK mais données mobiles non connectées"));
              }
            }

            // Vérifier l'état final
            gprsOk = modem.isGprsConnected();
            checkEpsStatus(epsOk, epsStatus);
            Serial.printf("[MODEM] 📊 État final: Données mobiles=%s | 4G/LTE=%s\n",
                          gprsOk ? "Connectées" : "Non connectées", epsStatus.c_str());
            Serial.println(F("[MODEM] ✅ Prêt pour envoi de données à la base de données"));

            // Sauvegarder l'APN et l'opérateur détectés pour réutilisation au prochain réveil
            saveNetworkParams(oper, apnToUse);
            return true;
          }
        }
      }

      // Essayer aussi waitForNetwork avec un timeout plus long
      if (checkCount % 5 == 0) {           // Toutes les 5 itérations (environ toutes les 2.5 secondes)
        if (modem.waitForNetwork(5000)) {  // Timeout de 5 secondes au lieu de 2
          networkAttached = true;
          logRadioSnapshot("attach:event");
          String oper = modem.getOperator();
          String operatorName = getOperatorName(oper);

          // Vérifier l'état GPRS et EPS
          bool gprsOk = modem.isGprsConnected();
          bool epsOk = false;
          String epsStatus = "N/A";
          checkEpsStatus(epsOk, epsStatus);

          Serial.printf("[MODEM] ✅ Réseau attaché avec succès (waitForNetwork) - opérateur: %s, APN: %s\n",
                        operatorName.c_str(), apnToUse.c_str());

          // Connecter les données mobiles après attachement réseau réussi
          if (!gprsOk) {
            Serial.println(F("[MODEM] 📡 Connexion des données mobiles en cours..."));
            if (connectData(30000)) {
              Serial.println(F("[MODEM] ✅ Données mobiles connectées"));
            } else {
              Serial.println(F("[MODEM] ⚠️ Attachement réseau OK mais données mobiles non connectées"));
            }
          }

          // Vérifier l'état final
          gprsOk = modem.isGprsConnected();
          checkEpsStatus(epsOk, epsStatus);
          Serial.printf("[MODEM] 📊 État final: Données mobiles=%s | 4G/LTE=%s\n",
                        gprsOk ? "Connectées" : "Non connectées", epsStatus.c_str());

          // Sauvegarder l'APN et l'opérateur détectés
          saveNetworkParams(oper, apnToUse);
          return true;
        }
      }

      // Vérifier directement isNetworkConnected() périodiquement
      if (checkCount % 3 == 0 && modem.isNetworkConnected()) {
        networkAttached = true;
        logRadioSnapshot("attach:direct");
        String oper = modem.getOperator();
        String operatorName = getOperatorName(oper);

        // Vérifier l'état GPRS et EPS
        bool gprsOk = modem.isGprsConnected();
        bool epsOk = false;
        String epsStatus = "N/A";
        checkEpsStatus(epsOk, epsStatus);

        Serial.printf("[MODEM] ✅ Réseau attaché (vérification directe) - opérateur: %s, APN: %s\n",
                      operatorName.c_str(), apnToUse.c_str());

        // Connecter les données mobiles après attachement réseau réussi
        if (!gprsOk) {
          Serial.println(F("[MODEM] 📡 Connexion des données mobiles en cours..."));
          if (connectData(30000)) {
            Serial.println(F("[MODEM] ✅ Données mobiles connectées"));
          } else {
            Serial.println(F("[MODEM] ⚠️ Attachement réseau OK mais données mobiles non connectées"));
          }
        }

        // Vérifier l'état final
        gprsOk = modem.isGprsConnected();
        checkEpsStatus(epsOk, epsStatus);
        Serial.printf("[MODEM] 📊 État final: Données mobiles=%s | 4G/LTE=%s\n",
                      gprsOk ? "Connectées" : "Non connectées", epsStatus.c_str());

        // Sauvegarder l'APN et l'opérateur détectés
        saveNetworkParams(oper, apnToUse);
        return true;
      }

      checkCount++;
      delay(500);  // Attendre 500ms entre les vérifications
      feedWatchdog();
    }

    // Log du statut actuel
    Serial.printf("[MODEM] attente réseau... (tentative %d/%d)\n", retryCount + 1, maxRetries);
    logRadioSnapshot("attach:retry");

    // Backoff exponentiel : délai augmente à chaque retry
    uint32_t delayMs = baseDelay * (1 << retryCount);  // 5s, 10s, 20s...
    if (delayMs > 30000) delayMs = 30000;              // Max 30 secondes
    Serial.printf("[MODEM] Attente %lu ms avant prochaine tentative...\n", delayMs);

    // Remplacer delay() long par boucle avec feedWatchdog() pour éviter timeout
    unsigned long delayStart = millis();
    while (millis() - delayStart < delayMs) {
      delay(100);      // Délai court
      feedWatchdog();  // Réinitialiser watchdog régulièrement
    }

    retryCount++;
    feedWatchdog();
  }

  logRadioSnapshot("attach:timeout");
  Serial.printf("[MODEM] ❌ Échec après %d tentatives\n", retryCount);
  return false;
}

/**
 * Attache le réseau (fonction originale, maintenant utilise attachNetworkWithRetry)
 */
bool attachNetwork(uint32_t timeoutMs) {
  return attachNetworkWithRetry(timeoutMs, 3);
}

bool connectData(uint32_t timeoutMs) {
  unsigned long start = millis();
  Serial.println(F("[MODEM] connexion data"));
  logRadioSnapshot("data:start");

  // HIÉRARCHIE DES APN À ESSAYER:
  // 1. APN configuré (manuellement via USB/OTA ou automatiquement détecté) - PRIORITAIRE
  // 2. APN recommandé selon opérateur détecté (seulement si apnManual = false)
  // 3. APN générique "internet" (seulement si apnManual = false)

  String apnList[3];
  uint8_t maxApnAttempts = 0;

  // TOUJOURS essayer l'APN configuré en premier
  // CRITIQUE: Vérifier que NETWORK_APN n'est pas vide (protection contre corruption)
  if (NETWORK_APN.length() > 0) {
    apnList[0] = NETWORK_APN;
    maxApnAttempts = 1;
  } else {
    // APN vide → utiliser valeur par défaut
    Serial.println(F("[MODEM] ⚠️ NETWORK_APN vide → Utilisation valeur par défaut"));
    apnList[0] = String(F(OTT_DEFAULT_APN));
    maxApnAttempts = 1;
    NETWORK_APN = apnList[0];  // Corriger NETWORK_APN pour éviter répétition
  }

  // Si APN configuré manuellement, NE PAS essayer d'autres APN
  if (apnManual) {
    Serial.printf("[MODEM] 🔒 APN manuel: \"%s\" - utilisation exclusive (pas de fallback)\n", NETWORK_APN.c_str());
  } else {
    // APN non manuel : ajouter des fallbacks
    String oper = modem.getOperator();
    if (oper.length() > 0) {
      String recommendedApn = getRecommendedApnForOperator(oper);
      if (recommendedApn.length() > 0 && recommendedApn != NETWORK_APN) {
        apnList[1] = recommendedApn;
        maxApnAttempts = 2;
      }
    }
    // Fallback générique en dernier recours
    apnList[2] = F("internet");
    if (maxApnAttempts < 3) {
      maxApnAttempts = 3;
    }
  }

  uint8_t apnIndex = 0;

  while (millis() - start < timeoutMs && apnIndex < maxApnAttempts) {
    feedWatchdog();

    if (modem.isGprsConnected()) {
      logRadioSnapshot("data:already");
      return true;
    }

    String currentApn = apnList[apnIndex];
    if (currentApn.length() == 0) {
      apnIndex++;
      continue;
    }

    Serial.printf("[MODEM] Tentative connexion GPRS avec APN: %s\n", currentApn.c_str());

    // Configurer l'APN avant de se connecter
    if (setApn(currentApn)) {
      Serial.printf("[MODEM] ✅ APN configuré: %s\n", currentApn.c_str());
    }
    delay(1000);
    feedWatchdog();

    if (modem.gprsConnect(currentApn.c_str(), "", "")) {
      logRadioSnapshot("data:connected");
      Serial.printf("[MODEM] ✅ Connexion GPRS réussie avec APN: %s\n", currentApn.c_str());

      // Vérifier l'état complet de la connexion
      // Remplacer delay() par boucle avec feedWatchdog()
      unsigned long stabilDelayStart = millis();
      while (millis() - stabilDelayStart < 2000) {
        delay(100);
        feedWatchdog();
      }

      // Vérifier l'état réseau (GPRS/GSM)
      bool networkOk = modem.isNetworkConnected();
      bool gprsOk = modem.isGprsConnected();

      // Vérifier l'état EPS (LTE) pour modem A7670G/SIM7600
      bool epsOk = false;
      String epsStatus = "N/A";
      checkEpsStatus(epsOk, epsStatus);

      // Vérifier aussi l'activation du contexte PDP
      bool pdpOk = false;
      modem.sendAT(GF("+CGACT?"));
      if (modem.waitResponse(2000, GF("+CGACT:")) == 1) {
        String res = modem.stream.readStringUntil('\n');
        res.trim();
        // Format: +CGACT: <state>,<cid>
        // state: 1=activated, 0=deactivated
        int state = res.substring(res.indexOf(':') + 1).toInt();
        pdpOk = (state == 1);
      }

      Serial.printf("[MODEM] 📊 État connexion: Réseau=%s | Données mobiles=%s | 4G/LTE=%s | Contexte données=%s\n",
                    networkOk ? "Connecté" : "Non connecté",
                    gprsOk ? "Connectées" : "Non connectées",
                    epsStatus.c_str(),
                    pdpOk ? "Actif" : "Inactif");

      if (networkOk && (gprsOk || epsOk) && pdpOk) {
        Serial.println(F("[MODEM] ✅ Prêt pour envoi de données"));
        String logMsg = String(F("Connexion réussie - GPRS:")) + String(gprsOk ? F("OK") : F("KO")) + String(F(" EPS:")) + epsStatus + String(F(" PDP:")) + String(pdpOk ? F("OK") : F("KO"));
        sendLog("INFO", logMsg + String(F(" APN: ")) + currentApn, "network");
      } else {
        Serial.println(F("[MODEM] ⚠️ Connexion mais état réseau incomplet"));
        String logMsg = String(F("Connexion partielle - GPRS:")) + String(gprsOk ? F("OK") : F("KO")) + String(F(" EPS:")) + epsStatus + String(F(" PDP:")) + String(pdpOk ? F("OK") : F("KO"));
        sendLog("WARN", logMsg, "network");
      }

      return true;
    }

    Serial.printf("[MODEM] ❌ Échec connexion GPRS avec APN: %s\n", currentApn.c_str());
    logRadioSnapshot("data:retry");

    // Essayer l'APN suivant après un délai
    apnIndex++;
    if (apnIndex < maxApnAttempts) {
      Serial.println(F("[MODEM] Essai avec APN suivant..."));
      // Remplacer delay() long par boucle avec feedWatchdog()
      unsigned long apnRetryDelayStart = millis();
      while (millis() - apnRetryDelayStart < 3000) {
        delay(100);
        feedWatchdog();
      }
    }
    feedWatchdog();
  }

  logRadioSnapshot("data:timeout");
  Serial.println(F("[MODEM] ❌ Échec connexion GPRS après toutes les tentatives"));
  return false;
}

// ----------------------------------------------------------------------------- //
// Mesures capteur                                                               //
// ----------------------------------------------------------------------------- //

/**
 * Conversion CSQ (0-31) vers dBm selon standard 3GPP TS 27.007
 * 
 * @param csq Valeur CSQ du modem (0-31, 99 = non disponible)
 * @return RSSI en dBm (-113 à -51, -999 si non disponible)
 */
int8_t csqToRssi(int8_t csq) {
  if (csq == 99) {
    return -999;  // Non disponible
  } else if (csq == 0) {
    return -113;  // Signal très faible
  } else if (csq == 1) {
    return -111;  // Signal très faible
  } else {
    return -110 + (csq * 2);  // Formule standard 3GPP TS 27.007
  }
}

/**
 * Mesure la tension et le pourcentage de charge de la batterie 18650
 * 
 * CONFIGURATION MATÉRIELLE (LILYGO TTGO T-A7670G / T-SIM7600) :
 * ============================================================
 * La carte utilise un diviseur de tension sur GPIO35 pour mesurer la batterie.
 * 
 * Schéma du diviseur de tension :
 *   Battery(+) ---[R1: 100kΩ]---+---[R2: 100kΩ]--- GND
 *                               |
 *                            GPIO35 (ADC)
 * 
 * CALCUL DU DIVISEUR :
 * -------------------
 * Ratio = R2 / (R1 + R2) = 100kΩ / (100kΩ + 100kΩ) = 0.5
 * 
 * Cela signifie que la tension sur GPIO35 est exactement la moitié 
 * de la tension réelle de la batterie :
 *   V_adc = V_batterie × 0.5
 * 
 * Pour retrouver la tension batterie :
 *   V_batterie = V_adc × 2
 * 
 * PLAGE DE TENSION BATTERIE 18650 (Li-ion) :
 * ==========================================
 * - 4.2V = 100% (pleine charge)
 * - 3.7V = ~50% (tension nominale)
 * - 3.0V = 0% (décharge complète, ne pas descendre en dessous)
 * - 2.5V = seuil critique absolu (risque d'endommagement permanent)
 * 
 * EXEMPLE DE CALCUL :
 * ==================
 * Si l'ADC lit 1.87V :
 *   V_batterie = 1.87V × 2 = 3.74V
 *   Pourcentage = ((3.74V - 3.0V) / 1.2V) × 100% = 61.7%
 * 
 * @return float Pourcentage de charge de la batterie (0-100%)
 */
float measureBattery() {
  // Lecture brute de l'ADC (0-4095 pour 0-3.3V sur ESP32)
  int raw = analogRead(BATTERY_ADC_PIN);

  // Conversion ADC vers tension mesurée sur GPIO35
  // ADC 12-bit : 0-4095 correspond à 0-3.3V
  float adcVoltage = (raw / 4095.0f) * 3.3f;

  // Application du diviseur de tension (ratio 2:1)
  // La tension réelle de la batterie est le double de la tension ADC
  float batteryVoltage = adcVoltage * 2.0f;

  // Conversion tension → pourcentage pour batterie 18650 (Li-ion)
  // Plage : 3.0V (0%) à 4.2V (100%)
  const float MIN_VOLTAGE = 3.0f;                         // Tension minimale sûre
  const float MAX_VOLTAGE = 4.2f;                         // Tension maximale (pleine charge)
  const float VOLTAGE_RANGE = MAX_VOLTAGE - MIN_VOLTAGE;  // 1.2V

  float pct = ((batteryVoltage - MIN_VOLTAGE) / VOLTAGE_RANGE) * 100.0f;

  // Limiter à 0-100% (sécurité)
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;

  // Log concis et lisible
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[SENSOR] Batterie ADC=%d | V_adc=%.3fV | V_batt=%.3fV | Charge=%.1f%%\n",
                timeStr.c_str(), raw, adcVoltage, batteryVoltage, pct);

  // Avertissement si batterie faible (seulement si nécessaire)
  if (batteryVoltage < 3.2f) {
    Serial.printf("%s[SENSOR] ⚠️  BATTERIE FAIBLE !\n", timeStr.c_str());
  }

  return pct;
}

float measureAirflowRaw() {
  float total = 0;
  uint16_t passes = std::max<uint16_t>(static_cast<uint16_t>(1), airflowPasses);
  uint16_t samples = std::max<uint16_t>(static_cast<uint16_t>(1), airflowSamplesPerPass);
  uint32_t totalSamples = static_cast<uint32_t>(passes) * static_cast<uint32_t>(samples);

  // Afficher les paramètres seulement la première fois ou si changés (réduire verbosité)
  static uint16_t lastPasses = 0;
  static uint16_t lastSamples = 0;
  static uint16_t lastDelay = 0;
  static unsigned long lastConfigLog = 0;

  bool configChanged = (lastPasses != passes || lastSamples != samples || lastDelay != airflowSampleDelayMs);
  bool shouldLogConfig = configChanged || (millis() - lastConfigLog > 60000);  // Log toutes les 60s max

  if (shouldLogConfig) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[SENSOR] Airflow passes=%u samples/passe=%u delay=%ums\n",
                  timeStr.c_str(), passes, samples, airflowSampleDelayMs);
    lastPasses = passes;
    lastSamples = samples;
    lastDelay = airflowSampleDelayMs;
    lastConfigLog = millis();
  }

  for (uint16_t ii = 0; ii < passes; ++ii) {
    feedWatchdog();
    for (uint16_t i = 0; i < samples; ++i) {
      total += analogRead(SENSOR_PIN);
      delay(airflowSampleDelayMs);
      feedWatchdog();
    }
  }
  float rawValue = totalSamples > 0 ? total / static_cast<float>(totalSamples) : 0.0f;
  Serial.printf("%s[SENSOR] Airflow raw=%.1f\n", formatTimeFromMillis(millis()).c_str(), rawValue);
  return totalSamples > 0 ? total / static_cast<float>(totalSamples) : 0.0f;
}

float airflowToLpm(float airflow) {
  if (!isnan(CAL_OVERRIDE_A0) && !isnan(CAL_OVERRIDE_A1) && !isnan(CAL_OVERRIDE_A2)) {
    return max(0.0f, CAL_OVERRIDE_A2 * airflow * airflow + CAL_OVERRIDE_A1 * airflow + CAL_OVERRIDE_A0);
  }

  float x_values[] = { 1762, 1795, 1890, 1980, 2160, 2380 };
  float y_values[] = { 0, 1, 2, 3, 4, 5 };
  const int n = 6;

  float Sx0 = n, Sx1 = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0;
  float Sy = 0, Sxy = 0, Sx2y = 0;
  for (int i = 0; i < n; ++i) {
    float x = x_values[i];
    float y = y_values[i];
    float x2 = x * x;
    Sx1 += x;
    Sx2 += x2;
    Sx3 += x2 * x;
    Sx4 += x2 * x2;
    Sy += y;
    Sxy += x * y;
    Sx2y += x2 * y;
  }
  float det = Sx0 * (Sx2 * Sx4 - Sx3 * Sx3) - Sx1 * (Sx1 * Sx4 - Sx3 * Sx2) + Sx2 * (Sx1 * Sx3 - Sx2 * Sx2);
  float inv00 = (Sx2 * Sx4 - Sx3 * Sx3) / det;
  float inv01 = -(Sx1 * Sx4 - Sx3 * Sx2) / det;
  float inv02 = (Sx1 * Sx3 - Sx2 * Sx2) / det;
  float inv10 = inv01;
  float inv11 = (Sx0 * Sx4 - Sx2 * Sx2) / det;
  float inv12 = -(Sx0 * Sx3 - Sx2 * Sx1) / det;
  float inv20 = inv02;
  float inv21 = inv12;
  float inv22 = (Sx0 * Sx2 - Sx1 * Sx1) / det;

  float a0 = inv00 * Sy + inv01 * Sxy + inv02 * Sx2y;
  float a1 = inv10 * Sy + inv11 * Sxy + inv12 * Sx2y;
  float a2 = inv20 * Sy + inv21 * Sxy + inv22 * Sx2y;
  return max(0.0f, a2 * airflow * airflow + a1 * airflow + a0);
}

// ----------------------------------------------------------------------------- //
// HTTP helpers                                                                  //
// ----------------------------------------------------------------------------- //

String buildPath(const char* path) {
  // OPTIMISATION RAM: API_PREFIX est déjà une constante, pas besoin de F()
  return String(API_PREFIX) + path;
}

// Construire l'en-tête d'authentification HTTP (pour compatibilité future)
// ============================================================================
// AUTHENTIFICATION API
// ============================================================================
// L'API identifie les dispositifs par sim_iccid UNIQUEMENT (pas de JWT requis).
// L'ICCID est un identifiant unique de 20 chiffres fourni par l'opérateur télécom,
// cryptographiquement sécurisé et difficile à falsifier.
// Cette fonction est conservée pour compatibilité future si besoin d'ajouter un token.
String buildAuthHeader() {
  // OPTIMISATION RAM: Retourner String vide sans allocation
  return String();  // Pas d'authentification JWT pour les mesures (ICCID suffit)
}

bool httpPost(const char* path, const String& body, String* response) {
  HttpClient http(netClient, API_HOST, API_PORT);
  http.beginRequest();
  http.post(buildPath(path));
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("X-Device-ICCID", DEVICE_ICCID);
  String auth = buildAuthHeader();
  if (auth.length()) {
    http.sendHeader("Authorization", auth);
  }
  // Note: Pas de JWT requis - authentification par ICCID uniquement
  http.sendHeader("Content-Length", body.length());
  http.beginBody();
  http.print(body);
  http.endRequest();

  int status = http.responseStatusCode();
  String respBody = http.responseBody();
  if (response) {
    *response = respBody;
  }

  // Afficher le status code et la réponse pour debug
  Serial.printf("[HTTP] POST %s → Status: %d\n", path, status);
  if (status < 200 || status >= 300) {
    Serial.printf("[HTTP] ❌ Erreur HTTP %d\n", status);
    if (respBody.length() > 0 && respBody.length() < 200) {
      Serial.printf("[HTTP] Réponse erreur: %s\n", respBody.c_str());
    }
  } else {
    Serial.printf("[HTTP] ✅ Succès HTTP %d\n", status);
    if (respBody.length() > 0 && respBody.length() < 100) {
      Serial.printf("[HTTP] Réponse: %s\n", respBody.c_str());
    }
  }

  return status >= 200 && status < 300;
}

bool httpGet(const char* path, String* response) {
  HttpClient http(netClient, API_HOST, API_PORT);
  http.beginRequest();
  http.get(buildPath(path));
  http.sendHeader("X-Device-ICCID", DEVICE_ICCID);
  String auth = buildAuthHeader();
  if (auth.length()) {
    http.sendHeader("Authorization", auth);
  }
  http.endRequest();

  int status = http.responseStatusCode();
  String respBody = http.responseBody();
  if (response) {
    *response = respBody;
  }
  return status >= 200 && status < 300;
}

// ----------------------------------------------------------------------------- //
// API logic                                                                     //
// ----------------------------------------------------------------------------- //

bool sendMeasurement(const Measurement& m, float* latitude, float* longitude, const char* status) {
  // Vérifier que le modem est prêt et connecté
  if (!modemReady) {
    Serial.println(F("[API] ❌ Modem non prêt - impossible d'envoyer"));
    return false;
  }

  if (!modem.isNetworkConnected()) {
    Serial.println(F("[API] ❌ Réseau non attaché - impossible d'envoyer"));
    return false;
  }

  if (!modem.isGprsConnected()) {
    Serial.println(F("[API] ❌ GPRS non connecté - impossible d'envoyer"));
    return false;
  }

  // Format unifié uniquement
  DynamicJsonDocument doc(1024);

  // Mode et type
  doc["mode"] = status;  // BOOT, EVENT, TIMER, USB_STREAM
  doc["type"] = "ota_measurement";
  doc["status"] = status;

  // Identifiants
  doc["sim_iccid"] = DEVICE_ICCID;
  doc["device_serial"] = DEVICE_SERIAL;
  doc["firmware_version"] = FIRMWARE_VERSION;

  Serial.printf("[API] 📤 ICCID: %s | Serial: %s | FW: %s\n",
                DEVICE_ICCID.substring(0, 10).c_str(),
                DEVICE_SERIAL.c_str(),
                FIRMWARE_VERSION);

  // Calculer device_name (fonction utilitaire pour éviter duplication)
  doc["device_name"] = buildDeviceName();

  // Mesures principales (format unifié uniquement)
  doc["flow_lpm"] = m.flow;
  doc["battery_percent"] = m.battery;
  doc["rssi"] = m.rssi;

  // Position GPS/réseau cellulaire (validation avec fonction utilitaire)
  if (latitude != nullptr && longitude != nullptr && isValidGpsCoordinates(*latitude, *longitude)) {
    doc["latitude"] = *latitude;
    doc["longitude"] = *longitude;
    Serial.printf("[API] 📍 Coordonnées GPS incluses: %.6f, %.6f\n", *latitude, *longitude);
  } else {
    // GPS non disponible ou coordonnées invalides - ce n'est PAS bloquant
    if (latitude != nullptr && longitude != nullptr) {
      Serial.println(F("[API] ⚠️  Coordonnées GPS invalides - non incluses (non bloquant)"));
    } else {
      Serial.println(F("[API] ℹ️  GPS non disponible - mesure envoyée sans coordonnées (non bloquant)"));
    }
  }

  // Configuration actuelle
  doc["sleep_minutes"] = configuredSleepMinutes;
  doc["measurement_duration_ms"] = airflowSampleDelayMs;

  // Coefficients de calibration
  JsonArray calArray = doc.createNestedArray("calibration_coefficients");
  float a0 = isnan(CAL_OVERRIDE_A0) ? 0.0f : CAL_OVERRIDE_A0;
  float a1 = isnan(CAL_OVERRIDE_A1) ? 1.0f : CAL_OVERRIDE_A1;
  float a2 = isnan(CAL_OVERRIDE_A2) ? 0.0f : CAL_OVERRIDE_A2;
  calArray.add(a0);
  calArray.add(a1);
  calArray.add(a2);

  // Paramètres de mesure
  doc["airflow_passes"] = airflowPasses;
  doc["airflow_samples_per_pass"] = airflowSamplesPerPass;
  doc["airflow_delay_ms"] = airflowSampleDelayMs;

  // Timestamp (millis depuis boot, utile pour debug)
  doc["timestamp_ms"] = millis();

  String body;
  serializeJson(doc, body);

  // Authentification par ICCID uniquement (pas de JWT requis pour /measurements)
  Serial.println(F("[API] ℹ️ Authentification par ICCID"));
  Serial.printf("[API] 📤 URL: https://%s:%d%s%s\n", API_HOST, API_PORT, API_PREFIX, PATH_MEASURE);
  Serial.printf("[API] 📦 Taille payload: %d octets\n", body.length());

  String apiResponse;
  bool ok = httpPost(PATH_MEASURE, body, &apiResponse);

  // Afficher le résultat détaillé via USB
  if (ok) {
    Serial.printf("[API] ✅ Mesure reçue par la base de données avec succès\n");
    if (apiResponse.length() > 0) {
      Serial.printf("[API] Réponse base de données: %s\n", apiResponse.c_str());
    }
    Serial.printf("[API] 📊 Données enregistrées: Débit=%.2f L/min | Batterie=%.0f%% | RSSI=%d dBm", m.flow, m.battery, m.rssi);
    if (latitude != nullptr && longitude != nullptr && *latitude != 0.0 && *longitude != 0.0) {
      Serial.printf(" | GPS=%.6f,%.6f", *latitude, *longitude);
    }
    Serial.println();
    Serial.println(F("[MODEM] ✅ Envoi des données effectué !"));
    sendLog("INFO", "Measurement posted successfully", "measurements");
  } else {
    Serial.printf("[API] ❌ Échec envoi mesure à la base de données\n");
    if (apiResponse.length() > 0) {
      Serial.printf("[API] Erreur base de données: %s\n", apiResponse.c_str());
      // Limiter la taille du message de log
      String errorMsg = apiResponse;
      if (errorMsg.length() > 200) {
        errorMsg = errorMsg.substring(0, 200) + "...";
      }
      sendLog("ERROR", String(F("Measurement failed: ")) + errorMsg, "measurements");
    } else {
      Serial.println(F("[API] ⚠️ Pas de réponse de la base de données"));
      sendLog("ERROR", "Measurement failed: pas de réponse API", "measurements");
    }
  }

  return ok;
}

// ============================================================================
// FONCTION FACTORISÉE POUR ENVOI DE MESURES (évite duplication de code)
// ============================================================================
bool sendMeasurementWithContext(const char* context) {
  Measurement m = captureSensorSnapshot();

  // RSSI
  int8_t csq = modem.getSignalQuality();
  m.rssi = csqToRssi(csq);

  // GPS (si activé)
  float lat = 0.0, lon = 0.0;
  bool hasLocation = false;
  if (gpsEnabled) {
    hasLocation = getDeviceLocationFast(&lat, &lon);
  }

  // Envoyer mesure
  bool sent = sendMeasurement(m, hasLocation ? &lat : nullptr, hasLocation ? &lon : nullptr, context);
  if (sent) {
    LOG_I("AUTO", String(F("Mesure envoyée: ")) + context);
    lastFlowValue = m.flow;
    lastMeasurementTime = millis();
  } else {
    LOG_W("AUTO", String(F("Échec envoi: ")) + context);
  }

  return sent;
}

int fetchCommands(Command* out, size_t maxCount) {
  if (maxCount == 0) return 0;
  String response;
  // OPTIMISATION RAM: Utiliser F() pour les chaînes constantes
  String path = String(F("/devices/")) + DEVICE_ICCID + F("/commands/pending?limit=") + String(maxCount);
  if (!httpGet(path.c_str(), &response)) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[API] ❌ Échec récupération commandes depuis la base de données\n", timeStr.c_str());
    sendLog("WARN", "GET commandes échoué", "commands");
    return 0;
  }

  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, response)) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[API] ❌ Réponse JSON invalide depuis la base de données\n", timeStr.c_str());
    sendLog("WARN", "JSON commandes invalide", "commands");
    return 0;
  }

  if (!doc["success"]) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[API] ⚠️ Réponse API sans succès\n", timeStr.c_str());
    sendLog("WARN", "Réponse commandes sans succès", "commands");
    return 0;
  }

  JsonArray arr = doc["commands"].as<JsonArray>();
  if (arr.isNull()) {
    return 0;
  }

  int count = 0;
  for (JsonVariant v : arr) {
    if (count >= (int)maxCount) break;
    Command& cmd = out[count++];
    cmd.id = v["id"] | 0;
    cmd.verb = v["command"].as<String>();
    if (!v["payload"].isNull()) {
      String payload;
      serializeJson(v["payload"], payload);
      cmd.payloadRaw = payload;
    } else {
      cmd.payloadRaw = "";
    }
  }

  if (count > 0) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[API] ✅ %d commande(s) récupérée(s) depuis la base de données\n", timeStr.c_str(), count);
  }

  return count;
}

bool acknowledgeCommand(const Command& cmd, bool success, const char* message) {
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[CMD] 📤 Envoi ACK à la base de données: ID=%d | Status=%s | Message=%s\n",
                timeStr.c_str(), cmd.id, success ? "executed" : "error", message);

  DynamicJsonDocument doc(256);
  doc["device_sim_iccid"] = DEVICE_ICCID;
  doc["command_id"] = cmd.id;
  doc["status"] = success ? "executed" : "error";
  doc["message"] = message;
  String body;
  serializeJson(doc, body);

  bool result = httpPost(PATH_ACK, body);
  if (result) {
    Serial.printf("%s[CMD] ✅ ACK envoyé avec succès à la base de données (ID=%d, Status=%s)\n",
                  timeStr.c_str(), cmd.id, success ? "executed" : "error");
  } else {
    Serial.printf("%s[CMD] ❌ Échec envoi ACK à la base de données (ID=%d) - Réessai au prochain cycle\n",
                  timeStr.c_str(), cmd.id);
  }
  return result;
}

bool sendLog(const char* level, const String& message, const char* type) {
  String lvl(level);
  String typeStr(type);
  if (modemReady && sendLogImmediate(lvl, message, typeStr)) {
    return true;
  }
  enqueueOfflineLog(lvl, typeStr, message);
  return false;
}

bool sendLogImmediate(const String& level, const String& message, const String& type) {
  DynamicJsonDocument doc(512);
  doc["device_sim_iccid"] = DEVICE_ICCID;
  doc["firmware_version"] = FIRMWARE_VERSION;
  JsonObject event = doc.createNestedObject("event");
  event["level"] = level;
  event["type"] = type;
  event["message"] = message;
  String body;
  serializeJson(doc, body);
  return httpPost(PATH_LOGS, body);
}

void enqueueOfflineLog(const String& level, const String& type, const String& message) {
  if (offlineLogs.size() >= MAX_OFFLINE_LOGS) {
    offlineLogs.erase(offlineLogs.begin());
  }
  offlineLogs.push_back(PendingLog{ level, type, message });
  saveOfflineLogs();
}

void flushOfflineLogs() {
  if (!modemReady || offlineLogs.empty()) return;
  size_t idx = 0;
  while (idx < offlineLogs.size()) {
    if (sendLogImmediate(offlineLogs[idx].level, offlineLogs[idx].message, offlineLogs[idx].type)) {
      offlineLogs.erase(offlineLogs.begin() + idx);
    } else {
      break;
    }
  }
  saveOfflineLogs();
}

void saveOfflineLogs() {
  size_t capacity = 256 + offlineLogs.size() * 128;
  DynamicJsonDocument doc(capacity);
  JsonArray arr = doc.to<JsonArray>();
  for (const auto& log : offlineLogs) {
    JsonObject obj = arr.createNestedObject();
    obj["lvl"] = log.level;
    obj["type"] = log.type;
    obj["msg"] = log.message;
  }
  String serialized;
  serializeJson(doc, serialized);
  if (prefs.begin("ott-fw", false)) {
    prefs.putString("offline_logs", serialized);
    prefs.end();
  }
}

void handleCommand(const Command& cmd, uint32_t& nextSleepMinutes) {
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[CMD] 📥 Commande reçue: %s (ID: %d)\n", timeStr.c_str(), cmd.verb.c_str(), cmd.id);

  DynamicJsonDocument payloadDoc(512);
  bool hasPayload = deserializePayload(cmd, payloadDoc);

  if (cmd.verb == "SET_SLEEP_SECONDS") {
    uint32_t requestedSeconds = hasPayload ? extractSleepSeconds(payloadDoc) : 0;
    uint32_t requestedMinutes = requestedSeconds > 0 ? requestedSeconds / 60 : 0;
    nextSleepMinutes = std::max<uint32_t>(static_cast<uint32_t>(1), requestedMinutes);
    Serial.printf("%s[CMD] ✅ SET_SLEEP_SECONDS: %d minutes\n", timeStr.c_str(), nextSleepMinutes);
    bool ackOk = acknowledgeCommand(cmd, true, "Sleep updated");
    Serial.printf("%s[CMD] 📤 ACK envoyé: %s\n", timeStr.c_str(), ackOk ? "✅ Succès" : "❌ Échec");
    sendLog("INFO", String(F("Sleep interval set to ")) + String(nextSleepMinutes) + F(" min"), "commands");
  } else if (cmd.verb == "PING") {
    Serial.printf("%s[CMD] ✅ PING reçu - Envoi pong...\n", timeStr.c_str());
    bool ackOk = acknowledgeCommand(cmd, true, "pong");
    Serial.printf("%s[CMD] 📤 ACK envoyé: %s\n", timeStr.c_str(), ackOk ? "✅ Succès" : "❌ Échec");
    sendLog("INFO", "PING command répondu", "commands");
  } else if (cmd.verb == "UPDATE_CONFIG") {
    if (!hasPayload) {
      acknowledgeCommand(cmd, false, "missing payload");
      sendLog("WARN", "UPDATE_CONFIG sans payload", "commands");
      return;
    }

    // Liste des champs modifiés pour affichage
    String updatedFields = "";

    if (payloadDoc.containsKey("apn")) {
      String newApn = payloadDoc["apn"].as<String>();
      // SÉCURITÉ: Valider et limiter la longueur de l'APN
      if (newApn.length() > 0 && newApn.length() <= 64) {
        String oldApn = NETWORK_APN;
        NETWORK_APN = sanitizeString(newApn, 64);
        apnManual = true;  // Marquer l'APN comme configuré manuellement
        if (updatedFields.length() > 0) updatedFields += ", ";
        updatedFields += String(F("APN: ")) + oldApn + F(" → ") + NETWORK_APN;
        Serial.printf("✅ [CMD] APN changé: %s → %s (configuré manuellement - ne sera pas écrasé par détection auto)\n", oldApn.c_str(), NETWORK_APN.c_str());
      }
    }
    // Note : Le champ "jwt" est ignoré. L'authentification se fait uniquement par sim_iccid.
    if (payloadDoc.containsKey("iccid")) {
      String newIccid = payloadDoc["iccid"].as<String>();
      // SÉCURITÉ: Valider longueur ICCID (20 chiffres max)
      if (newIccid.length() > 0 && newIccid.length() <= 20) {
        DEVICE_ICCID = sanitizeString(newIccid, 20);
      }
    }
    if (payloadDoc.containsKey("serial")) {
      String newSerial = payloadDoc["serial"].as<String>();
      // SÉCURITÉ: Valider format serial (OTT-XX-XXX ou OTT-YY-NNN, max 32 chars)
      if (newSerial.length() > 0 && newSerial.length() <= 32 && newSerial.startsWith("OTT-")) {
        DEVICE_SERIAL = sanitizeString(newSerial, 32);
      }
    }
    if (payloadDoc.containsKey("sim_pin")) {
      String newPin = payloadDoc["sim_pin"].as<String>();
      // SÉCURITÉ: Valider longueur PIN (4-8 chiffres généralement)
      if (newPin.length() >= 4 && newPin.length() <= 8) {
        SIM_PIN = sanitizeString(newPin, 8);
      }
    }
    if (payloadDoc.containsKey("sleep_minutes_default")) {
      configuredSleepMinutes = std::max<uint32_t>(static_cast<uint32_t>(1), payloadDoc["sleep_minutes_default"].as<uint32_t>());
    }
    // Support de "sleep_minutes" (format direct depuis USB)
    if (payloadDoc.containsKey("sleep_minutes")) {
      configuredSleepMinutes = std::max<uint32_t>(static_cast<uint32_t>(1), payloadDoc["sleep_minutes"].as<uint32_t>());
    }
    if (payloadDoc.containsKey("airflow_passes")) {
      airflowPasses = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["airflow_passes"].as<uint16_t>());
    }
    if (payloadDoc.containsKey("airflow_samples_per_pass")) {
      airflowSamplesPerPass = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["airflow_samples_per_pass"].as<uint16_t>());
    }
    if (payloadDoc.containsKey("airflow_delay_ms")) {
      airflowSampleDelayMs = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["airflow_delay_ms"].as<uint16_t>());
    }
    // Support de "measurement_duration_ms" (format direct depuis USB)
    if (payloadDoc.containsKey("measurement_duration_ms")) {
      airflowSampleDelayMs = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["measurement_duration_ms"].as<uint16_t>());
    }
    if (payloadDoc.containsKey("watchdog_seconds")) {
      configureWatchdog(payloadDoc["watchdog_seconds"].as<uint32_t>());
    }
    if (payloadDoc.containsKey("modem_boot_timeout_ms")) {
      modemBootTimeoutMs = payloadDoc["modem_boot_timeout_ms"].as<uint32_t>();
    }
    if (payloadDoc.containsKey("sim_ready_timeout_ms")) {
      simReadyTimeoutMs = payloadDoc["sim_ready_timeout_ms"].as<uint32_t>();
    }
    if (payloadDoc.containsKey("network_attach_timeout_ms")) {
      networkAttachTimeoutMs = payloadDoc["network_attach_timeout_ms"].as<uint32_t>();
    }
    if (payloadDoc.containsKey("modem_max_reboots")) {
      modemMaxReboots = std::max<uint8_t>(static_cast<uint8_t>(1), payloadDoc["modem_max_reboots"].as<uint8_t>());
    }
    if (payloadDoc.containsKey("gps_enabled")) {
      bool newGpsState = payloadDoc["gps_enabled"].as<bool>();
      if (newGpsState != gpsEnabled) {
        gpsEnabled = newGpsState;
        Serial.printf("✅ [CMD] GPS changé: %s → %s\n",
                      gpsEnabled ? "OFF" : "ON",
                      gpsEnabled ? "ON" : "OFF");

        // Activer/désactiver le GPS sur le modem si le modem est prêt
        if (modemReady) {
          if (gpsEnabled) {
            Serial.println(F("[GPS] Activation GPS sur le modem (via OTA)..."));
            if (modem.enableGPS()) {
              Serial.println(F("[GPS] ✅ GPS activé avec succès"));
              Serial.println(F("[GPS] ⏱️  Le premier fix peut prendre 30-60 secondes"));
              sendLog("INFO", "GPS activé via commande OTA");
            } else {
              Serial.println(F("[GPS] ❌ ÉCHEC activation GPS"));
              Serial.println(F("[GPS]   Vérifier: antenne GPS connectée, modem compatible"));
              sendLog("ERROR", "Échec activation GPS via commande OTA - vérifier antenne");
            }
          } else {
            Serial.println(F("[GPS] Désactivation GPS..."));
            modem.disableGPS();
            Serial.println(F("[GPS] ✅ GPS désactivé"));
            sendLog("INFO", "GPS désactivé via commande OTA");
          }
        } else {
          Serial.println(F("[GPS] ⚠️  Modem non prêt - GPS sera activé au prochain démarrage modem"));
          sendLog("WARN", "GPS activé mais modem non prêt - activation différée");
        }
      }
    }
    if (payloadDoc.containsKey("roaming_enabled")) {
      bool newRoamingState = payloadDoc["roaming_enabled"].as<bool>();
      if (newRoamingState != roamingEnabled) {
        roamingEnabled = newRoamingState;
        Serial.printf("✅ [CMD] Itinérance changée: %s → %s\n",
                      roamingEnabled ? "OFF" : "ON",
                      roamingEnabled ? "ON" : "OFF");
        if (roamingEnabled) {
          Serial.println(F("[MODEM] ✅ Itinérance activée - Le dispositif peut utiliser le réseau d'autres opérateurs"));
          sendLog("INFO", "Itinérance activée via commande OTA");
        } else {
          Serial.println(F("[MODEM] ⚠️  Itinérance désactivée - Seul le réseau de l'opérateur sera accepté"));
          Serial.println(F("[MODEM] 💡 Si le dispositif est en itinérance, il se déconnectera au prochain cycle"));
          sendLog("INFO", "Itinérance désactivée via commande OTA");
        }
      }
    }
    if (payloadDoc.containsKey("ota_primary_url")) {
      otaPrimaryUrl = payloadDoc["ota_primary_url"].as<String>();
    }
    if (payloadDoc.containsKey("ota_fallback_url")) {
      otaFallbackUrl = payloadDoc["ota_fallback_url"].as<String>();
    }
    if (payloadDoc.containsKey("ota_md5")) {
      otaExpectedMd5 = payloadDoc["ota_md5"].as<String>();
    }
    if (payloadDoc.containsKey("send_every_n_wakeups")) {
      uint8_t newValue = payloadDoc["send_every_n_wakeups"].as<uint8_t>();
      if (newValue >= 1 && newValue <= 255) {
        sendEveryNWakeups = newValue;
        wakeupCounter = 0;  // Réinitialiser le compteur lors du changement
        Serial.printf("✅ [CMD] send_every_n_wakeups changé: %d\n", sendEveryNWakeups);
      }
    }
    // Nouveau : Niveau de log configurable à distance (debug)
    if (payloadDoc.containsKey("log_level")) {
      String level = payloadDoc["log_level"].as<String>();
      level.toUpperCase();
      LogLevel oldLevel = currentLogLevel;
      if (level == "ERROR") {
        currentLogLevel = LOG_ERROR;
        Serial.println("✅ [CMD] Niveau de log changé: ERROR (erreurs critiques uniquement)");
      } else if (level == "WARN" || level == "WARNING") {
        currentLogLevel = LOG_WARN;
        Serial.println("✅ [CMD] Niveau de log changé: WARN (avertissements + erreurs)");
      } else if (level == "INFO") {
        currentLogLevel = LOG_INFO;
        Serial.println("✅ [CMD] Niveau de log changé: INFO (normal - défaut)");
      } else if (level == "DEBUG") {
        currentLogLevel = LOG_DEBUG;
        Serial.println("✅ [CMD] Niveau de log changé: DEBUG (verbeux - tous les logs)");
      } else {
        Serial.printf("⚠️ [CMD] Niveau de log invalide: %s (valeurs: ERROR, WARN, INFO, DEBUG)\n", level.c_str());
      }
      if (currentLogLevel != oldLevel) {
        sendLog("INFO", String(F("Log level changed: ")) + level, "commands");
      }
    }
    saveConfig();

    // Afficher un résumé de ce qui a été modifié
    Serial.println("═══════════════════════════════════════════════════════════");
    Serial.println("✅ [CMD] Configuration appliquée et sauvegardée en NVS");
    Serial.println("═══════════════════════════════════════════════════════════");
    if (updatedFields.length() > 0) {
      Serial.printf("📝 Champs modifiés: %s\n", updatedFields.c_str());
    } else {
      Serial.println("📝 Aucun champ modifié (valeurs identiques)");
    }
    Serial.printf("    • Serial: %s | ICCID: %s\n", DEVICE_SERIAL.c_str(), DEVICE_ICCID.substring(0, 10).c_str());
    Serial.printf("    • APN: %s | PIN: %s\n", NETWORK_APN.c_str(), SIM_PIN.length() > 0 ? "***" : "non configuré");
    Serial.printf("    • Sleep: %d min | GPS: %s | Roaming: %s | Envoi: tous les %d wakeup(s)\n",
                  configuredSleepMinutes, gpsEnabled ? "ON" : "OFF", roamingEnabled ? "ON" : "OFF", sendEveryNWakeups);
    Serial.println("═══════════════════════════════════════════════════════════");

    bool ackOk = acknowledgeCommand(cmd, true, "config updated");
    Serial.printf("%s[CMD] 📤 ACK envoyé: %s\n", timeStr.c_str(), ackOk ? "✅ Succès" : "❌ Échec");
    if (updatedFields.length() > 0) {
      sendLog("INFO", String(F("Configuration mise à jour: ")) + updatedFields, "commands");
    } else {
      sendLog("INFO", "Configuration vérifiée (aucun changement)", "commands");
    }
    Serial.println(F("[CMD] 🔄 Redémarrage du dispositif dans 2 secondes..."));
    // Remplacer delay() par boucle avec feedWatchdog() avant redémarrage
    unsigned long rebootDelayStart = millis();
    while (millis() - rebootDelayStart < 2000) {
      delay(100);
      feedWatchdog();
    }
    stopModem();
    esp_restart();
  } else if (cmd.verb == "RESET_CONFIG") {
    // Réinitialiser les paramètres aux valeurs par défaut
    Serial.println("═══════════════════════════════════════════════════════════");
    Serial.println(F("🔄 [CMD] RESET_CONFIG - Réinitialisation aux valeurs par défaut"));
    Serial.println("═══════════════════════════════════════════════════════════");

    // Sauvegarder les anciennes valeurs pour affichage
    String oldApn = NETWORK_APN;
    String oldPin = SIM_PIN;
    uint32_t oldSleep = configuredSleepMinutes;
    bool oldGps = gpsEnabled;
    bool oldRoaming = roamingEnabled;
    uint8_t oldSendEvery = sendEveryNWakeups;

    // Réinitialiser (vider les valeurs - seront reconfigurées par frontend via USB)
    // Plus de valeurs par défaut - la configuration complète doit être envoyée par le frontend
    NETWORK_APN = "";  // Vide - sera reconfiguré par frontend
    SIM_PIN = "";  // Vide - sera reconfiguré par frontend
    configuredSleepMinutes = 0;  // 0 = non configuré - sera reconfiguré par frontend
    gpsEnabled = false;
    roamingEnabled = true;  // Activé par défaut
    sendEveryNWakeups = 1;
    apnManual = false;       // Réinitialiser le flag d'APN manuel
    DETECTED_OPERATOR = "";  // Effacer l'opérateur détecté
    CAL_OVERRIDE_A0 = NAN;
    CAL_OVERRIDE_A1 = NAN;
    CAL_OVERRIDE_A2 = NAN;
    // Note: Serial et ICCID ne sont PAS réinitialisés (identifiants uniques)

    // Effacer les valeurs personnalisées dans NVS pour forcer les valeurs par défaut
    if (!prefs.begin("ott-fw", false)) {
      Serial.println(F("[CFG] ⚠️  Erreur ouverture prefs pour reset"));
    } else {
      // Effacer les clés de configuration (conserver Serial, ICCID, fw_version, etc.)
      prefs.remove("apn");
      prefs.remove("sim_pin");
      prefs.remove("sleep_min");
      prefs.remove("gps_enabled");
      prefs.remove("roaming_enabled");
      prefs.remove("send_n_wake");
      prefs.remove("apn_manual");
      prefs.remove("operator");
      prefs.remove("cal_a0");
      prefs.remove("cal_a1");
      prefs.remove("cal_a2");
      prefs.end();
    }

    // Sauvegarder les nouvelles valeurs par défaut
    saveConfig();

    Serial.printf("✅ [CMD] Paramètres réinitialisés:\n");
    Serial.printf("    • APN: %s → %s\n", oldApn.c_str(), NETWORK_APN.c_str());
    Serial.printf("    • PIN: %s → %s\n", oldPin.length() > 0 ? "***" : "vide", SIM_PIN.length() > 0 ? "***" : "vide");
    Serial.printf("    • Sleep: %lu → %lu min\n", oldSleep, configuredSleepMinutes);
    Serial.printf("    • GPS: %s → %s\n", oldGps ? "ON" : "OFF", gpsEnabled ? "ON" : "OFF");
    Serial.printf("    • Roaming: %s → %s\n", oldRoaming ? "ON" : "OFF", roamingEnabled ? "ON" : "OFF");
    Serial.printf("    • Send every: %d → %d wakeup(s)\n", oldSendEvery, sendEveryNWakeups);
    Serial.printf("    • APN manuel: désactivé\n");
    Serial.println("═══════════════════════════════════════════════════════════");

    bool ackOk = acknowledgeCommand(cmd, true, "config reset to defaults");
    Serial.printf("%s[CMD] 📤 ACK envoyé: %s\n", timeStr.c_str(), ackOk ? "✅ Succès" : "❌ Échec");
    sendLog("INFO", F("Configuration réinitialisée aux valeurs par défaut"), "commands");
  } else if (cmd.verb == "UPDATE_CALIBRATION") {
    if (!hasPayload) {
      acknowledgeCommand(cmd, false, "missing payload");
      sendLog("WARN", "UPDATE_CALIBRATION sans payload", "commands");
      return;
    }
    if (!payloadDoc.containsKey("a0") || !payloadDoc.containsKey("a1") || !payloadDoc.containsKey("a2")) {
      acknowledgeCommand(cmd, false, "missing coefficients");
      sendLog("WARN", "UPDATE_CALIBRATION coefficients manquants", "commands");
      return;
    }
    float a0 = payloadDoc["a0"].as<float>();
    float a1 = payloadDoc["a1"].as<float>();
    float a2 = payloadDoc["a2"].as<float>();
    Serial.printf("%s[CMD] ✅ UPDATE_CALIBRATION: a0=%.4f, a1=%.4f, a2=%.4f\n", timeStr.c_str(), a0, a1, a2);
    updateCalibration(a0, a1, a2);
    saveConfig();
    bool ackOk = acknowledgeCommand(cmd, true, "calibration updated");
    Serial.printf("%s[CMD] 📤 ACK envoyé: %s\n", timeStr.c_str(), ackOk ? "✅ Succès" : "❌ Échec");
    sendLog("INFO", "Calibration capteur mise à jour", "commands");
  } else if (cmd.verb == "OTA_REQUEST") {
    String channel = "primary";
    if (hasPayload && payloadDoc.containsKey("channel")) {
      channel = payloadDoc["channel"].as<String>();
      channel.toLowerCase();
    }
    String url;
    if (hasPayload && payloadDoc.containsKey("url")) {
      url = payloadDoc["url"].as<String>();
    } else if (channel == "fallback") {
      url = otaFallbackUrl;
    } else {
      url = otaPrimaryUrl;
    }
    String md5;
    if (hasPayload && payloadDoc.containsKey("md5")) {
      md5 = payloadDoc["md5"].as<String>();
    } else {
      md5 = otaExpectedMd5;
    }
    String expectedVersion;
    if (hasPayload && payloadDoc.containsKey("version")) {
      expectedVersion = payloadDoc["version"].as<String>();
    }
    if (url.isEmpty()) {
      acknowledgeCommand(cmd, false, "missing url");
      sendLog("WARN", "OTA_REQUEST sans URL", "ota");
      return;
    }

    // Sauvegarder la version actuelle comme version précédente avant OTA
    previousFirmwareVersion = currentFirmwareVersion;
    otaInProgress = true;
    saveConfig();

    String timeStr = formatTimeFromMillis(millis());
    Serial.println(F("═══════════════════════════════════════════════════════════"));
    Serial.printf("%s[OTA] 📨 COMMANDE OTA_REQUEST REÇUE DEPUIS LA BASE DE DONNÉES\n", timeStr.c_str());
    Serial.println(F("═══════════════════════════════════════════════════════════"));
    Serial.printf("%s[OTA]   URL: %s\n", timeStr.c_str(), url.c_str());
    if (expectedVersion.length() > 0) {
      Serial.printf("%s[OTA]   Version attendue: %s\n", timeStr.c_str(), expectedVersion.c_str());
    }
    if (md5.length() == 32) {
      Serial.printf("%s[OTA]   MD5: %s\n", timeStr.c_str(), md5.c_str());
    }
    Serial.printf("%s[OTA] 🚀 Démarrage de la mise à jour OTA...\n", timeStr.c_str());

    sendLog("INFO", String(F("OTA request: ")) + url + (expectedVersion.length() ? String(F(" (v")) + expectedVersion + F(")") : String(F(""))), "ota");
    bool otaOk = performOtaUpdate(url, md5, expectedVersion);
    bool ackOk = acknowledgeCommand(cmd, otaOk, otaOk ? "ota applied" : "ota failed");
    if (otaOk) {
      String finalTimeStr = formatTimeFromMillis(millis());
      Serial.println(F("═══════════════════════════════════════════════════════════"));
      Serial.printf("%s[OTA] ✅ MISE À JOUR OTA RÉUSSIE !\n", finalTimeStr.c_str());
      Serial.printf("%s[OTA] ✅ Commande correctement reçue et traitée par la base de données\n", finalTimeStr.c_str());
      Serial.printf("%s[OTA] ✅ ACK envoyé à la base de données: %s\n", finalTimeStr.c_str(), ackOk ? "SUCCÈS" : "ÉCHEC");
      Serial.printf("%s[OTA] 🔄 Redémarrage du dispositif...\n", finalTimeStr.c_str());
      Serial.println(F("═══════════════════════════════════════════════════════════"));
      sendLog("INFO", "OTA appliquée, reboot", "ota");
      stopModem();
      delay(250);
      esp_restart();
    } else {
      // En cas d'échec, restaurer l'état
      otaInProgress = false;
      saveConfig();
      acknowledgeCommand(cmd, false, "ota failed");
      sendLog("ERROR", "OTA échouée", "ota");
      String errorTimeStr = formatTimeFromMillis(millis());
      Serial.println(F("═══════════════════════════════════════════════════════════"));
      Serial.printf("%s[OTA] ❌ MISE À JOUR OTA ÉCHOUÉE !\n", errorTimeStr.c_str());
      Serial.printf("%s[OTA] ❌ Erreur lors du téléchargement ou de l'installation\n", errorTimeStr.c_str());
      Serial.printf("%s[OTA] ❌ ACK d'erreur envoyé à la base de données\n", errorTimeStr.c_str());
      Serial.printf("%s[OTA] ⚠️  Le dispositif continue avec la version actuelle\n", errorTimeStr.c_str());
      Serial.println(F("═══════════════════════════════════════════════════════════"));
    }
  } else if (cmd.verb == "GET_STATUS" || cmd.verb == "GET_CONFIG") {
    // Commande : récupérer l'état complet ET toute la configuration du dispositif
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[CMD] 📊 %s - Récupération configuration complète du dispositif...\n", timeStr.c_str(), cmd.verb.c_str());

    // Créer JSON avec état complet et TOUTE la configuration
    DynamicJsonDocument statusDoc(2048);  // Augmenté pour toute la config

    // Identifiants
    statusDoc["device_serial"] = DEVICE_SERIAL;
    statusDoc["sim_iccid"] = DEVICE_ICCID;
    statusDoc["firmware_version"] = FIRMWARE_VERSION;
    statusDoc["device_name"] = buildDeviceName();

    // Configuration complète (tous les paramètres stockés en NVS)
    statusDoc["sleep_minutes"] = configuredSleepMinutes;
    statusDoc["measurement_duration_ms"] = airflowSampleDelayMs;
    statusDoc["send_every_n_wakeups"] = sendEveryNWakeups;

    // Coefficients de calibration
    JsonArray calArray = statusDoc.createNestedArray("calibration_coefficients");
    float a0 = isnan(CAL_OVERRIDE_A0) ? 0.0f : CAL_OVERRIDE_A0;
    float a1 = isnan(CAL_OVERRIDE_A1) ? 1.0f : CAL_OVERRIDE_A1;
    float a2 = isnan(CAL_OVERRIDE_A2) ? 0.0f : CAL_OVERRIDE_A2;
    calArray.add(a0);
    calArray.add(a1);
    calArray.add(a2);

    // Paramètres de mesure
    statusDoc["airflow_passes"] = airflowPasses;
    statusDoc["airflow_samples_per_pass"] = airflowSamplesPerPass;
    statusDoc["airflow_delay_ms"] = airflowSampleDelayMs;

    // GPS et roaming
    statusDoc["gps_enabled"] = gpsEnabled;
    statusDoc["roaming_enabled"] = roamingEnabled;

    // Paramètres modem (tous les timeouts)
    statusDoc["watchdog_seconds"] = watchdogTimeoutSeconds;
    statusDoc["modem_boot_timeout_ms"] = modemBootTimeoutMs;
    statusDoc["sim_ready_timeout_ms"] = simReadyTimeoutMs;
    statusDoc["network_attach_timeout_ms"] = networkAttachTimeoutMs;
    statusDoc["modem_max_reboots"] = modemMaxReboots;

    // État modem (si disponible)
    statusDoc["modem_ready"] = modemReady;
    if (modemReady) {
      statusDoc["network_connected"] = modem.isNetworkConnected();
      statusDoc["gprs_connected"] = modem.isGprsConnected();
      int8_t csq = modem.getSignalQuality();
      statusDoc["signal_quality"] = csq;
      statusDoc["rssi"] = csqToRssi(csq);

      // État SIM (utiliser getSimStatus de TinyGsm)
      SimStatus simStatus = modem.getSimStatus();
      String simStatusStr = "UNKNOWN";
      if (simStatus == SIM_READY) {
        simStatusStr = "READY";
      } else if (simStatus == SIM_LOCKED) {
        simStatusStr = "LOCKED";
      } else if (simStatus == SIM_ANTITHEFT_LOCKED) {
        simStatusStr = "ANTITHEFT_LOCKED";
      } else if (simStatus == SIM_ERROR) {
        simStatusStr = "ERROR";
      }
      statusDoc["sim_status"] = simStatusStr;

      // Numéro de téléphone SIM (si disponible) - AT+CNUM
      // Note: Certaines cartes SIM ne stockent pas le numéro, retournera vide
      String simNumber = "";
      modem.sendAT(F("+CNUM"));
      if (modem.waitResponse(5000, GF("+CNUM:")) == 1) {
        // Format: +CNUM: "","+33612345678",129,7,4
        String response = modem.stream.readStringUntil('\n');
        response.trim();
        // Extraire le numéro entre les guillemets (chercher le deuxième numéro)
        int firstQuote = response.indexOf('"');
        if (firstQuote >= 0) {
          int secondQuote = response.indexOf('"', firstQuote + 1);
          if (secondQuote > firstQuote) {
            // Premier numéro (peut être vide), chercher le deuxième
            int thirdQuote = response.indexOf('"', secondQuote + 1);
            int fourthQuote = response.indexOf('"', thirdQuote + 1);
            if (thirdQuote >= 0 && fourthQuote > thirdQuote + 1) {
              simNumber = response.substring(thirdQuote + 1, fourthQuote);
            }
          }
        }
        modem.waitResponse();
      } else {
        modem.waitResponse();
      }
      if (simNumber.length() > 0) {
        statusDoc["sim_phone_number"] = simNumber;
      }
    } else {
      statusDoc["sim_status"] = "MODEM_NOT_READY";
    }

    // Réseau (toute la configuration réseau)
    statusDoc["apn"] = NETWORK_APN;
    statusDoc["sim_pin"] = SIM_PIN;
    statusDoc["detected_operator"] = DETECTED_OPERATOR;

    // OTA (toute la configuration OTA)
    statusDoc["ota_primary_url"] = otaPrimaryUrl;
    statusDoc["ota_fallback_url"] = otaFallbackUrl;
    statusDoc["ota_md5"] = otaExpectedMd5;

    // Niveau de log
    String logLevelStr = "INFO";
    if (currentLogLevel == LOG_ERROR) logLevelStr = "ERROR";
    else if (currentLogLevel == LOG_WARN) logLevelStr = "WARN";
    else if (currentLogLevel == LOG_INFO) logLevelStr = "INFO";
    else if (currentLogLevel == LOG_DEBUG) logLevelStr = "DEBUG";
    statusDoc["log_level"] = logLevelStr;

    // Mode USB
    statusDoc["usb_mode_active"] = usbModeActive;

    // Runtime
    statusDoc["uptime_ms"] = millis();
    statusDoc["watchdog_seconds"] = watchdogTimeoutSeconds;

    // Type de réponse pour identification par le frontend
    statusDoc["type"] = "config_response";
    statusDoc["mode"] = "usb_stream";

    // Sérialiser le status en string
    String statusStr;
    serializeJson(statusDoc, statusStr);

    // Envoyer directement sur Serial (format JSON compatible avec le parser du frontend)
    // IMPORTANT: Envoyer avec Serial.println() pour que le frontend puisse détecter la ligne complète
    Serial.println(statusStr);
    // NE PAS utiliser Serial.flush() - peut bloquer et causer des reconnexions USB en boucle
    // Le buffer se vide naturellement lors des prochaines écritures

    // Log de débogage pour confirmer l'envoi
    Serial.printf("%s[CMD] 🔍 DEBUG: Réponse GET_CONFIG envoyée (%d octets)\n", timeStr.c_str(), statusStr.length());
    Serial.printf("%s[CMD] 🔍 DEBUG: Type: config_response, Mode: usb_stream\n", timeStr.c_str());

    // Afficher un résumé
    Serial.printf("%s[CMD] 📊 Configuration complète envoyée:\n", timeStr.c_str());
    Serial.printf("%s      • Serial: %s | FW: %s\n", timeStr.c_str(), DEVICE_SERIAL.c_str(), FIRMWARE_VERSION);
    Serial.printf("%s      • Sleep: %dmin | GPS: %s | Roaming: %s\n", timeStr.c_str(),
                  configuredSleepMinutes, gpsEnabled ? "ON" : "OFF", roamingEnabled ? "ON" : "OFF");
    Serial.printf("%s      • Modem: %s | USB: %s | Log: %s\n", timeStr.c_str(),
                  modemReady ? "OK" : "KO", usbModeActive ? "ON" : "OFF", logLevelStr.c_str());
    Serial.printf("%s[CMD] ✅ Configuration complète envoyée (%d octets)\n", timeStr.c_str(), statusStr.length());

    // Envoyer ACK (sans payload pour éviter duplication)
    bool ackOk = acknowledgeCommand(cmd, true, "config sent");
    sendLog("INFO", cmd.verb + F(" envoyé - Configuration complète"), "commands");
  } else {
    acknowledgeCommand(cmd, false, "verb not supported");
    sendLog("WARN", String(F("Commande non supportée: ")) + cmd.verb, "commands");
  }
}

void loadConfig() {
  // On tente d'abord l'ouverture en lecture seule; si ça échoue (premier boot),
  // on réessaie en lecture/écriture afin que l'espace de noms soit créé.
  if (!prefs.begin("ott-fw", true)) {
    Serial.println(F("[CFG] prefs read failed (RO), retrying RW"));
    if (!prefs.begin("ott-fw", false)) {
      Serial.println(F("[CFG] prefs read failed (RW)"));
      return;
    }
  }
  // Charger l'APN depuis NVS (valeur par défaut vide - sera configurée par frontend via USB)
  String savedApn = prefs.getString("apn", "");
  apnLoadedFromNVS = false;  // Réinitialiser le flag
  if (savedApn.length() > 0) {
    // Valider l'APN chargé depuis NVS
    // Vérifier longueur maximale (64 caractères selon 3GPP)
    if (savedApn.length() > 64) {
      Serial.printf("[CFG] ⚠️ APN NVS trop long (%d) → Tronqué à 64 caractères\n", savedApn.length());
      savedApn = savedApn.substring(0, 64);
      // Optionnel : sauvegarder la version tronquée
      prefs.putString("apn", savedApn);
    }
    
    // Vérifier que l'APN contient des caractères imprimables valides (détection corruption)
    bool isValid = true;
    for (size_t i = 0; i < savedApn.length(); i++) {
      char c = savedApn.charAt(i);
      // Caractère imprimable ASCII (32-126) sauf caractères problématiques pour commandes AT
      if (c < 32 || c > 126 || c == '"' || c == ',') {
        isValid = false;
        break;
      }
    }
    
    if (!isValid) {
      Serial.printf("[CFG] ⚠️ APN NVS invalide/corrompu → Vide (sera configuré par frontend)\n");
      NETWORK_APN = "";  // Vide - sera configuré par frontend via USB
      apnLoadedFromNVS = false;
      // Effacer la valeur corrompue pour éviter de la recharger au prochain boot
      prefs.remove("apn");
    } else {
      NETWORK_APN = savedApn;
      apnLoadedFromNVS = true;  // Marquer que l'APN vient de NVS (donc configuré)
      Serial.printf("[CFG] 📥 APN chargé depuis NVS: \"%s\" (considéré comme configuré)\n", NETWORK_APN.c_str());
    }
  } else {
    // APN vide par défaut - sera configuré par frontend via USB
    NETWORK_APN = "";
    Serial.printf("[CFG] 📥 APN non trouvé en NVS → Vide (sera configuré par frontend via USB)\n");
  }
  // Note: JWT retiré - authentification par ICCID uniquement
  DEVICE_ICCID = prefs.getString("iccid", DEVICE_ICCID);
  DEVICE_SERIAL = prefs.getString("serial", DEVICE_SERIAL);
  // Charger l'opérateur sauvegardé pour pré-configurer l'APN au boot
  DETECTED_OPERATOR = prefs.getString("operator", "");
  if (DETECTED_OPERATOR.length() > 0) {
    Serial.printf("[CFG] 📥 Opérateur sauvegardé chargé: %s\n", DETECTED_OPERATOR.c_str());
  }
  // Charger le flag indiquant si l'APN a été configuré manuellement
  apnManual = prefs.getBool("apn_manual", false);
  if (apnManual) {
    Serial.printf("[CFG] 📥 Flag apnManual activé (APN \"%s\" configuré manuellement)\n", NETWORK_APN.c_str());
  }

  // Réinitialiser le serial si le format est invalide
  // Format valide : OTT-XX-XXX (temporaire) ou OTT-YY-NNN (définitif, ex: OTT-25-001)
  bool isValidFormat = false;
  if (DEVICE_SERIAL == "OTT-XX-XXX") {
    isValidFormat = true;
  } else if (DEVICE_SERIAL.startsWith("OTT-") && DEVICE_SERIAL.length() == 11) {
    // Vérifier format OTT-YY-NNN (ex: OTT-25-001)
    String yearPart = DEVICE_SERIAL.substring(4, 6);
    String numPart = DEVICE_SERIAL.substring(7);
    bool yearIsNumeric = true;
    bool numIsNumeric = true;
    for (int i = 0; i < yearPart.length(); i++) {
      if (!isDigit(yearPart.charAt(i))) {
        yearIsNumeric = false;
        break;
      }
    }
    for (int i = 0; i < numPart.length(); i++) {
      if (!isDigit(numPart.charAt(i))) {
        numIsNumeric = false;
        break;
      }
    }
    if (yearIsNumeric && numIsNumeric && DEVICE_SERIAL.charAt(6) == '-') {
      isValidFormat = true;
    }
  }

  if (!isValidFormat && DEVICE_SERIAL.length() > 0) {
    Serial.printf("[CFG] ⚠️ Serial invalide détecté: %s → Réinitialisation à OTT-XX-XXX\n", DEVICE_SERIAL.c_str());
    DEVICE_SERIAL = OTT_DEFAULT_SERIAL;
    prefs.putString("serial", DEVICE_SERIAL);
  }
  // SIM_PIN : Charger depuis NVS, mais valeur par défaut vide (sera configurée par frontend via USB)
  SIM_PIN = prefs.getString("sim_pin", "");  // Vide par défaut - doit être configuré via USB
  CAL_OVERRIDE_A0 = prefs.getFloat("cal_a0", NAN);
  CAL_OVERRIDE_A1 = prefs.getFloat("cal_a1", NAN);
  CAL_OVERRIDE_A2 = prefs.getFloat("cal_a2", NAN);
  // Plus de valeurs par défaut - charger depuis NVS uniquement si présent, sinon 0/vide
  configuredSleepMinutes = prefs.getUInt("sleep_min", 0);  // 0 = non configuré
  sendEveryNWakeups = prefs.getUChar("send_n_wake", 0);  // 0 = non configuré
  wakeupCounter = 0;                                     // Réinitialiser le compteur au boot
  airflowPasses = prefs.getUShort("flow_passes", 0);  // 0 = non configuré
  airflowSamplesPerPass = prefs.getUShort("flow_samples", 0);  // 0 = non configuré
  airflowSampleDelayMs = prefs.getUShort("flow_delay", 0);  // 0 = non configuré
  gpsEnabled = prefs.getBool("gps_enabled", false);  // false par défaut (peut rester)
  roamingEnabled = prefs.getBool("roaming_enabled", false);  // false par défaut (sera configuré par frontend)
  // Plus de valeurs par défaut - charger depuis NVS uniquement si présent, sinon 0
  watchdogTimeoutSeconds = prefs.getUInt("wdt_sec", 0);  // 0 = non configuré
  modemBootTimeoutMs = prefs.getUInt("mdm_boot_ms", 0);  // 0 = non configuré
  simReadyTimeoutMs = prefs.getUInt("sim_ready_ms", 0);  // 0 = non configuré
  networkAttachTimeoutMs = prefs.getUInt("net_attach_ms", 0);  // 0 = non configuré
  modemMaxReboots = prefs.getUChar("mdm_reboots", 0);  // 0 = non configuré
  otaPrimaryUrl = prefs.getString("ota_url", otaPrimaryUrl);
  otaFallbackUrl = prefs.getString("ota_fallback", otaFallbackUrl);
  otaExpectedMd5 = prefs.getString("ota_md5", otaExpectedMd5);
  currentFirmwareVersion = prefs.getString("fw_version", String(FIRMWARE_VERSION));
  previousFirmwareVersion = prefs.getString("fw_version_prev", "");
  bootFailureCount = prefs.getUChar("boot_failures", 0);
  otaInProgress = prefs.getBool("ota_in_progress", false);
  String storedLogs = prefs.getString("offline_logs", "");
  prefs.end();

  // Si c'est le premier boot, initialiser la version actuelle
  bool isFirstBoot = currentFirmwareVersion.isEmpty();
  if (isFirstBoot) {
    currentFirmwareVersion = String(F(FIRMWARE_VERSION_STR));
    saveConfig();
    Serial.println(F("[CFG] 🆕 Premier boot détecté - Version firmware initialisée"));
  }

  // Détecter si la version du firmware a changé (flash manuel)
  String runningVersion = String(F(FIRMWARE_VERSION_STR));
  bool firmwareVersionChanged = (runningVersion != currentFirmwareVersion && !isFirstBoot);
  if (firmwareVersionChanged) {
    Serial.printf("[CFG] 🔄 Changement de version détecté: %s → %s\n", currentFirmwareVersion.c_str(), runningVersion.c_str());
    Serial.println(F("[CFG] 💡 Note: Les paramètres sauvegardés en NVS sont conservés après flash"));
    Serial.println(F("[CFG] 💡 Utilisez RESET_CONFIG si vous voulez réinitialiser aux valeurs par défaut"));
  }

  if (storedLogs.length()) {
    DynamicJsonDocument doc(2048);
    if (deserializeJson(doc, storedLogs) == DeserializationError::Ok) {
      JsonArray arr = doc.as<JsonArray>();
      for (JsonVariant v : arr) {
        PendingLog pl{
          v["lvl"].as<String>(),
          v["type"].isNull() ? String(F("firmware")) : v["type"].as<String>(),
          v["msg"].as<String>()
        };
        offlineLogs.push_back(pl);
      }
    }
  }
}

void saveNetworkParams(const String& oper, const String& apn) {
  // Sauvegarder l'opérateur et l'APN détectés pour réutilisation au prochain réveil
  String previousOperator = DETECTED_OPERATOR;
  if (oper.length() > 0) {
    DETECTED_OPERATOR = oper;
  }
  
  // CRITIQUE: Ne pas écraser l'APN si il a été configuré manuellement
  // Si apnManual = true, l'APN configuré via USB doit être conservé
  if (apn.length() > 0 && !apnManual) {
    // Ne mettre à jour l'APN que si:
    // - Pas d'APN déjà sauvegardé en NVS (apnLoadedFromNVS = false), OU
    // - Changement d'opérateur détecté (changement de carte SIM)
    bool operatorChanged = (previousOperator.length() > 0 && previousOperator != oper);
    if (!apnLoadedFromNVS || operatorChanged) {
      NETWORK_APN = apn;
      if (operatorChanged) {
        Serial.printf("[MODEM] 💾 Changement d'opérateur détecté: %s → %s → APN mis à jour: %s\n",
                      previousOperator.c_str(), oper.c_str(), apn.c_str());
      }
    }
    // Sinon, conserver l'APN existant même si différent (il a été configuré)
  }
  // Persister dans NVS via saveConfig()
  saveConfig();
}

void saveConfig() {
  if (!prefs.begin("ott-fw", false)) {
    Serial.println(F("[CFG] prefs write failed"));
    return;
  }
  prefs.putString("apn", NETWORK_APN);
  // Note: JWT retiré - authentification par ICCID uniquement
  prefs.putString("iccid", DEVICE_ICCID);
  prefs.putString("serial", DEVICE_SERIAL);
  prefs.putString("sim_pin", SIM_PIN);
  // Sauvegarder l'opérateur détecté pour réutilisation au prochain boot
  if (DETECTED_OPERATOR.length() > 0) {
    prefs.putString("operator", DETECTED_OPERATOR);
  }
  // Sauvegarder le flag indiquant si l'APN a été configuré manuellement
  prefs.putBool("apn_manual", apnManual);
  prefs.putFloat("cal_a0", CAL_OVERRIDE_A0);
  prefs.putFloat("cal_a1", CAL_OVERRIDE_A1);
  prefs.putFloat("cal_a2", CAL_OVERRIDE_A2);
  prefs.putUInt("sleep_min", configuredSleepMinutes);
  prefs.putUChar("send_n_wake", sendEveryNWakeups);
  prefs.putUShort("flow_passes", airflowPasses);
  prefs.putUShort("flow_samples", airflowSamplesPerPass);
  prefs.putUShort("flow_delay", airflowSampleDelayMs);
  prefs.putBool("gps_enabled", gpsEnabled);
  prefs.putBool("roaming_enabled", roamingEnabled);
  prefs.putUInt("wdt_sec", watchdogTimeoutSeconds);
  prefs.putUInt("mdm_boot_ms", modemBootTimeoutMs);
  prefs.putUInt("sim_ready_ms", simReadyTimeoutMs);
  prefs.putUInt("net_attach_ms", networkAttachTimeoutMs);
  prefs.putUChar("mdm_reboots", modemMaxReboots);
  prefs.putString("ota_url", otaPrimaryUrl);
  prefs.putString("ota_fallback", otaFallbackUrl);
  prefs.putString("ota_md5", otaExpectedMd5);
  prefs.putString("fw_version", currentFirmwareVersion);
  prefs.putString("fw_version_prev", previousFirmwareVersion);
  prefs.putUChar("boot_failures", bootFailureCount);
  prefs.putBool("ota_in_progress", otaInProgress);
  prefs.end();
}

void updateCalibration(float a0, float a1, float a2) {
  CAL_OVERRIDE_A0 = a0;
  CAL_OVERRIDE_A1 = a1;
  CAL_OVERRIDE_A2 = a2;
}

bool deserializePayload(const Command& cmd, DynamicJsonDocument& doc) {
  if (cmd.payloadRaw.isEmpty()) {
    return false;
  }
  auto err = deserializeJson(doc, cmd.payloadRaw);
  return err == DeserializationError::Ok;
}

uint32_t extractSleepSeconds(const DynamicJsonDocument& payloadDoc) {
  if (payloadDoc.containsKey("seconds")) {
    return payloadDoc["seconds"];
  }
  if (payloadDoc.containsKey("sleep_seconds")) {
    return payloadDoc["sleep_seconds"];
  }
  if (payloadDoc.containsKey("value")) {
    return payloadDoc["value"];
  }
  return 0;
}

bool parseUrl(const String& url, bool& secure, String& host, uint16_t& port, String& path) {
  String trimmed = url;
  trimmed.trim();
  if (trimmed.startsWith("https://")) {
    secure = true;
    port = 443;
    trimmed.remove(0, 8);
  } else if (trimmed.startsWith("http://")) {
    secure = false;
    port = 80;
    trimmed.remove(0, 7);
  } else {
    return false;
  }

  int slashPos = trimmed.indexOf('/');
  String hostPort = slashPos >= 0 ? trimmed.substring(0, slashPos) : trimmed;
  path = slashPos >= 0 ? trimmed.substring(slashPos) : "/";
  int colonPos = hostPort.indexOf(':');
  if (colonPos >= 0) {
    host = hostPort.substring(0, colonPos);
    port = hostPort.substring(colonPos + 1).toInt();
  } else {
    host = hostPort;
  }
  host.trim();
  if (!host.length()) {
    return false;
  }
  if (!path.length()) {
    path = "/";
  }
  return true;
}

void validateBootAndMarkStable() {
  // Si une OTA était en cours, vérifier que le boot s'est bien passé
  if (otaInProgress) {
    Serial.println(F("[BOOT] OTA précédente détectée, validation du boot..."));

    // Vérifier que la version actuelle correspond à celle attendue
    String runningVersion = String(F(FIRMWARE_VERSION_STR));
    if (runningVersion != currentFirmwareVersion) {
      Serial.printf("[BOOT] Nouvelle version détectée: %s (était %s)\n",
                    runningVersion.c_str(), currentFirmwareVersion.c_str());
      currentFirmwareVersion = runningVersion;
    }

    // Réinitialiser le compteur d'échecs et marquer comme stable
    bootFailureCount = 0;
    otaInProgress = false;
    markFirmwareAsStable();
    Serial.println(F("[BOOT] Firmware validé et marqué comme stable"));
  } else {
    // Boot normal, incrémenter le compteur d'échecs si nécessaire
    // (sera réinitialisé si le boot se termine correctement)
    bootFailureCount = 0;
    saveConfig();
  }
}

void checkBootFailureAndRollback() {
  // Si le compteur d'échecs dépasse un seuil, tenter un rollback
  if (bootFailureCount >= 3) {
    Serial.println(F("[BOOT] Trop d'échecs de boot détectés, rollback..."));
    rollbackToPreviousFirmware();
    return;
  }

  // Si une OTA était en cours mais que la version n'a pas changé,
  // cela peut indiquer un problème
  if (otaInProgress && String(F(FIRMWARE_VERSION_STR)) == previousFirmwareVersion) {
    Serial.println(F("[BOOT] OTA en cours mais version inchangée, possible échec"));
    bootFailureCount++;
    saveConfig();
  }
}

void markFirmwareAsStable() {
  if (!prefs.begin("ott-fw", false)) {
    Serial.println(F("[OTA] Erreur sauvegarde état stable"));
    return;
  }
  prefs.putString("fw_version", currentFirmwareVersion);
  prefs.putUChar("boot_failures", 0);
  prefs.putBool("ota_in_progress", false);
  prefs.end();
  Serial.printf("[OTA] Firmware v%s marqué comme stable\n", currentFirmwareVersion.c_str());
}

void rollbackToPreviousFirmware() {
  Serial.println(F("[OTA] ROLLBACK: Tentative de restauration de la version précédente"));
  Serial.printf("[OTA] Version actuelle: %s\n", currentFirmwareVersion.c_str());
  Serial.printf("[OTA] Version précédente: %s\n", previousFirmwareVersion.c_str());

  if (previousFirmwareVersion.isEmpty()) {
    Serial.println(F("[OTA] Aucune version précédente disponible, rollback impossible"));
    sendLog("ERROR", "Rollback impossible: aucune version précédente", "ota");
    return;
  }

  // Note: Le rollback nécessiterait de reflasher la partition OTA précédente
  // Sur ESP32 avec OTA dual partition, on peut utiliser Update.swap()
  // Pour l'instant, on log juste l'événement et on réinitialise le compteur
  sendLog("WARN", "Rollback requis vers v" + previousFirmwareVersion, "ota");

  // Réinitialiser l'état
  bootFailureCount = 0;
  otaInProgress = false;
  currentFirmwareVersion = previousFirmwareVersion;
  previousFirmwareVersion = "";
  saveConfig();

  Serial.println(F("[OTA] État réinitialisé, redémarrage recommandé"));
  // Note: Un vrai rollback nécessiterait Update.swap() ou un reflash manuel
}

bool performOtaUpdate(const String& url, const String& expectedMd5, const String& expectedVersion) {
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[OTA] 🚀 Démarrage mise à jour firmware\n", timeStr.c_str());
  Serial.printf("%s[OTA] 📍 URL: %s\n", timeStr.c_str(), url.c_str());

  bool secure = true;
  String host;
  String path;
  uint16_t port = 443;
  if (!parseUrl(url, secure, host, port, path)) {
    Serial.println(F("[OTA] ❌ URL invalide"));
    return false;
  }

  Client* client = secure ? static_cast<Client*>(&netClient) : static_cast<Client*>(&plainNetClient);
  if (client->connected()) {
    client->stop();
    delay(50);
  }
  Serial.printf("%s[OTA] 🔌 Connexion à %s:%u%s\n", timeStr.c_str(), host.c_str(), port, secure ? " (TLS)" : "");
  if (!client->connect(host.c_str(), port)) {
    Serial.println(F("[OTA] ❌ Connexion impossible"));
    return false;
  }
  Serial.printf("%s[OTA] ✅ Connexion établie\n", formatTimeFromMillis(millis()).c_str());

  Serial.printf("%s[OTA] 📤 Envoi requête HTTP...\n", formatTimeFromMillis(millis()).c_str());
  String request = String(F("GET ")) + path + F(" HTTP/1.1\r\nHost: ") + host + F("\r\nConnection: close\r\n\r\n");
  client->print(request);

  Serial.printf("%s[OTA] ⏳ Réception en-têtes HTTP...\n", formatTimeFromMillis(millis()).c_str());
  int status = -1;
  size_t contentLength = 0;
  while (client->connected()) {
    String line = client->readStringUntil('\n');
    if (line == "\r") {
      break;
    }
    line.trim();
    if (line.startsWith("HTTP/1.")) {
      int spacePos = line.indexOf(' ');
      if (spacePos > 0) {
        status = line.substring(spacePos + 1).toInt();
      }
    } else if (line.startsWith("Content-Length:")) {
      contentLength = line.substring(15).toInt();
    }
    feedWatchdog();
  }

  if (status != 200) {
    Serial.printf("%s[OTA] ❌ HTTP %d\n", formatTimeFromMillis(millis()).c_str(), status);
    client->stop();
    return false;
  }
  Serial.printf("%s[OTA] ✅ HTTP 200 OK | Taille: %lu octets\n", formatTimeFromMillis(millis()).c_str(), contentLength);

  if (contentLength == 0) {
    contentLength = UPDATE_SIZE_UNKNOWN;
    Serial.printf("%s[OTA] ⚠️ Taille inconnue\n", formatTimeFromMillis(millis()).c_str());
  }

  Serial.printf("%s[OTA] 💾 Initialisation partition flash...\n", formatTimeFromMillis(millis()).c_str());
  if (!Update.begin(contentLength)) {
    Serial.println(F("[OTA] ❌ Échec initialisation partition"));
    Update.printError(Serial);
    client->stop();
    return false;
  }
  Serial.printf("%s[OTA] ✅ Partition flash prête\n", formatTimeFromMillis(millis()).c_str());

  if (expectedMd5.length() == 32) {
    Update.setMD5(expectedMd5.c_str());
    Serial.printf("%s[OTA] 🔒 MD5 attendu: %s\n", formatTimeFromMillis(millis()).c_str(), expectedMd5.c_str());
  } else {
    Serial.printf("%s[OTA] ⚠️ Pas de MD5 fourni\n", formatTimeFromMillis(millis()).c_str());
  }

  if (expectedVersion.length() > 0) {
    Serial.printf("%s[OTA] 📌 Version attendue: %s\n", formatTimeFromMillis(millis()).c_str(), expectedVersion.c_str());
  }

  Serial.printf("%s[OTA] 📥 Téléchargement firmware...\n", formatTimeFromMillis(millis()).c_str());
  uint8_t buffer[512];
  size_t written = 0;
  unsigned long lastRead = millis();
  unsigned long lastProgressLog = 0;
  uint8_t lastPercent = 0;

  while (client->connected() || client->available()) {
    int len = client->read(buffer, sizeof(buffer));
    if (len > 0) {
      if (Update.write(buffer, len) != len) {
        Serial.println(F("[OTA] ❌ Échec écriture flash"));
        client->stop();
        Update.end();
        return false;
      }
      written += len;
      lastRead = millis();
      feedWatchdog();

      // Log progression toutes les 10% ou toutes les 10 secondes
      if (contentLength > 0) {
        uint8_t percent = (written * 100) / contentLength;
        bool shouldLog = (percent >= lastPercent + 10) || (millis() - lastProgressLog > 10000);

        if (shouldLog && percent != lastPercent) {
          Serial.printf("%s[OTA] 📥 Progression: %lu/%lu octets (%d%%)\n",
                        formatTimeFromMillis(millis()).c_str(), written, contentLength, percent);
          lastPercent = percent;
          lastProgressLog = millis();
        }
      }
    } else {
      if (millis() - lastRead > OTA_STREAM_TIMEOUT_MS) {
        Serial.println(F("[OTA] ❌ Timeout téléchargement"));
        client->stop();
        Update.end();
        return false;
      }
      delay(10);
    }
  }
  Serial.printf("%s[OTA] ✅ Téléchargement terminé: %lu octets\n", formatTimeFromMillis(millis()).c_str(), written);
  client->stop();

  Serial.printf("%s[OTA] 💾 Finalisation écriture flash...\n", formatTimeFromMillis(millis()).c_str());
  if (!Update.end()) {
    Serial.println(F("[OTA] ❌ Échec finalisation flash"));
    Update.printError(Serial);
    return false;
  }
  Serial.printf("%s[OTA] ✅ Flash écrit avec succès\n", formatTimeFromMillis(millis()).c_str());

  if (!Update.isFinished()) {
    Serial.println(F("[OTA] ❌ Flash incomplet"));
    return false;
  }

  Serial.printf("%s[OTA] ✅ %u octets flashés avec succès\n", formatTimeFromMillis(millis()).c_str(), static_cast<unsigned>(written));

  // Si une version était attendue, on la sauvegarde pour validation au prochain boot
  if (expectedVersion.length() > 0) {
    currentFirmwareVersion = expectedVersion;
    saveConfig();
    Serial.printf("[OTA] Version attendue sauvegardée: %s\n", expectedVersion.c_str());
  }

  // Note: Le firmware sera validé au prochain boot via validateBootAndMarkStable()
  return true;
}

// ----------------------------------------------------------------------------- //
// GPS / Localisation                                                            //
// ----------------------------------------------------------------------------- //

/**
 * Obtient position GPS de manière RAPIDE et NON-BLOQUANTE
 * Timeout: 500ms max (1 seule tentative)
 * Usage: Mode USB streaming (appelé toutes les secondes)
 * 
 * @param latitude Pointeur vers la variable latitude (sortie)
 * @param longitude Pointeur vers la variable longitude (sortie)
 * @return true si la position a été obtenue, false sinon
 */
bool getDeviceLocationFast(float* latitude, float* longitude) {
  if (!modemReady || latitude == nullptr || longitude == nullptr) {
    return false;  // Pas de log pour ne pas polluer
  }

  // Vérifier que le GPS est activé
  if (!gpsEnabled) {
    return false;  // Pas de log pour ne pas polluer
  }

  static float cached_lat = 0.0, cached_lon = 0.0;
  static bool has_cached = false;
  static unsigned long last_gps_attempt = 0;
  static int consecutive_failures = 0;

  unsigned long now = millis();

  // Si on a une position en cache et qu'on a échoué plusieurs fois récemment,
  // utiliser le cache et ne réessayer que toutes les 30 secondes
  if (has_cached && consecutive_failures > 5 && (now - last_gps_attempt < 30000)) {
    *latitude = cached_lat;
    *longitude = cached_lon;
    return true;
  }

  // Ne tenter qu'une fois toutes les 5 secondes minimum pour ne pas surcharger
  if (now - last_gps_attempt < 5000) {
    if (has_cached) {
      *latitude = cached_lat;
      *longitude = cached_lon;
      return true;
    }
    return false;
  }

  last_gps_attempt = now;

  // Tentative GPS RAPIDE (500ms max)
  float lat = 0.0, lon = 0.0;
  float speed = 0.0, alt = 0.0;
  int vsat = 0, usat = 0;
  float accuracy = 0.0;

  unsigned long gpsStart = millis();
  if (modem.getGPS(&lat, &lon, &speed, &alt, &vsat, &usat, &accuracy)) {
    // Timeout vérifié
    if (millis() - gpsStart > 500) {
      consecutive_failures++;
      return has_cached ? (*latitude = cached_lat, *longitude = cached_lon, true) : false;
    }

    // Valider coordonnées (utilise fonction utilitaire)
    if (isValidGpsCoordinates(lat, lon)) {
      *latitude = lat;
      *longitude = lon;
      cached_lat = lat;
      cached_lon = lon;
      has_cached = true;
      consecutive_failures = 0;

      // Log seulement toutes les 10 acquisitions réussies
      static int success_count = 0;
      if (++success_count % 10 == 0) {
        Serial.printf("[GPS] ✅ Fix: %.6f, %.6f (sat: %d, acc: %.1fm)\n", lat, lon, usat, accuracy);
      }
      return true;
    }
  }

  consecutive_failures++;

  // Logger périodiquement (seulement toutes les 20 tentatives pour réduire le bruit)
  if (consecutive_failures > 0 && consecutive_failures % 20 == 0) {
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[GPS] ⏱️ Fix en cours... (tentative %d)\n",
                  timeStr.c_str(), consecutive_failures);
  }

  // Utiliser cache si disponible
  if (has_cached) {
    *latitude = cached_lat;
    *longitude = cached_lon;
    return true;
  }

  return false;
}

/**
 * Obtient la position du dispositif via GPS ou réseau cellulaire (version standard).
 * Timeout: 3 secondes (réduit de 10s)
 * Usage: Mode hybride, envoi initial au boot
 * 
 * IMPORTANT: Le GPS est intégré au modem SIM7600, donc il nécessite que le modem soit démarré.
 * 
 * Priorité:
 * 1. GPS si disponible (modem.getGPS()) - nécessite modem démarré
 * 2. Réseau cellulaire (modem.getGsmLocation()) si GPS échoue - nécessite aussi modem démarré
 * 
 * @param latitude Pointeur vers la variable latitude (sortie)
 * @param longitude Pointeur vers la variable longitude (sortie)
 * @return true si la position a été obtenue, false sinon
 */
bool getDeviceLocation(float* latitude, float* longitude) {
  if (!modemReady || latitude == nullptr || longitude == nullptr) {
    Serial.println(F("[GPS] ⚠️  Modem non démarré - Le GPS nécessite le modem (intégré au SIM7600)"));
    return false;
  }

  // Vérifier que le GPS est activé
  if (!gpsEnabled) {
    Serial.println(F("[GPS] ⚠️  GPS désactivé dans la configuration"));
    return false;
  }

  // Essayer d'abord le GPS (plus précis mais peut être plus lent)
  float lat = 0.0, lon = 0.0;
  float speed = 0.0, alt = 0.0;
  int vsat = 0, usat = 0;
  float accuracy = 0.0;

  // Tentative GPS avec timeout de 3 secondes (réduit de 10s)
  Serial.println(F("[GPS] Tentative acquisition GPS..."));
  unsigned long gpsStart = millis();

  // 1 seule tentative avec timeout de 3s (au lieu de 3 tentatives × 10s)
  if (modem.getGPS(&lat, &lon, &speed, &alt, &vsat, &usat, &accuracy)) {
    if (millis() - gpsStart > 3000) {
      Serial.println(F("[GPS] ⏱️ Timeout (3s)"));
      return false;
    }

    // Valider les coordonnées (fonction utilitaire)
    if (isValidGpsCoordinates(lat, lon)) {
      *latitude = lat;
      *longitude = lon;
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[GPS] ✅ %.6f, %.6f (acc: %.0fm, sat: %d)\n",
                    timeStr.c_str(), lat, lon, accuracy, usat);
      return true;
    }
  }

  // Si GPS échoue, essayer la localisation réseau cellulaire (plus rapide mais moins précis)
  lat = 0.0;
  lon = 0.0;
  float gsmAccuracy = 0.0;

  if (modem.getGsmLocation(&lat, &lon, &gsmAccuracy)) {
    // Valider les coordonnées (fonction utilitaire)
    if (isValidGpsCoordinates(lat, lon)) {
      *latitude = lat;
      *longitude = lon;
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[GPS] ✅ Réseau: %.6f, %.6f (%.0fm)\n",
                    timeStr.c_str(), lat, lon, gsmAccuracy);
      return true;
    }
  }

  // Log concis en cas d'échec (seulement si pas déjà loggé précédemment)
  static unsigned long lastGpsErrorLog = 0;
  if (millis() - lastGpsErrorLog > 10000) {  // Logger seulement toutes les 10 secondes
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[GPS] ❌ Pas de position (sat: %d/%d)\n",
                  timeStr.c_str(), usat, vsat);
    lastGpsErrorLog = millis();
  }
  return false;
}
