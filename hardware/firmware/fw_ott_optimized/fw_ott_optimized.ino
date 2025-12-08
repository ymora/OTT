/**
 * ================================================================
 *  OTT Firmware v1.0 - Mode unifié avec numérotation automatique
 * ================================================================
 * 
 * MATÉRIEL : LILYGO TTGO T-A7670G ESP32 Dev Board
 * ================================================
 * - ESP32-WROVER-B (240MHz dual-core, 4MB Flash, 8MB PSRAM)
 * - Module SIMCOM A7670G (LTE Cat-1, 4G, GPRS, GPS)
 * - Support batterie 18650 avec circuit de charge intégré
 * - Carte microSD, antenne 4G/GPS externe
 * 
 * Fonctionnalités principales :
 *   - Mesure du débit d'oxygène, batterie, RSSI, GPS
 *   - Envoi automatique des mesures via OTA (réseau) et USB (si connecté)
 *   - Format unifié : identifiants + mesures + configuration dans chaque message
 *   - Mode hybride : envoi au boot + envoi sur changement de flux d'air
 *   - Configuration via USB (prioritaire) ou OTA
 *   - TinyGSM A7670G : GPRS, HTTPS, GPS
 *   - Persistence : APN/ICCID/PIN/Serial/calibration en NVS
 *   - Logs : POST /devices/logs + tampon NVS si réseau coupé
 *   - Commandes OTA : SET_SLEEP_SECONDS, UPDATE_CONFIG, UPDATE_CALIBRATION, OTA_REQUEST
 *   - Deep sleep : économie d'énergie quand inactif
 *   - Numérotation automatique : OTT-XX-XXX → OTT-25-001 (généré par backend)
 */

// Configuration du modem SIMCOM A7670G (LTE Cat-1)
// TEMPORAIRE : Utilisation du driver SIM7600 (compatible avec A7670G)
// Note : Le A7670G et SIM7600 sont de la même famille SIMCOM et partagent
//        la plupart des commandes AT. Le driver SIM7600 fonctionne correctement.
// TODO : Mettre à jour TinyGSM vers v0.12.0+ pour utiliser TINY_GSM_MODEM_A7672X
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
#include <vector>
#include <algorithm>

#define MODEM_BAUDRATE        115200
#define MODEM_TX_PIN          26
#define MODEM_RX_PIN          27
#define MODEM_RESET_PIN       5
#define MODEM_RESET_LEVEL     HIGH
#define BOARD_PWRKEY_PIN      4
#define BOARD_POWERON_PIN     12
#define SerialAT              Serial1

#define SENSOR_PIN            33
#define BATTERY_ADC_PIN       35

static constexpr uint32_t DEFAULT_SLEEP_MINUTES = 1440; // 24 heures (1 envoi par jour pour limiter les coûts réseau)
static constexpr uint8_t  MAX_COMMANDS = 4;
static constexpr uint32_t MODEM_BOOT_TIMEOUT_DEFAULT_MS = 20000;  // Augmenté de 15s à 20s
static constexpr uint32_t SIM_READY_TIMEOUT_DEFAULT_MS = 45000;   // Augmenté de 30s à 45s
static constexpr uint32_t NETWORK_ATTACH_TIMEOUT_DEFAULT_MS = 120000; // Augmenté de 60s à 120s
static constexpr uint8_t  MODEM_MAX_REBOOTS_DEFAULT = 3;
static constexpr uint32_t WATCHDOG_TIMEOUT_DEFAULT_SEC = 30;
static constexpr uint8_t  MIN_WATCHDOG_TIMEOUT_SEC = 5;
static constexpr uint32_t OTA_STREAM_TIMEOUT_MS = 20000;

// --- Paramètres modifiables localement (puis écrasés via UPDATE_CONFIG) ---
#ifndef OTT_DEFAULT_SIM_PIN
#define OTT_DEFAULT_SIM_PIN "1234"
#endif
#ifndef OTT_DEFAULT_APN
#define OTT_DEFAULT_APN "free"
#endif
#ifndef OTT_DEFAULT_ICCID
#define OTT_DEFAULT_ICCID "89330123456789012345"
#endif

// Numérotation automatique des dispositifs (v1.0)
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
String SIM_PIN        = OTT_DEFAULT_SIM_PIN;
String NETWORK_APN    = OTT_DEFAULT_APN;
String DEVICE_ICCID   = OTT_DEFAULT_ICCID;
String DEVICE_SERIAL  = OTT_DEFAULT_SERIAL;

const char* API_HOST       = "ott-jbln.onrender.com";
const uint16_t API_PORT    = 443;
const char* API_PREFIX     = "/api.php";
const char* PATH_MEASURE   = "/devices/measurements";
const char* PATH_ACK       = "/devices/commands/ack";
const char* PATH_LOGS      = "/devices/logs";

// Version du firmware - stockée dans une section spéciale pour extraction depuis le binaire
// Cette constante sera visible dans le binaire compilé via une section .version
#define FIRMWARE_VERSION_STR "1.0"
const char* FIRMWARE_VERSION = FIRMWARE_VERSION_STR;

// Section de version lisible depuis le binaire (utilise __attribute__ pour créer une section)
// Cette section sera visible dans le fichier .bin compilé
__attribute__((section(".version"))) const char firmware_version_section[] = "OTT_FW_VERSION=" FIRMWARE_VERSION_STR "\0";

const size_t MAX_OFFLINE_LOGS = 10;           // Taille max du tampon de logs NVS

struct Measurement {
  float flow;      // Débit en L/min (après calibration)
  float battery;   // Batterie en %
  int   rssi;      // Force du signal en dBm
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

static uint32_t modemBootTimeoutMs = MODEM_BOOT_TIMEOUT_DEFAULT_MS;
static uint32_t simReadyTimeoutMs = SIM_READY_TIMEOUT_DEFAULT_MS;
static uint32_t networkAttachTimeoutMs = NETWORK_ATTACH_TIMEOUT_DEFAULT_MS;
static uint8_t modemMaxReboots = MODEM_MAX_REBOOTS_DEFAULT;
static uint32_t configuredSleepMinutes = DEFAULT_SLEEP_MINUTES;
static uint8_t sendEveryNWakeups = 1;  // Envoyer une mesure tous les N wakeups (1 = à chaque wakeup)
// Utiliser RTC_DATA_ATTR pour persister le compteur à travers les deep sleeps
RTC_DATA_ATTR static uint8_t wakeupCounter = 0;  // Compteur de wakeups depuis le dernier envoi (persiste après deep sleep)
static uint16_t airflowPasses = 2;
static uint16_t airflowSamplesPerPass = 10;
static uint16_t airflowSampleDelayMs = 5;
static uint32_t watchdogTimeoutSeconds = WATCHDOG_TIMEOUT_DEFAULT_SEC;
static bool gpsEnabled = false;  // GPS DÉSACTIVÉ par défaut (peut bloquer modem/consommer batterie)

// Variables pour mode hybride (détection changement flux)
static float lastFlowValue = 0.0;
static unsigned long lastMeasurementTime = 0;
static unsigned long lastOtaCheck = 0;  // Initialisé à 0 pour première vérification immédiate
static const float FLOW_CHANGE_THRESHOLD = 0.5;  // Seuil de changement (L/min)
static const unsigned long MIN_INTERVAL_MS = 5000;  // Intervalle minimum entre mesures (5s)
static const unsigned long IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes sans changement → light sleep
static const unsigned long OTA_CHECK_INTERVAL_MS = 30000;  // Vérifier commandes OTA toutes les 30s

// Variables pour mode USB dynamique
static bool usbModeActive = false;
static unsigned long lastUsbCheck = 0;
static const unsigned long USB_CHECK_INTERVAL_MS = 500;  // Vérifier USB toutes les 500ms
static bool watchdogConfigured = false;
static String otaPrimaryUrl;
static String otaFallbackUrl;
static String otaExpectedMd5;
static String currentFirmwareVersion;  // Version actuellement flashée (pour rollback)
static String previousFirmwareVersion; // Version précédente (pour rollback)
static bool otaInProgress = false;     // Flag pour indiquer qu'une OTA est en cours
static uint8_t bootFailureCount = 0;   // Compteur d'échecs de boot (pour rollback automatique)

// --- Prototypes (chaque fonction est documentée dans son bloc) ---
void initSerial();
void initBoard();
void initModem();
bool startModem();
void stopModem();
bool waitForSimReady(uint32_t timeoutMs);
bool attachNetwork(uint32_t timeoutMs);
bool connectData(uint32_t timeoutMs);
String getRecommendedApnForOperator(const String& operatorCode);
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
  return (lat >= -90.0f && lat <= 90.0f && 
          lon >= -180.0f && lon <= 180.0f && 
          (lat != 0.0f || lon != 0.0f));
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
int  fetchCommands(Command* out, size_t maxCount);
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

void setup()
{
  initSerial();
  Serial.println(F("\n═══ OTT Firmware v1.0 ═══"));
  Serial.printf("Serial: %s | ICCID: %s\n", 
                DEVICE_SERIAL.c_str(), 
                DEVICE_ICCID.substring(0, 10).c_str());
  if (DEVICE_SERIAL == "OTT-XX-XXX") {
    Serial.println(F("⚠️ Serial temporaire → Backend assignera OTT-YY-NNN"));
  }
  
  initBoard();
  loadConfig();
  
  // Vérifier si on doit faire un rollback (si le boot a échoué plusieurs fois)
  checkBootFailureAndRollback();
  
  // Valider le boot et marquer le firmware comme stable si c'est un boot réussi
  validateBootAndMarkStable();
  
  // Auth: ICCID uniquement (pas de JWT)
  Serial.println(F("🔐 Auth: ICCID uniquement (pas de JWT)"));
  
  configureWatchdog(watchdogTimeoutSeconds);
  feedWatchdog();
  logRuntimeConfig();

  // Toujours initialiser le modem - mode normal uniquement
  initModem();
  
  // Les identifiants et la configuration seront envoyés dans le premier message unifié

  // =========================================================================
  // DÉTECTION USB EN PRIORITÉ (avant modem pour ne pas bloquer)
  // =========================================================================
  bool usbConnected = Serial.availableForWrite() > 0;
  usbModeActive = usbConnected;
  
  if (usbConnected) {
    Serial.println(F("\n🔌 USB: Mode streaming (1s interval)"));
  } else {
    Serial.println(F("\n📡 Mode: Hybride (détection changement flux)"));
  }

  // =========================================================================
  // DÉMARRAGE MODEM (optionnel en mode USB, requis en mode hybride)
  // =========================================================================
  if (usbModeActive) {
    // Mode USB : Démarrage modem EN ARRIÈRE-PLAN (non bloquant)
    Serial.println(F("⚡ Streaming démarré | Modem: arrière-plan\n"));
    Serial.println(F("📡 Deux processus parallèles :"));
    Serial.println(F("   1. Debug USB : Affichage mesures toutes les secondes"));
    Serial.println(F("   2. Normal OTA : Envoi périodique selon configuration"));
    modemReady = false;
    // Initialiser lastMeasurementTime pour le processus normal
    lastMeasurementTime = millis();
    // Continuer vers loop() IMMÉDIATEMENT sans attendre le modem
    // Le modem sera initialisé dans loop(), puis envoi de la mesure initiale
    return;  // ← IMPORTANT: Sortir de setup() et aller dans loop() !
  } else {
    // Mode hybride : Modem REQUIS
    Serial.println(F("📡 Démarrage modem..."));
    if (!startModem()) {
      Serial.println(F("❌ Modem échec → Sleep 1min"));
      goToSleep(1);
      return;
    }
    Serial.println(F("✅ Modem prêt\n"));
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

void loop()
{
  feedWatchdog();
  unsigned long now = millis();
  
  // =========================================================================
  // DÉTECTION USB DYNAMIQUE (vérification toutes les 500ms)
  // =========================================================================
  if (now - lastUsbCheck >= USB_CHECK_INTERVAL_MS) {
    lastUsbCheck = now;
    bool currentUsbState = Serial.availableForWrite() > 0;
    
    // Transition OFF → ON (USB branché)
    if (currentUsbState && !usbModeActive) {
      usbModeActive = true;
      Serial.println(F("\n🔌 USB connecté → Streaming 1s"));
    }
    // Transition ON → OFF (USB débranché)
    else if (!currentUsbState && usbModeActive) {
      usbModeActive = false;
      Serial.println(F("\n📡 USB déconnecté → Mode hybride"));
    }
  }
  
  // =========================================================================
  // MODE USB ACTIF : Deux processus parallèles
  // =========================================================================
  // Processus 1 (USB Debug) : Affichage des mesures en temps réel sur USB (toutes les secondes)
  // Processus 2 (Normal OTA) : Envoi périodique des mesures via OTA (selon configuredSleepMinutes)
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
      
      Serial.println(F("[MODEM] Initialisation modem pour processus OTA normal (mode USB)..."));
      if (startModem()) {
        Serial.println(F("[MODEM] ✅ Modem initialisé - Processus OTA activé"));
        if (gpsEnabled) {
          Serial.println(F("[GPS] ⏱️  Le GPS sera activé automatiquement"));
        }
      } else {
        Serial.println(F("[MODEM] ⚠️ Échec initialisation modem (réessai dans 30s)"));
        Serial.println(F("[MODEM] ⚠️ Les mesures OTA ne seront pas envoyées tant que le modem n'est pas connecté"));
        if (gpsEnabled) {
          Serial.println(F("[GPS] ⚠️  GPS ne pourra pas fonctionner sans modem"));
        }
      }
      modemInitInProgress = false;
    }
    
    // Si le modem est prêt mais pas connecté, essayer de se connecter périodiquement
    if (modemReady && !modem.isNetworkConnected() && (now - lastModemInitAttempt >= 60000)) {
      Serial.println(F("[MODEM] Tentative reconnexion réseau..."));
      if (attachNetwork(60000)) {
        Serial.println(F("[MODEM] ✅ Réseau reconnecté - Processus OTA activé"));
        lastModemInitAttempt = now;
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
        String timeStr = formatTimeFromMillis(millis());
        Serial.printf("%s[USB] 🚀 Processus 1 démarré - Affichage mesures toutes les secondes\n", timeStr.c_str());
        Serial.printf("%s[USB] 📡 État modem: %s\n", timeStr.c_str(), modemReady ? "✅ Prêt" : "❌ Non initialisé");
        if (modemReady) {
          Serial.printf("%s[USB] 📡 Réseau: %s | GPRS: %s\n", 
                        timeStr.c_str(),
                        modem.isNetworkConnected() ? "✅ Connecté" : "❌ Déconnecté",
                        modem.isGprsConnected() ? "✅ Connecté" : "❌ Déconnecté");
        }
      }
      
      // Capturer mesure pour affichage USB
      Measurement m = captureSensorSnapshot();
      
      // RSSI (seulement si modem prêt)
      if (modemReady) {
        int8_t csq = modem.getSignalQuality();
        m.rssi = csqToRssi(csq);
        // Afficher l'état du réseau toutes les 10 mesures (toutes les 10 secondes)
        if (usbSequence % 10 == 0) {
          String timeStr = formatTimeFromMillis(millis());
          bool networkConnected = modem.isNetworkConnected();
          bool gprsConnected = modem.isGprsConnected();
          Serial.printf("%s[USB] 📶 Réseau: %s | GPRS: %s | RSSI: %d dBm (CSQ=%d)\n",
                        timeStr.c_str(),
                        networkConnected ? "✅ Connecté" : "❌ Déconnecté",
                        gprsConnected ? "✅ Connecté" : "❌ Déconnecté",
                        m.rssi, csq);
        }
      } else {
        m.rssi = 0;
        // Afficher que le modem n'est pas prêt toutes les 10 mesures
        if (usbSequence % 10 == 0) {
          String timeStr = formatTimeFromMillis(millis());
          Serial.printf("%s[USB] ⚠️ Modem non initialisé - En attente d'initialisation...\n", timeStr.c_str());
        }
      }
      
      // GPS (tentative rapide, seulement si modem prêt ET GPS activé)
      float latitude = 0.0, longitude = 0.0;
      bool hasLocation = false;
      if (modemReady && gpsEnabled) {
        hasLocation = getDeviceLocationFast(&latitude, &longitude);
        if (hasLocation) {
          String timeStr = formatTimeFromMillis(millis());
          Serial.printf("%s[USB] 📍 GPS: %.4f,%.4f\n", timeStr.c_str(), latitude, longitude);
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
      Serial.println(F("[OTA] 📤 Envoi mesure périodique (processus normal)..."));
      
      // Capturer mesure pour envoi OTA
      Measurement mOta = captureSensorSnapshot();
      
      // RSSI
      int8_t csq = modem.getSignalQuality();
      mOta.rssi = csqToRssi(csq);
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[OTA] 📶 RSSI: %d dBm (CSQ=%d)\n", timeStr.c_str(), mOta.rssi, csq);
      
      // GPS (si activé)
      float latOta = 0.0, lonOta = 0.0;
      bool hasLocationOta = false;
      if (gpsEnabled) {
        Serial.printf("%s[OTA] 📍 Acquisition GPS en cours...\n", timeStr.c_str());
        hasLocationOta = getDeviceLocation(&latOta, &lonOta);
        if (hasLocationOta) {
          Serial.printf("%s[OTA] 📍 GPS: %.6f, %.6f\n", timeStr.c_str(), latOta, lonOta);
        } else {
          Serial.printf("%s[OTA] ⚠️ GPS non disponible\n", timeStr.c_str());
        }
      }
      
      // Envoyer via OTA (processus normal)
      Serial.printf("%s[OTA] 📤 Envoi à la base de données...\n", timeStr.c_str());
      bool sent = sendMeasurement(mOta, hasLocationOta ? &latOta : nullptr, hasLocationOta ? &lonOta : nullptr, "TIMER");
      if (sent) {
        lastOtaMeasurementTime = now;
        // Note: wakeupCounter sera réinitialisé après deep sleep en mode normal
        // En mode USB, on ne l'utilise pas
        lastFlowValue = mOta.flow;
        lastMeasurementTime = now;
        timeStr = formatTimeFromMillis(millis());
        Serial.printf("%s[OTA] ✅ Mesure envoyée à la base de données avec succès (débit: %.2f L/min, batterie: %.0f%%, RSSI: %d dBm)\n",
                      timeStr.c_str(), mOta.flow, mOta.battery, mOta.rssi);
        Serial.printf("%s[OTA] ⏰ Prochaine mesure dans %lu minutes (ou après %d wakeup(s))\n", 
                      timeStr.c_str(), static_cast<unsigned long>(configuredSleepMinutes), sendEveryNWakeups);
      } else {
        Serial.printf("%s[OTA] ❌ Échec envoi mesure - réessai au prochain cycle\n", timeStr.c_str());
      }
      
      // Traiter les commandes OTA après envoi
      Command cmds[MAX_COMMANDS];
      int count = fetchCommands(cmds, MAX_COMMANDS);
      if (count > 0) {
        Serial.printf("[OTA] 📡 %d commande(s) reçue(s)\n", count);
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
        Command cmds[MAX_COMMANDS];
        int count = fetchCommands(cmds, MAX_COMMANDS);
        if (count > 0) {
          String timeStr = formatTimeFromMillis(millis());
          Serial.printf("%s[OTA] 📡 %d commande(s) en attente\n", timeStr.c_str(), count);
          uint32_t dummySleep = configuredSleepMinutes;
          for (int i = 0; i < count; ++i) {
            handleCommand(cmds[i], dummySleep);
          }
        }
      }
    }
    
    // Traiter commandes série (config, calibration, etc.)
    static String commandBuffer = "";
    while (Serial.available()) {
      char incoming = Serial.read();
      if (incoming == '\r') continue;
      if (incoming == '\n') {
        commandBuffer.trim();
        if (commandBuffer.length() > 0) {
          handleSerialCommand(commandBuffer);
        }
        commandBuffer = "";
      } else {
        commandBuffer += incoming;
        if (commandBuffer.length() > 128) commandBuffer = "";
      }
    }
    
    delay(100); // Petit délai pour ne pas surcharger
    return; // Sortir de loop(), on reviendra au prochain cycle
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
        return; // Sortir si modem ne démarre pas
      }
    }
    
    // Vérifier que le modem est bien connecté au réseau
    if (!modem.isNetworkConnected()) {
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[MODEM] ⚠️ Modem non connecté au réseau (GPRS OK mais réseau non attaché)\n", timeStr.c_str());
      sendLog("WARN", "Modem GPRS connecté mais réseau non attaché", "network");
      return; // Sortir si réseau non attaché
    }
    
    if (!modem.isGprsConnected()) {
      String timeStr = formatTimeFromMillis(millis());
      Serial.printf("%s[MODEM] ⚠️ GPRS non connecté\n", timeStr.c_str());
      sendLog("WARN", "GPRS non connecté malgré connexion réseau", "network");
      return; // Sortir si GPRS non connecté
    }
    
    String timeStr = formatTimeFromMillis(millis());
    Serial.printf("%s[API] 📤 Préparation envoi mesure...\n", timeStr.c_str());
    
    // Capturer mesure complète
    Measurement m = captureSensorSnapshot();
    
    // Obtenir RSSI (si modem actif)
    if (modemReady && modem.isNetworkConnected()) {
      int8_t csq = modem.getSignalQuality();
      m.rssi = csqToRssi(csq);
      Serial.printf("%s[API] 📶 RSSI: %d dBm (CSQ=%d)\n", timeStr.c_str(), m.rssi, csq);
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
      sendLog("INFO", "Mesure envoyée avec succès: " + String(m.flow) + " L/min", "measurements");
    } else {
      Serial.printf("%s[SENSOR] ❌ Échec envoi mesure\n", timeStr.c_str());
      sendLog("ERROR", "Échec envoi mesure - vérifier connexion API", "measurements");
    }
    
    // Traiter les commandes OTA périodiquement (toutes les 30 secondes)
    // Note: lastOtaCheck est initialisé à 0, donc la première vérification se fera immédiatement
    if (now - lastOtaCheck >= OTA_CHECK_INTERVAL_MS) {
      lastOtaCheck = now;
      if (modemReady && modem.isNetworkConnected()) {
        Command cmds[MAX_COMMANDS];
        int count = fetchCommands(cmds, MAX_COMMANDS);
        if (count > 0) {
          Serial.printf("[COMMANDS] %d commande(s) OTA reçue(s)\n", count);
          uint32_t dummySleep = configuredSleepMinutes;
          for (int i = 0; i < count; ++i) {
            handleCommand(cmds[i], dummySleep);
          }
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
    if (sent && timeSinceLastSleep > 60000) { // Au moins 1 minute depuis le dernier deep sleep
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

void initSerial()
{
  Serial.begin(115200);
  delay(100);
  while (Serial.available()) Serial.read();
  Serial.println(F("\n[BOOT] UART prêt"));
}

void initBoard()
{
  pinMode(BOARD_POWERON_PIN, OUTPUT);
  digitalWrite(BOARD_POWERON_PIN, HIGH);

  pinMode(BOARD_PWRKEY_PIN, OUTPUT);
  digitalWrite(BOARD_PWRKEY_PIN, LOW);
  delay(100);
  digitalWrite(BOARD_PWRKEY_PIN, HIGH);
  delay(100);
  digitalWrite(BOARD_PWRKEY_PIN, LOW);
}

void initModem()
{
  SerialAT.begin(MODEM_BAUDRATE, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  pinMode(MODEM_RESET_PIN, OUTPUT);
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);
  delay(100);
  digitalWrite(MODEM_RESET_PIN, MODEM_RESET_LEVEL);
  delay(5000); // Augmenté de 2600ms à 5000ms pour laisser plus de temps au modem
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);
  
  // Vérifier que le modem répond avant de continuer
  unsigned long testStart = millis();
  while (!modem.testAT(500) && (millis() - testStart < 10000)) {
    delay(500);
    feedWatchdog();
  }
}

bool startModem()
{
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
      saveConfig(); // Sauvegarder l'ICCID réel en NVS
    } else if (DEVICE_ICCID != realIccid) {
      // Avertir si l'ICCID configuré diffère de l'ICCID réel
      Serial.printf("[MODEM] ATTENTION: ICCID configuré (%s) diffère de l'ICCID réel (%s)\n", 
                    DEVICE_ICCID.c_str(), realIccid.c_str());
      sendLog("WARN", "ICCID mismatch: config=" + DEVICE_ICCID + " real=" + realIccid, "config");
    }
  } else if (realIccid.length() > 0) {
    Serial.printf("[MODEM] ICCID réel invalide (longueur %d): %s\n", realIccid.length(), realIccid.c_str());
  }

  // Configuration APN pour internet (type IP, pas MMS)
  // Pour Free Mobile: APN="free" (internet), pas "mmsfree" (MMS uniquement)
  // Format: +CGDCONT=1,"IP","free" (1=context ID, IP=type internet, free=APN)
  modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), NETWORK_APN.c_str(), "\"");
  modem.waitResponse(2000);
  if (!isUsbMode) {
    Serial.printf("[MODEM] APN=%s (type: IP pour internet)\n", NETWORK_APN.c_str());
  }

  if (!attachNetwork(networkAttachTimeoutMs)) {
    if (!isUsbMode) {
      Serial.println(F("[MODEM] réseau indisponible"));
    }
    sendLog("ERROR", "Network unavailable");
    return false;
  }
  if (!isUsbMode) {
    Serial.println(F("[MODEM] réseau attaché"));
  }
  if (!connectData(networkAttachTimeoutMs)) {
    if (!isUsbMode) {
      Serial.println(F("[MODEM] GPRS KO"));
    }
    sendLog("ERROR", "GPRS connection failed");
    return false;
  }
  if (!isUsbMode) {
    Serial.println(F("[MODEM] session data active"));
  }

#ifdef TINY_GSM_MODEM_SIM7600
  // TLS géré par le modem SIM7600 (certificats chargés côté module)
#else
  netClient.setInsecure();
#endif
  modemReady = true;
  
  // Activer le GPS si configuré
  if (gpsEnabled) {
    // Logs GPS simplifiés et concis
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

void stopModem()
{
  // Désactiver le GPS avant d'arrêter le modem (économie d'énergie)
  if (gpsEnabled) {
    Serial.println(F("[GPS] Désactivation GPS (arrêt modem)"));
    modem.disableGPS();
  }
  modem.gprsDisconnect();
  modemReady = false;
}

void goToSleep(uint32_t minutes)
{
  Serial.printf("[SLEEP] %lu minutes\n", minutes);
  esp_sleep_enable_timer_wakeup(minutes * 60ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void logRuntimeConfig()
{
  Serial.printf("⚙️  Sleep %lumin | GPS %s | WDT %lus | APN %s\n",
                static_cast<unsigned long>(configuredSleepMinutes),
                gpsEnabled ? "ON" : "OFF",
                watchdogTimeoutSeconds,
                NETWORK_APN.c_str());
}

Measurement captureSensorSnapshot()
{
  Measurement m{};
  m.flow = airflowToLpm(measureAirflowRaw());
  m.battery = measureBattery();
  m.rssi = -999;
  return m;
}


void emitDebugMeasurement(const Measurement& m, uint32_t sequence, uint32_t intervalMs, float* latitude, float* longitude)
{
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
  
  // Configuration
  doc["interval_ms"] = intervalMs;
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
  
  // Timestamp
  doc["timestamp_ms"] = millis();
  
  // Statut
  doc["status"] = "USB_STREAM";
  
  // Envoyer le JSON complet en une seule fois (une seule ligne)
  // Utiliser un buffer String pour envoyer tout d'un coup (plus efficace)
  String jsonOutput;
  serializeJson(doc, jsonOutput);
  jsonOutput += '\n';  // Nouvelle ligne pour terminer le JSON
  Serial.print(jsonOutput);  // Envoyer tout d'un coup
  Serial.flush();     // Forcer l'envoi immédiat
  
  // Message de debug simplifié (seulement toutes les 20 mesures pour réduire le bruit)
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
void handleSerialCommand(const String& command)
{
  // Ignorer les lignes qui sont du JSON (données de streaming sortantes)
  // Les lignes JSON commencent par '{' et ne sont pas des commandes
  String trimmed = command;
  trimmed.trim();
  
  // Ignorer les lignes JSON complètes (commencent par '{')
  if (trimmed.startsWith("{")) {
    // C'est du JSON de streaming, pas une commande - ignorer silencieusement
    return;
  }
  
  // Ignorer les fragments de JSON (fins de tableaux, etc.)
  // Exemples: "0,1,0]}", "]}" , etc.
  if (trimmed.endsWith("]}") || trimmed.endsWith("}") || 
      (trimmed.indexOf(',') >= 0 && trimmed.indexOf(']') >= 0)) {
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

void configureWatchdog(uint32_t timeoutSeconds)
{
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

void feedWatchdog()
{
  if (watchdogConfigured) {
    esp_task_wdt_reset();
  }
}

static const char* regStatusToString(RegStatus status)
{
  switch (status) {
    case REG_UNREGISTERED: return "non enregistré";
    case REG_SEARCHING:    return "recherche opérateur";
    case REG_DENIED:       return "refusé";
    case REG_OK_HOME:      return "attaché (home)";
    case REG_OK_ROAMING:   return "attaché (roaming)";
    case REG_UNKNOWN:      return "inconnu";
    default:               return "indéfini";
  }
}

void logRadioSnapshot(const char* stage)
{
  RegStatus reg = modem.getRegistrationStatus();
  int8_t csq = modem.getSignalQuality();
  String oper = modem.getOperator();
  bool eps = modem.isNetworkConnected();
  bool gprs = modem.isGprsConnected();

  // Afficher correctement CSQ et RSSI (CSQ=99 = signal invalide)
  if (csq == 99) {
    Serial.printf("[MODEM][%s] CSQ=99 (Signal invalide) reg=%d (%s) oper=%s eps=%s gprs=%s\n",
                  stage,
                  reg,
                  regStatusToString(reg),
                  oper.length() ? oper.c_str() : "<n/a>",
                  eps ? "ok" : "KO",
                  gprs ? "ok" : "KO");
  } else {
    // Convertir CSQ en dBm pour affichage (seulement si CSQ valide)
    int16_t rssi_dbm = csqToRssi(csq);
    Serial.printf("[MODEM][%s] CSQ=%d (RSSI=%d dBm) reg=%d (%s) oper=%s eps=%s gprs=%s\n",
                  stage,
                  csq,
                  rssi_dbm,
                  reg,
                  regStatusToString(reg),
                  oper.length() ? oper.c_str() : "<n/a>",
                  eps ? "ok" : "KO",
                  gprs ? "ok" : "KO");
  }
  
  // Logs détaillés pour REG_DENIED
  if (reg == REG_DENIED) {
    Serial.println(F("[MODEM] ⚠️  ENREGISTREMENT REFUSÉ - Causes possibles:"));
    Serial.println(F("[MODEM]   1. Carte SIM non activée pour les données"));
    Serial.println(F("[MODEM]   2. APN incorrect pour l'opérateur"));
    Serial.println(F("[MODEM]   3. Problème d'authentification réseau"));
    if (oper.length() > 0) {
      String recommendedApn = getRecommendedApnForOperator(oper);
      if (recommendedApn.length() > 0 && recommendedApn != NETWORK_APN) {
        Serial.printf("[MODEM]   → APN recommandé pour %s: %s (actuel: %s)\n", 
                      oper.c_str(), recommendedApn.c_str(), NETWORK_APN.c_str());
      }
    }
  }
  
  // Logs détaillés pour CSQ=99 (signal invalide)
  if (csq == 99) {
    Serial.println(F("[MODEM] ⚠️  SIGNAL INVALIDE (CSQ=99) - Causes possibles:"));
    Serial.println(F("[MODEM]   1. Antenne déconnectée ou défectueuse"));
    Serial.println(F("[MODEM]   2. Pas de couverture réseau à cet emplacement"));
    Serial.println(F("[MODEM]   3. Modem non initialisé correctement"));
    Serial.println(F("[MODEM]   4. Problème matériel (câble, connecteur)"));
  }
}

bool waitForSimReady(uint32_t timeoutMs)
{
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
 * Obtient l'APN recommandé selon l'opérateur détecté
 * 
 * Configuration Free Mobile (MCC: 208, MNC: 15):
 * - APN Internet: "free" (pour données/internet)
 * - APN MMS: "mmsfree" (pour MMS uniquement, non utilisé ici)
 * 
 * On utilise "free" pour les données internet, pas "mmsfree" qui est réservé aux MMS.
 */
String getRecommendedApnForOperator(const String& operatorCode)
{
  // Codes opérateurs français (MCC+MNC)
  if (operatorCode.indexOf("20801") >= 0 || operatorCode.indexOf("20802") >= 0) {
    // Orange France (MCC: 208, MNC: 01/02)
    return String("orange");
  } else if (operatorCode.indexOf("20810") >= 0 || operatorCode.indexOf("20811") >= 0) {
    // SFR France (MCC: 208, MNC: 10/11)
    return String("sl2sfr");
  } else if (operatorCode.indexOf("20815") >= 0 || operatorCode.indexOf("20816") >= 0) {
    // Free Mobile France (MCC: 208, MNC: 15/16)
    // APN Internet: "free" (pour données/internet)
    // Note: "mmsfree" existe mais est uniquement pour MMS, pas pour internet
    return String("free");
  } else if (operatorCode.indexOf("20820") >= 0) {
    // Bouygues Telecom France (MCC: 208, MNC: 20)
    return String("mmsbouygtel");
  }
  
  // Par défaut, retourner l'APN configuré
  return NETWORK_APN;
}

/**
 * Attache le réseau avec retry et backoff exponentiel
 * Gère spécifiquement le cas REG_DENIED avec tentative d'APN alternatif
 */
bool attachNetworkWithRetry(uint32_t timeoutMs, uint8_t maxRetries)
{
  unsigned long start = millis();
  uint8_t retryCount = 0;
  uint32_t baseDelay = 5000; // 5 secondes de base
  
  Serial.println(F("[MODEM] attache réseau en cours (avec retry)"));
  logRadioSnapshot("attach:start");
  
  // NOUVEAU: Vérifier CSQ avant de commencer
  int8_t initialCsq = modem.getSignalQuality();
  if (initialCsq == 99) {
    Serial.println(F("[MODEM] ⚠️ CSQ=99 avant attachement - Reset modem"));
    modem.restart();
    delay(5000);
    initialCsq = modem.getSignalQuality();
    if (initialCsq == 99) {
      Serial.println(F("[MODEM] ❌ CSQ toujours à 99 après reset - Problème matériel probable"));
      logRadioSnapshot("attach:csq_fail");
      return false;
    }
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
      Serial.println(F("[MODEM] ⚠️ CSQ=99 persistant après 2 tentatives - Reset modem"));
      modem.restart();
      delay(5000);
      csq = modem.getSignalQuality();
      if (csq == 99) {
        Serial.println(F("[MODEM] ❌ CSQ toujours à 99 après reset"));
        logRadioSnapshot("attach:csq_fail");
        return false;
      }
    }
    
    // Obtenir le statut d'enregistrement
    RegStatus reg = modem.getRegistrationStatus();
    
    // Si REG_DENIED, essayer avec un APN alternatif
    if (reg == REG_DENIED && retryCount == 0) {
      String oper = modem.getOperator();
      if (oper.length() > 0) {
        String recommendedApn = getRecommendedApnForOperator(oper);
        if (recommendedApn.length() > 0 && recommendedApn != NETWORK_APN) {
          Serial.printf("[MODEM] ⚠️  Tentative avec APN alternatif: %s (au lieu de %s)\n", 
                        recommendedApn.c_str(), NETWORK_APN.c_str());
          modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), recommendedApn.c_str(), "\"");
          modem.waitResponse(2000);
          
          // Remplacer delay() long par boucle avec feedWatchdog()
          unsigned long apnDelayStart = millis();
          while (millis() - apnDelayStart < 2000) {
            delay(100);
            feedWatchdog();
          }
          feedWatchdog();
        }
      }
    }
    
    // Attendre l'enregistrement réseau avec feedWatchdog() régulier
    unsigned long networkWaitStart = millis();
    bool networkAttached = false;
    while (millis() - networkWaitStart < 10000 && !networkAttached) {
      feedWatchdog();
      if (modem.waitForNetwork(1000)) {
        networkAttached = true;
        logRadioSnapshot("attach:event");
        return true;
      }
    }
    
    // Log du statut actuel
    Serial.printf("[MODEM] attente réseau... (tentative %d/%d)\n", retryCount + 1, maxRetries);
    logRadioSnapshot("attach:retry");
    
    // Backoff exponentiel : délai augmente à chaque retry
    uint32_t delayMs = baseDelay * (1 << retryCount); // 5s, 10s, 20s...
    if (delayMs > 30000) delayMs = 30000; // Max 30 secondes
    Serial.printf("[MODEM] Attente %lu ms avant prochaine tentative...\n", delayMs);
    
    // Remplacer delay() long par boucle avec feedWatchdog() pour éviter timeout
    unsigned long delayStart = millis();
    while (millis() - delayStart < delayMs) {
      delay(100); // Délai court
      feedWatchdog(); // Réinitialiser watchdog régulièrement
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
bool attachNetwork(uint32_t timeoutMs)
{
  return attachNetworkWithRetry(timeoutMs, 3);
}

bool connectData(uint32_t timeoutMs)
{
  unsigned long start = millis();
  Serial.println(F("[MODEM] connexion data"));
  logRadioSnapshot("data:start");
  
  // Liste d'APN à essayer (APN configuré en premier, puis APN recommandé)
  String apnList[3];
  apnList[0] = NETWORK_APN;
  
  String oper = modem.getOperator();
  if (oper.length() > 0) {
    String recommendedApn = getRecommendedApnForOperator(oper);
    if (recommendedApn.length() > 0 && recommendedApn != NETWORK_APN) {
      apnList[1] = recommendedApn;
    }
  }
  // APN génériques en dernier recours
  apnList[2] = "internet";
  
  uint8_t apnIndex = 0;
  uint8_t maxApnAttempts = 3;
  
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
    modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), currentApn.c_str(), "\"");
    modem.waitResponse(2000);
    delay(1000);
    feedWatchdog();
    
    if (modem.gprsConnect(currentApn.c_str(), "", "")) {
      logRadioSnapshot("data:connected");
      Serial.printf("[MODEM] ✅ Connexion GPRS réussie avec APN: %s\n", currentApn.c_str());
      
      // Vérifier l'état complet de la connexion
      // Remplacer delay() par boucle avec feedWatchdog()
      unsigned long stabilDelayStart = millis();
      while (millis() - stabilDelayStart < 1000) {
        delay(100);
        feedWatchdog();
      }
      bool networkOk = modem.isNetworkConnected();
      bool gprsOk = modem.isGprsConnected();
      Serial.printf("[MODEM] 📊 État connexion: Réseau=%s | GPRS=%s\n", 
                    networkOk ? "OK" : "KO", 
                    gprsOk ? "OK" : "KO");
      
      if (networkOk && gprsOk) {
        Serial.println(F("[MODEM] ✅ Prêt pour envoi de données"));
        sendLog("INFO", "Connexion GPRS réussie avec APN: " + currentApn, "network");
      } else {
        Serial.println(F("[MODEM] ⚠️ Connexion GPRS mais état réseau incertain"));
        sendLog("WARN", "Connexion GPRS réussie mais réseau non vérifié", "network");
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
int8_t csqToRssi(int8_t csq)
{
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
float measureBattery()
{
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
  const float MIN_VOLTAGE = 3.0f;  // Tension minimale sûre
  const float MAX_VOLTAGE = 4.2f;  // Tension maximale (pleine charge)
  const float VOLTAGE_RANGE = MAX_VOLTAGE - MIN_VOLTAGE; // 1.2V
  
  float pct = ((batteryVoltage - MIN_VOLTAGE) / VOLTAGE_RANGE) * 100.0f;
  
  // Limiter à 0-100% (sécurité)
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  
  // Log concis et lisible (format optimisé - même format que l'exemple)
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[SENSOR] Batterie ADC=%d | V_adc=%.3fV | V_batt=%.3fV | Charge=%.1f%%\n", 
                timeStr.c_str(), raw, adcVoltage, batteryVoltage, pct);
  
  // Avertissement si batterie faible (seulement si nécessaire)
  if (batteryVoltage < 3.2f) {
    Serial.printf("%s[SENSOR] ⚠️  BATTERIE FAIBLE !\n", timeStr.c_str());
  }
  
  return pct;
}

float measureAirflowRaw()
{
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
  bool shouldLogConfig = configChanged || (millis() - lastConfigLog > 60000); // Log toutes les 60s max
  
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

float airflowToLpm(float airflow)
{
  if (!isnan(CAL_OVERRIDE_A0) && !isnan(CAL_OVERRIDE_A1) && !isnan(CAL_OVERRIDE_A2)) {
    return max(0.0f, CAL_OVERRIDE_A2 * airflow * airflow + CAL_OVERRIDE_A1 * airflow + CAL_OVERRIDE_A0);
  }

  float x_values[] = {1762, 1795, 1890, 1980, 2160, 2380};
  float y_values[] = {0, 1, 2, 3, 4, 5};
  const int n = 6;

  float Sx0 = n, Sx1 = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0;
  float Sy = 0, Sxy = 0, Sx2y = 0;
  for (int i = 0; i < n; ++i) {
    float x = x_values[i];
    float y = y_values[i];
    float x2 = x * x;
    Sx1 += x; Sx2 += x2; Sx3 += x2 * x; Sx4 += x2 * x2;
    Sy += y; Sxy += x * y; Sx2y += x2 * y;
  }
  float det = Sx0*(Sx2*Sx4 - Sx3*Sx3) - Sx1*(Sx1*Sx4 - Sx3*Sx2) + Sx2*(Sx1*Sx3 - Sx2*Sx2);
  float inv00 =  (Sx2*Sx4 - Sx3*Sx3) / det;
  float inv01 = -(Sx1*Sx4 - Sx3*Sx2) / det;
  float inv02 =  (Sx1*Sx3 - Sx2*Sx2) / det;
  float inv10 = inv01;
  float inv11 = (Sx0*Sx4 - Sx2*Sx2) / det;
  float inv12 = -(Sx0*Sx3 - Sx2*Sx1) / det;
  float inv20 = inv02;
  float inv21 = inv12;
  float inv22 = (Sx0*Sx2 - Sx1*Sx1) / det;

  float a0 = inv00 * Sy + inv01 * Sxy + inv02 * Sx2y;
  float a1 = inv10 * Sy + inv11 * Sxy + inv12 * Sx2y;
  float a2 = inv20 * Sy + inv21 * Sxy + inv22 * Sx2y;
  return max(0.0f, a2 * airflow * airflow + a1 * airflow + a0);
}

// ----------------------------------------------------------------------------- //
// HTTP helpers                                                                  //
// ----------------------------------------------------------------------------- //

String buildPath(const char* path)
{
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
String buildAuthHeader()
{
  return String();  // Pas d'authentification JWT pour les mesures (ICCID suffit)
}

bool httpPost(const char* path, const String& body, String* response)
{
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

bool httpGet(const char* path, String* response)
{
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

bool sendMeasurement(const Measurement& m, float* latitude, float* longitude, const char* status)
{
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
      sendLog("ERROR", "Measurement failed: " + errorMsg, "measurements");
    } else {
      Serial.println(F("[API] ⚠️ Pas de réponse de la base de données"));
      sendLog("ERROR", "Measurement failed: pas de réponse API", "measurements");
    }
  }
  
  return ok;
}

int fetchCommands(Command* out, size_t maxCount)
{
  if (maxCount == 0) return 0;
  String response;
  String path = String("/devices/") + DEVICE_ICCID + "/commands/pending?limit=" + String(maxCount);
  if (!httpGet(path.c_str(), &response)) {
    Serial.println(F("[API] GET commandes KO"));
    sendLog("WARN", "GET commandes échoué", "commands");
    return 0;
  }

  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, response)) {
    Serial.println(F("[API] JSON commandes invalide"));
    sendLog("WARN", "JSON commandes invalide", "commands");
    return 0;
  }

  if (!doc["success"]) {
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
  return count;
}

bool acknowledgeCommand(const Command& cmd, bool success, const char* message)
{
  String timeStr = formatTimeFromMillis(millis());
  Serial.printf("%s[CMD] 📤 Envoi ACK: ID=%d | Status=%s | Message=%s\n", 
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
    Serial.printf("%s[CMD] ✅ ACK envoyé avec succès à l'API\n", timeStr.c_str());
  } else {
    Serial.printf("%s[CMD] ❌ Échec envoi ACK à l'API\n", timeStr.c_str());
  }
  return result;
}

bool sendLog(const char* level, const String& message, const char* type)
{
  String lvl(level);
  String typeStr(type);
  if (modemReady && sendLogImmediate(lvl, message, typeStr)) {
    return true;
  }
  enqueueOfflineLog(lvl, typeStr, message);
  return false;
}

bool sendLogImmediate(const String& level, const String& message, const String& type)
{
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

void enqueueOfflineLog(const String& level, const String& type, const String& message)
{
  if (offlineLogs.size() >= MAX_OFFLINE_LOGS) {
    offlineLogs.erase(offlineLogs.begin());
  }
  offlineLogs.push_back(PendingLog{level, type, message});
  saveOfflineLogs();
}

void flushOfflineLogs()
{
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

void saveOfflineLogs()
{
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

void handleCommand(const Command& cmd, uint32_t& nextSleepMinutes)
{
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
    sendLog("INFO", "Sleep interval set to " + String(nextSleepMinutes) + " min", "commands");
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
      if (payloadDoc.containsKey("apn")) {
      String newApn = payloadDoc["apn"].as<String>();
      // SÉCURITÉ: Valider et limiter la longueur de l'APN
      if (newApn.length() > 0 && newApn.length() <= 64) {
        NETWORK_APN = sanitizeString(newApn, 64);
      }
    }
    // Note : Le champ "jwt" était utilisé dans d'anciennes versions (< v1.0).
    // L'authentification se fait maintenant uniquement par sim_iccid.
    // Le champ est ignoré pour compatibilité avec d'anciennes commandes UPDATE_CONFIG.
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
    saveConfig();
    
    // Afficher un résumé de ce qui a été modifié
    Serial.println("✅ [CMD] Configuration appliquée et sauvegardée en NVS");
    Serial.printf("    • Serial: %s | ICCID: %s\n", DEVICE_SERIAL.c_str(), DEVICE_ICCID.substring(0,10).c_str());
    Serial.printf("    • Sleep: %d min | GPS: %s | Envoi: tous les %d wakeup(s)\n", 
                  configuredSleepMinutes, gpsEnabled ? "ON" : "OFF", sendEveryNWakeups);
    
    bool ackOk = acknowledgeCommand(cmd, true, "config updated");
    Serial.printf("%s[CMD] 📤 ACK envoyé: %s\n", timeStr.c_str(), ackOk ? "✅ Succès" : "❌ Échec");
    sendLog("INFO", "Configuration mise à jour à distance", "commands");
    Serial.println(F("[CMD] 🔄 Redémarrage du dispositif dans 2 secondes..."));
    // Remplacer delay() par boucle avec feedWatchdog() avant redémarrage
    unsigned long rebootDelayStart = millis();
    while (millis() - rebootDelayStart < 2000) {
      delay(100);
      feedWatchdog();
    }
    stopModem();
    esp_restart();
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
    Serial.printf("%s[OTA] 📨 Commande OTA_REQUEST reçue\n", timeStr.c_str());
    Serial.printf("%s[OTA]   URL: %s\n", timeStr.c_str(), url.c_str());
    if (expectedVersion.length() > 0) {
      Serial.printf("%s[OTA]   Version: %s\n", timeStr.c_str(), expectedVersion.c_str());
    }
    if (md5.length() == 32) {
      Serial.printf("%s[OTA]   MD5: %s\n", timeStr.c_str(), md5.c_str());
    }
    
    sendLog("INFO", "OTA request: " + url + (expectedVersion.length() ? " (v" + expectedVersion + ")" : ""), "ota");
    bool otaOk = performOtaUpdate(url, md5, expectedVersion);
    bool ackOk = acknowledgeCommand(cmd, otaOk, otaOk ? "ota applied" : "ota failed");
    if (otaOk) {
      Serial.printf("%s[CMD] ✅ OTA appliqué avec succès\n", timeStr.c_str());
      sendLog("INFO", "OTA appliquée, reboot", "ota");
      Serial.printf("%s[OTA] ✅ Mise à jour réussie, redémarrage...\n", timeStr.c_str());
      stopModem();
      delay(250);
      esp_restart();
    } else {
      // En cas d'échec, restaurer l'état
      otaInProgress = false;
      saveConfig();
      acknowledgeCommand(cmd, false, "ota failed");
      sendLog("ERROR", "OTA échouée", "ota");
      Serial.printf("%s[OTA] ❌ Mise à jour échouée\n", formatTimeFromMillis(millis()).c_str());
    }
  } else {
    acknowledgeCommand(cmd, false, "verb not supported");
    sendLog("WARN", "Commande non supportée: " + cmd.verb, "commands");
  }
}

void loadConfig()
{
  // On tente d'abord l'ouverture en lecture seule; si ça échoue (premier boot),
  // on réessaie en lecture/écriture afin que l'espace de noms soit créé.
  if (!prefs.begin("ott-fw", true)) {
    Serial.println(F("[CFG] prefs read failed (RO), retrying RW"));
    if (!prefs.begin("ott-fw", false)) {
      Serial.println(F("[CFG] prefs read failed (RW)"));
      return;
    }
  }
  NETWORK_APN = prefs.getString("apn", NETWORK_APN);
  // Note: JWT retiré - authentification par ICCID uniquement
  DEVICE_ICCID = prefs.getString("iccid", DEVICE_ICCID);
  DEVICE_SERIAL = prefs.getString("serial", DEVICE_SERIAL);
  
  // Réinitialiser le serial si c'est un ancien format (pas OTT-XX-XXX ni OTT-YY-NNN)
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
  SIM_PIN = prefs.getString("sim_pin", SIM_PIN);
  CAL_OVERRIDE_A0 = prefs.getFloat("cal_a0", NAN);
  CAL_OVERRIDE_A1 = prefs.getFloat("cal_a1", NAN);
  CAL_OVERRIDE_A2 = prefs.getFloat("cal_a2", NAN);
  configuredSleepMinutes = prefs.getUInt("sleep_min", configuredSleepMinutes);
  sendEveryNWakeups = prefs.getUChar("send_n_wake", 1);  // Par défaut: 1 (envoi à chaque wakeup)
  wakeupCounter = 0;  // Réinitialiser le compteur au boot
  airflowPasses = prefs.getUShort("flow_passes", airflowPasses);
  airflowSamplesPerPass = prefs.getUShort("flow_samples", airflowSamplesPerPass);
  airflowSampleDelayMs = prefs.getUShort("flow_delay", airflowSampleDelayMs);
  gpsEnabled = prefs.getBool("gps_enabled", false);
  watchdogTimeoutSeconds = prefs.getUInt("wdt_sec", watchdogTimeoutSeconds);
  modemBootTimeoutMs = prefs.getUInt("mdm_boot_ms", modemBootTimeoutMs);
  simReadyTimeoutMs = prefs.getUInt("sim_ready_ms", simReadyTimeoutMs);
  networkAttachTimeoutMs = prefs.getUInt("net_attach_ms", networkAttachTimeoutMs);
  modemMaxReboots = prefs.getUChar("mdm_reboots", modemMaxReboots);
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
  if (currentFirmwareVersion.isEmpty()) {
    currentFirmwareVersion = String(FIRMWARE_VERSION);
    saveConfig();
  }

  if (storedLogs.length()) {
    DynamicJsonDocument doc(2048);
    if (deserializeJson(doc, storedLogs) == DeserializationError::Ok) {
      JsonArray arr = doc.as<JsonArray>();
      for (JsonVariant v : arr) {
        PendingLog pl{
          v["lvl"].as<String>(),
          v["type"].isNull() ? String("firmware") : v["type"].as<String>(),
          v["msg"].as<String>()
        };
        offlineLogs.push_back(pl);
      }
    }
  }
}

void saveConfig()
{
  if (!prefs.begin("ott-fw", false)) {
    Serial.println(F("[CFG] prefs write failed"));
    return;
  }
  prefs.putString("apn", NETWORK_APN);
  // Note: JWT retiré - authentification par ICCID uniquement
  prefs.putString("iccid", DEVICE_ICCID);
  prefs.putString("serial", DEVICE_SERIAL);
  prefs.putString("sim_pin", SIM_PIN);
  prefs.putFloat("cal_a0", CAL_OVERRIDE_A0);
  prefs.putFloat("cal_a1", CAL_OVERRIDE_A1);
  prefs.putFloat("cal_a2", CAL_OVERRIDE_A2);
  prefs.putUInt("sleep_min", configuredSleepMinutes);
  prefs.putUChar("send_n_wake", sendEveryNWakeups);
  prefs.putUShort("flow_passes", airflowPasses);
  prefs.putUShort("flow_samples", airflowSamplesPerPass);
  prefs.putUShort("flow_delay", airflowSampleDelayMs);
  prefs.putBool("gps_enabled", gpsEnabled);
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

void updateCalibration(float a0, float a1, float a2)
{
  CAL_OVERRIDE_A0 = a0;
  CAL_OVERRIDE_A1 = a1;
  CAL_OVERRIDE_A2 = a2;
}

bool deserializePayload(const Command& cmd, DynamicJsonDocument& doc)
{
  if (cmd.payloadRaw.isEmpty()) {
    return false;
  }
  auto err = deserializeJson(doc, cmd.payloadRaw);
  return err == DeserializationError::Ok;
}

uint32_t extractSleepSeconds(const DynamicJsonDocument& payloadDoc)
{
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

bool parseUrl(const String& url, bool& secure, String& host, uint16_t& port, String& path)
{
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

void validateBootAndMarkStable()
{
  // Si une OTA était en cours, vérifier que le boot s'est bien passé
  if (otaInProgress) {
    Serial.println(F("[BOOT] OTA précédente détectée, validation du boot..."));
    
    // Vérifier que la version actuelle correspond à celle attendue
    String runningVersion = String(FIRMWARE_VERSION);
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

void checkBootFailureAndRollback()
{
  // Si le compteur d'échecs dépasse un seuil, tenter un rollback
  if (bootFailureCount >= 3) {
    Serial.println(F("[BOOT] Trop d'échecs de boot détectés, rollback..."));
    rollbackToPreviousFirmware();
    return;
  }
  
  // Si une OTA était en cours mais qu'on boot toujours sur l'ancienne version,
  // cela peut indiquer un problème
  if (otaInProgress && String(FIRMWARE_VERSION) == previousFirmwareVersion) {
    Serial.println(F("[BOOT] OTA en cours mais version inchangée, possible échec"));
    bootFailureCount++;
    saveConfig();
  }
}

void markFirmwareAsStable()
{
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

void rollbackToPreviousFirmware()
{
  Serial.println(F("[OTA] ROLLBACK: Tentative de restauration de la version précédente"));
  Serial.printf("[OTA] Version actuelle: %s\n", currentFirmwareVersion.c_str());
  Serial.printf("[OTA] Version précédente: %s\n", previousFirmwareVersion.c_str());
  
  if (previousFirmwareVersion.isEmpty()) {
    Serial.println(F("[OTA] Aucune version précédente disponible, rollback impossible"));
    sendLog("ERROR", "Rollback impossible: aucune version précédente", "ota");
    return;
  }
  
  // Note: Le rollback réel nécessiterait de reflasher l'ancienne partition OTA
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

bool performOtaUpdate(const String& url, const String& expectedMd5, const String& expectedVersion)
{
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
  String request = String("GET ") + path + " HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n";
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
bool getDeviceLocationFast(float* latitude, float* longitude)
{
  if (!modemReady || latitude == nullptr || longitude == nullptr) {
    return false; // Pas de log pour ne pas polluer
  }
  
  // Vérifier que le GPS est activé
  if (!gpsEnabled) {
    return false; // Pas de log pour ne pas polluer
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
bool getDeviceLocation(float* latitude, float* longitude)
{
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
