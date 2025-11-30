/**
 * ================================================================
 *  OTT Firmware v3.7 - Mode unifié
 * ================================================================
 * 
 * Fonctionnalités principales :
 *   - Mesure du débit d'oxygène, batterie, RSSI, GPS
 *   - Envoi automatique des mesures via OTA (réseau) et USB (si connecté)
 *   - Format unifié : identifiants + mesures + configuration dans chaque message
 *   - Mode hybride : envoi au boot + envoi sur changement de flux d'air
 *   - Configuration via USB (prioritaire) ou OTA
 *   - TinyGSM SIM7600 : GPRS, HTTPS, GPS
 *   - Persistence : APN/JWT/ICCID/PIN/calibration en NVS
 *   - Logs : POST /devices/logs + tampon NVS si réseau coupé
 *   - Commandes OTA : SET_SLEEP_SECONDS, UPDATE_CONFIG, UPDATE_CALIBRATION, OTA_REQUEST
 *   - Deep sleep : économie d'énergie quand inactif
 */

#define TINY_GSM_MODEM_SIM7600   // Indique à TinyGSM le modem utilisé
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
static constexpr uint32_t MODEM_BOOT_TIMEOUT_DEFAULT_MS = 15000;
static constexpr uint32_t SIM_READY_TIMEOUT_DEFAULT_MS = 30000;
static constexpr uint32_t NETWORK_ATTACH_TIMEOUT_DEFAULT_MS = 60000;
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
#ifndef OTT_DEFAULT_SERIAL
#define OTT_DEFAULT_SERIAL "OTT-PIERRE-001"
#endif
#ifndef OTT_DEFAULT_JWT
#define OTT_DEFAULT_JWT ""
#endif

// JWT (JSON Web Token) : Token d'authentification pour l'API
// - Utilisé pour authentifier le dispositif auprès du serveur lors des envois OTA (Over-The-Air)
// - Format : "Bearer xxxxx" ou simplement "xxxxx" (le préfixe "Bearer " est ajouté automatiquement)
// - Obtention : Généré par le dashboard/admin, envoyé au dispositif via commande UPDATE_CONFIG
// - Stockage : Sauvegardé en NVS (mémoire non-volatile) pour persister entre redémarrages
// - Important : Sans JWT, les envois de mesures via réseau (OTA) échoueront (mais USB fonctionne)
String SIM_PIN        = OTT_DEFAULT_SIM_PIN;
String NETWORK_APN    = OTT_DEFAULT_APN;
String DEVICE_ICCID   = OTT_DEFAULT_ICCID;
String DEVICE_SERIAL  = OTT_DEFAULT_SERIAL;
String DEVICE_JWT     = OTT_DEFAULT_JWT;  // Token d'authentification API (obligatoire pour OTA)

const char* API_HOST       = "ott-jbln.onrender.com";
const uint16_t API_PORT    = 443;
const char* API_PREFIX     = "/api.php";
const char* PATH_MEASURE   = "/devices/measurements";
const char* PATH_ACK       = "/devices/commands/ack";
const char* PATH_LOGS      = "/devices/logs";

// Version du firmware - stockée dans une section spéciale pour extraction depuis le binaire
// Cette constante sera visible dans le binaire compilé via une section .version
#define FIRMWARE_VERSION_STR "3.8-unified"
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
static uint16_t airflowPasses = 2;
static uint16_t airflowSamplesPerPass = 10;
static uint16_t airflowSampleDelayMs = 5;
static uint32_t watchdogTimeoutSeconds = WATCHDOG_TIMEOUT_DEFAULT_SEC;

// Variables pour mode hybride (détection changement flux)
static float lastFlowValue = 0.0;
static unsigned long lastMeasurementTime = 0;
static unsigned long lastOtaCheck = 0;
static const float FLOW_CHANGE_THRESHOLD = 0.5;  // Seuil de changement (L/min)
static const unsigned long MIN_INTERVAL_MS = 5000;  // Intervalle minimum entre mesures (5s)
static const unsigned long IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes sans changement → light sleep
static const unsigned long OTA_CHECK_INTERVAL_MS = 30000;  // Vérifier commandes OTA toutes les 30s
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

float measureBattery();
float measureAirflowRaw();
float airflowToLpm(float raw);

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

void setup()
{
  initSerial();
  Serial.println(F("\n[BOOT] ========================================"));
  Serial.printf("[BOOT] Firmware version: %s\n", FIRMWARE_VERSION);
  Serial.println(F("[BOOT] ========================================\n"));
  
  initBoard();
  loadConfig();
  
  // Vérifier si on doit faire un rollback (si le boot a échoué plusieurs fois)
  checkBootFailureAndRollback();
  
  // Valider le boot et marquer le firmware comme stable si c'est un boot réussi
  validateBootAndMarkStable();
  
  // Afficher l'état du JWT (JSON Web Token) au démarrage
  // Le JWT est un token d'authentification nécessaire pour envoyer des données via le réseau (OTA)
  // Sans JWT : seuls les envois USB fonctionnent (pour tests/développement)
  // Avec JWT : les envois OTA fonctionnent (production)
  if (DEVICE_JWT.isEmpty()) {
    Serial.println(F("[BOOT] ⚠️ JWT (token d'authentification) non configuré"));
    Serial.println(F("[BOOT] ⚠️ Les envois de mesures via réseau (OTA) peuvent échouer"));
    Serial.println(F("[BOOT] 💡 Configurez le JWT via commande UPDATE_CONFIG (OTA) ou USB"));
    Serial.println(F("[BOOT] 💡 Le JWT est obtenu depuis le dashboard/admin"));
  } else {
    Serial.printf("[BOOT] ✅ JWT configuré (longueur: %d caractères)\n", DEVICE_JWT.length());
  }
  
  configureWatchdog(watchdogTimeoutSeconds);
  feedWatchdog();
  logRuntimeConfig();

  // Toujours initialiser le modem - mode normal uniquement
  initModem();
  
  // Les identifiants et la configuration seront envoyés dans le premier message unifié

  // Démarrer le modem (activé par défaut)
  if (!startModem()) {
    Serial.println(F("[MODEM] indisponible → wake 1 min (envoi mesure annulé)"));
    goToSleep(1);
    return;
  }

  // Vérifier si USB est connecté (pas de deep sleep si USB connecté)
  bool usbConnected = Serial.availableForWrite() > 0;
  
  if (usbConnected) {
    // Mode continu : envoi de données en boucle (pas de deep sleep)
    Serial.println(F("🔌 USB connecté - Mode continu activé"));
    
    uint32_t sequence = 0;
    uint32_t intervalMs = 1000; // 1 seconde par défaut
    
    // Envoyer immédiatement un message unifié avec identifiants, config et première mesure
    {
      Measurement m = captureSensorSnapshot();
      int8_t csq = modem.getSignalQuality();
      int8_t rssi = (csq == 99) ? -999 : (csq == 0) ? -113 : (csq == 1) ? -111 : (-110 + (csq * 2));
      m.rssi = rssi;
      float latitude = 0.0, longitude = 0.0;
      bool hasLocation = getDeviceLocation(&latitude, &longitude);
      emitDebugMeasurement(m, sequence, intervalMs, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr);
    }
    
    while (true) {
      feedWatchdog();
      
      // Vérifier si USB toujours connecté
      if (Serial.availableForWrite() == 0) {
        Serial.println(F("🔌 USB déconnecté"));
        break;
      }
      
      // Capturer une mesure
      Measurement m = captureSensorSnapshot();
      
      // Obtenir RSSI
      int8_t csq = modem.getSignalQuality();
      if (csq == 99) {
        m.rssi = -999;
      } else if (csq == 0) {
        m.rssi = -113;
      } else if (csq == 1) {
        m.rssi = -111;
      } else {
        m.rssi = -110 + (csq * 2);
      }
      
      // Obtenir position GPS (activé par défaut)
      float latitude = 0.0, longitude = 0.0;
      bool hasLocation = getDeviceLocation(&latitude, &longitude);
      
      // Envoyer via USB (format JSON) - TOUTES les données toutes les secondes
      emitDebugMeasurement(m, ++sequence, intervalMs, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr);
      
      // Envoyer via réseau (si connecté) - TOUTES les données toutes les secondes
      if (modemReady && modem.isNetworkConnected()) {
        sendMeasurement(m, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr, "USB_STREAM");
        
        // Vérifier périodiquement les commandes OTA (toutes les 30 secondes)
        static unsigned long lastOtaCheck = 0;
        unsigned long now = millis();
        if (now - lastOtaCheck >= 30000) { // Vérifier toutes les 30 secondes
          lastOtaCheck = now;
          Command cmds[5];
          int count = fetchCommands(cmds, 5);
          if (count > 0) {
            Serial.printf("📡 %d commande(s) OTA en attente (appliquées après déconnexion USB)\n", count);
          }
        }
      }
      
      // Traiter les commandes série si disponibles
      static String commandBuffer = "";
      while (Serial.available()) {
        char incoming = Serial.read();
        if (incoming == '\r') continue;
        if (incoming == '\n') {
          commandBuffer.trim();
          if (commandBuffer.length() > 0) {
            // Gérer les commandes spéciales
            String lowered = commandBuffer;
            lowered.toLowerCase();
            if (lowered.startsWith("interval=")) {
              long requested = lowered.substring(9).toInt();
              if (requested >= 200 && requested <= 10000) {
                intervalMs = requested;
                Serial.printf("✅ Intervalle: %lu ms\n", static_cast<unsigned long>(intervalMs));
              }
            } else {
              handleSerialCommand(commandBuffer);
            }
          }
          commandBuffer = "";
        } else {
          commandBuffer += incoming;
          if (commandBuffer.length() > 128) commandBuffer = "";
        }
      }
      
      // Attendre avant la prochaine mesure
      delay(intervalMs);
    }
  }
  
  // Mode normal (pas d'USB) : Mode hybride avec détection changement
  Serial.println(F("[MODE] Mode hybride activé - Surveillance continue du flux"));
  
  // ✅ ENVOI AU RESET HARD (mesure initiale)
  Serial.println(F("[BOOT] 📤 Envoi mesure initiale (reset hard)"));
  Measurement mInit = captureSensorSnapshot();
  
  // Obtenir RSSI
  int8_t csq = modem.getSignalQuality();
  if (csq == 99) {
    mInit.rssi = -999;
  } else if (csq == 0) {
    mInit.rssi = -113;
  } else if (csq == 1) {
    mInit.rssi = -111;
  } else {
    mInit.rssi = -110 + (csq * 2);
  }
  
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
  
  // Ne pas faire deep sleep, continuer en mode actif (loop())
}

void loop()
{
  feedWatchdog();
  
  // Lire le capteur (optimisé : lecture directe sans mesure complète si pas de changement)
  float currentFlowRaw = measureAirflowRaw();
  float currentFlow = airflowToLpm(currentFlowRaw);
  
  // Calculer le changement
  float flowChange = abs(currentFlow - lastFlowValue);
  
  // Vérifier si changement significatif ET intervalle minimum respecté
  unsigned long now = millis();
  bool shouldMeasure = false;
  
  if (flowChange > FLOW_CHANGE_THRESHOLD && (now - lastMeasurementTime >= MIN_INTERVAL_MS)) {
    shouldMeasure = true;
    Serial.printf("[SENSOR] ⚡ Changement détecté: %.2f → %.2f L/min (Δ=%.2f)\n",
                  lastFlowValue, currentFlow, flowChange);
  }
  
  // Si changement détecté, mesurer et envoyer
  if (shouldMeasure) {
    // Activer modem si nécessaire
    if (!modemReady) {
      if (startModem()) {
        Serial.println(F("[MODEM] Modem activé pour envoi"));
      }
    }
    
    // Capturer mesure complète
    Measurement m = captureSensorSnapshot();
    
    // Obtenir RSSI (si modem actif)
    if (modemReady && modem.isNetworkConnected()) {
      int8_t csq = modem.getSignalQuality();
      if (csq == 99) {
        m.rssi = -999;
      } else if (csq == 0) {
        m.rssi = -113;
      } else if (csq == 1) {
        m.rssi = -111;
      } else {
        m.rssi = -110 + (csq * 2);
      }
    } else {
      m.rssi = -999;
    }
    
    // Obtenir GPS (si disponible)
    float latitude = 0.0, longitude = 0.0;
    bool hasLocation = getDeviceLocation(&latitude, &longitude);
    
    // Envoyer immédiatement
    bool sent = sendMeasurement(m, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr, "EVENT");
    
    if (sent) {
      lastFlowValue = currentFlow;
      lastMeasurementTime = now;
      Serial.printf("[SENSOR] ✅ Mesure envoyée (flow=%.2f L/min, batt=%.1f%%, rssi=%d dBm)\n", 
                    m.flow, m.battery, m.rssi);
    } else {
      Serial.println(F("[SENSOR] ⚠️ Échec envoi, réessai au prochain changement"));
    }
    
    // Traiter les commandes OTA périodiquement
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
  } else {
    // Pas de changement détecté
    unsigned long idleTime = now - lastMeasurementTime;
    
    // Si inactif depuis X minutes, passer en light sleep
    if (idleTime > IDLE_TIMEOUT_MS && modemReady) {
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
  delay(2600);
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);
}

bool startModem()
{
  Serial.println(F("[MODEM] start"));
  uint8_t rebootCount = 0;
  while (true) {
    unsigned long start = millis();
    while (!modem.testAT(1000)) {
      Serial.print('.');
      feedWatchdog();
      if (millis() - start > modemBootTimeoutMs) {
        Serial.println(F("\n[MODEM] pas de reponse AT"));
        if (++rebootCount > modemMaxReboots) {
          sendLog("ERROR", "Modem unresponsive");
          return false;
        }
        Serial.println(F("[MODEM] toggling PWRKEY"));
        digitalWrite(BOARD_PWRKEY_PIN, LOW);
        delay(100);
        digitalWrite(BOARD_PWRKEY_PIN, HIGH);
        delay(1000);
        digitalWrite(BOARD_PWRKEY_PIN, LOW);
        break;
      }
    }
    if (modem.testAT()) {
      Serial.println();
      Serial.println(F("[MODEM] AT OK"));
      break;
    }
    feedWatchdog();
  }

  if (!waitForSimReady(simReadyTimeoutMs)) {
    Serial.println(F("[MODEM] SIM non prête"));
    sendLog("ERROR", "SIM not ready");
    return false;
  }
  Serial.println(F("[MODEM] SIM prête"));
  
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
  Serial.printf("[MODEM] APN=%s (type: IP pour internet)\n", NETWORK_APN.c_str());

  if (!attachNetwork(networkAttachTimeoutMs)) {
    Serial.println(F("[MODEM] réseau indisponible"));
    sendLog("ERROR", "Network unavailable");
    return false;
  }
  Serial.println(F("[MODEM] réseau attaché"));
  if (!connectData(networkAttachTimeoutMs)) {
    Serial.println(F("[MODEM] GPRS KO"));
    sendLog("ERROR", "GPRS connection failed");
    return false;
  }
  Serial.println(F("[MODEM] session data active"));

#ifdef TINY_GSM_MODEM_SIM7600
  // TLS géré par le modem SIM7600 (certificats chargés côté module)
#else
  netClient.setInsecure();
#endif
  modemReady = true;
  flushOfflineLogs();
  sendLog("INFO", "Modem connecté");
  return true;
}

void stopModem()
{
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
  Serial.println(F("[CFG] ---------"));
  Serial.printf("[CFG] sleep=%lu min | airflow=%u x %u @ %u ms\n",
                static_cast<unsigned long>(configuredSleepMinutes),
                airflowPasses,
                airflowSamplesPerPass,
                airflowSampleDelayMs);
  Serial.printf("[CFG] WDT=%lus | APN=%s | SIM pin=%s\n",
                watchdogTimeoutSeconds,
                NETWORK_APN.c_str(),
                SIM_PIN.length() ? SIM_PIN.c_str() : "<none>");
  Serial.printf("[CFG] OTA primary=%s\n", otaPrimaryUrl.isEmpty() ? "<unset>" : otaPrimaryUrl.c_str());
  Serial.println(F("[CFG] ---------"));
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
  doc["type"] = "usb_stream";  // Compatibilité
  doc["seq"] = sequence;
  
  // Identifiants
  doc["sim_iccid"] = DEVICE_ICCID;
  doc["device_serial"] = DEVICE_SERIAL;
  doc["firmware_version"] = FIRMWARE_VERSION;
  
  // Calculer device_name
  String deviceName = "OTT-";
  if (DEVICE_ICCID.length() >= 4) {
    deviceName += DEVICE_ICCID.substring(DEVICE_ICCID.length() - 4);
  } else if (DEVICE_SERIAL.length() >= 4) {
    deviceName += DEVICE_SERIAL.substring(DEVICE_SERIAL.length() - 4);
  } else {
    deviceName += "XXXX";
  }
  doc["device_name"] = deviceName;
  
  // Mesures principales
  doc["flow_lpm"] = m.flow;
  doc["flowrate"] = m.flow;  // Compatibilité
  doc["battery_percent"] = m.battery;
  doc["battery"] = m.battery;  // Compatibilité
  doc["rssi"] = m.rssi;
  doc["signal_strength"] = m.rssi;  // Compatibilité
  
  // Position GPS/réseau cellulaire
  if (latitude != nullptr && longitude != nullptr) {
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
  serializeJson(doc, Serial);
  Serial.println();  // Nouvelle ligne pour terminer le JSON
  Serial.flush();     // Forcer l'envoi immédiat (assure que le JSON complet est envoyé)
  
  // Message de debug simplifié (seulement toutes les 10 mesures pour réduire le bruit)
  if (sequence % 10 == 0) {
    if (latitude != nullptr && longitude != nullptr) {
      Serial.printf("[#%lu] 💧%.2f L/min | 🔋%.0f%% | 📡%d dBm | 📍%.4f,%.4f\n",
                    static_cast<unsigned long>(sequence),
                    m.flow,
                    m.battery,
                    m.rssi,
                    *latitude,
                    *longitude);
    } else {
      Serial.printf("[#%lu] 💧%.2f L/min | 🔋%.0f%% | 📡%d dBm\n",
                    static_cast<unsigned long>(sequence),
                    m.flow,
                    m.battery,
                    m.rssi);
    }
  }
}


// Gérer les commandes série (config, calibration, etc.)
void handleSerialCommand(const String& command)
{
  String lowered = command;
  lowered.toLowerCase();
  
  // Commande config {...} - Configuration directe via USB
  if (lowered.startsWith("config ")) {
    String jsonPayload = command.substring(7);
    jsonPayload.trim();
    
    StaticJsonDocument<512> payloadDoc;
    DeserializationError error = deserializeJson(payloadDoc, jsonPayload);
    
    if (error) {
      Serial.printf("❌ Erreur JSON: %s\n", error.c_str());
    } else {
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
      
      if (configUpdated) {
        saveConfig();
        Serial.printf("✅ Config: ⏰%lu min | ⏱️%lu ms\n",
                      static_cast<unsigned long>(configuredSleepMinutes),
                      static_cast<unsigned long>(airflowSampleDelayMs));
      }
    }
          return;
        }

  // Commande calibration {...} - Calibration directe via USB
  if (lowered.startsWith("calibration ")) {
    String jsonPayload = command.substring(12);
    jsonPayload.trim();
    
    StaticJsonDocument<256> payloadDoc;
    DeserializationError error = deserializeJson(payloadDoc, jsonPayload);
    
    if (error) {
      Serial.printf("❌ Erreur JSON: %s\n", error.c_str());
          } else {
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
  // Convertir CSQ en dBm pour affichage
  int16_t rssi_dbm = (csq == 99) ? -999 : (csq == 0) ? -113 : (csq == 1) ? -111 : (-110 + (csq * 2));
  String oper = modem.getOperator();
  bool eps = modem.isNetworkConnected();
  bool gprs = modem.isGprsConnected();

  Serial.printf("[MODEM][%s] CSQ=%d (RSSI=%d dBm) reg=%d (%s) oper=%s eps=%s gprs=%s\n",
                stage,
                csq,
                rssi_dbm,
                reg,
                regStatusToString(reg),
                oper.length() ? oper.c_str() : "<n/a>",
                eps ? "ok" : "KO",
                gprs ? "ok" : "KO");
  
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
}

bool waitForSimReady(uint32_t timeoutMs)
{
  unsigned long start = millis();
  Serial.println(F("[MODEM] attente SIM"));
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
  
  while (millis() - start < timeoutMs && retryCount < maxRetries) {
    feedWatchdog();
    
    // Vérifier si déjà connecté
    if (modem.isNetworkConnected()) {
      logRadioSnapshot("attach:success");
      return true;
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
          delay(2000); // Attendre que l'APN soit appliqué
          feedWatchdog();
        }
      }
    }
    
    // Attendre l'enregistrement réseau
    if (modem.waitForNetwork(10000)) {
      logRadioSnapshot("attach:event");
      return true;
    }
    
    // Log du statut actuel
    Serial.printf("[MODEM] attente réseau... (tentative %d/%d)\n", retryCount + 1, maxRetries);
    logRadioSnapshot("attach:retry");
    
    // Backoff exponentiel : délai augmente à chaque retry
    uint32_t delayMs = baseDelay * (1 << retryCount); // 5s, 10s, 20s...
    if (delayMs > 30000) delayMs = 30000; // Max 30 secondes
    Serial.printf("[MODEM] Attente %lu ms avant prochaine tentative...\n", delayMs);
    delay(delayMs);
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
      return true;
    }
    
    Serial.printf("[MODEM] ❌ Échec connexion GPRS avec APN: %s\n", currentApn.c_str());
    logRadioSnapshot("data:retry");
    
    // Essayer l'APN suivant après un délai
    apnIndex++;
    if (apnIndex < maxApnAttempts) {
      Serial.println(F("[MODEM] Essai avec APN suivant..."));
      delay(3000);
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

float measureBattery()
{
  // Lecture brute de l'ADC (0-4095 pour 0-3.3V sur ESP32)
  int raw = analogRead(BATTERY_ADC_PIN);
  float voltage = (raw / 4095.0f) * 3.3f;
  
  // ⚠️ AMÉLIORATION NÉCESSAIRE : Cette formule est simpliste
  // Pour une batterie LiPo typique (1 cellule = 3.0V à 4.2V) :
  // - 3.0V = 0% (décharge complète)
  // - 4.2V = 100% (charge complète)
  // Mais il faut tenir compte du diviseur de tension si présent sur le PCB
  // 
  // Formule actuelle (temporaire) : suppose 0-3.3V = 0-100%
  // TODO: Calibrer avec un voltmètre réel et ajuster selon le diviseur de tension
  float pct = (voltage / 3.3f) * 100.0f;
  
  // Limiter à 0-100%
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  
  Serial.printf("[SENSOR] Batterie ADC=%d (%.3fV) = %.1f%%\n", raw, voltage, pct);
  return pct;
}

float measureAirflowRaw()
{
  float total = 0;
  uint16_t passes = std::max<uint16_t>(static_cast<uint16_t>(1), airflowPasses);
  uint16_t samples = std::max<uint16_t>(static_cast<uint16_t>(1), airflowSamplesPerPass);
  uint32_t totalSamples = static_cast<uint32_t>(passes) * static_cast<uint32_t>(samples);
  Serial.printf("[SENSOR] Airflow passes=%u samples/passe=%u delay=%ums\n", passes, samples, airflowSampleDelayMs);
  for (uint16_t ii = 0; ii < passes; ++ii) {
    feedWatchdog();
    for (uint16_t i = 0; i < samples; ++i) {
      total += analogRead(SENSOR_PIN);
      delay(airflowSampleDelayMs);
      feedWatchdog();
    }
  }
  Serial.printf("[SENSOR] Airflow raw=%.1f\n", totalSamples > 0 ? total / static_cast<float>(totalSamples) : 0.0f);
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

// Construire l'en-tête d'authentification HTTP avec le JWT
// Le JWT (JSON Web Token) est utilisé pour authentifier le dispositif auprès de l'API
// Format de l'en-tête : "Authorization: Bearer <token>"
String buildAuthHeader()
{
  if (DEVICE_JWT.isEmpty()) {
    return String();  // Pas de JWT = pas d'authentification (envoi échouera probablement)
  }
  // Ajouter le préfixe "Bearer " si absent (format standard HTTP)
  if (DEVICE_JWT.startsWith("Bearer ")) {
    return DEVICE_JWT;
  }
  return "Bearer " + DEVICE_JWT;
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
  } else {
    Serial.println(F("[HTTP] ⚠️ Pas de JWT - l'authentification peut échouer"));
  }
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
  // Envoyer TOUS les paramètres possibles (format unifié)
  DynamicJsonDocument doc(1024);  // Augmenté pour tous les paramètres
  
  // Mode et type (pour format unifié)
  // Pour OTA, on utilise le status comme mode (BOOT, EVENT, TIMER, USB_STREAM)
  doc["mode"] = status;  // BOOT, EVENT, TIMER, USB_STREAM
  doc["type"] = "ota_measurement";  // Pour distinguer OTA de USB
  doc["status"] = status;  // Compatibilité
  
  // Identifiants
  doc["sim_iccid"] = DEVICE_ICCID;
  doc["device_serial"] = DEVICE_SERIAL;
  doc["firmware_version"] = FIRMWARE_VERSION;
  
  // Calculer device_name
  String deviceName = "OTT-";
  if (DEVICE_ICCID.length() >= 4) {
    deviceName += DEVICE_ICCID.substring(DEVICE_ICCID.length() - 4);
  } else if (DEVICE_SERIAL.length() >= 4) {
    deviceName += DEVICE_SERIAL.substring(DEVICE_SERIAL.length() - 4);
  } else {
    deviceName += "XXXX";
  }
  doc["device_name"] = deviceName;
  
  // Mesures principales
  doc["flow_lpm"] = m.flow;  // Format unifié (prioritaire)
  doc["flowrate"] = m.flow;  // Compatibilité
  doc["battery_percent"] = m.battery;  // Format unifié (prioritaire)
  doc["battery"] = m.battery;  // Compatibilité
  doc["rssi"] = m.rssi;
  doc["signal_strength"] = m.rssi; // Compatibilité format V1
  
  // Position GPS/réseau cellulaire
  if (latitude != nullptr && longitude != nullptr) {
    doc["latitude"] = *latitude;
    doc["longitude"] = *longitude;
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
  
  // Vérifier si JWT (token d'authentification) est configuré
  // Sans JWT, l'API refusera probablement la requête (401 Unauthorized)
  if (DEVICE_JWT.isEmpty()) {
    Serial.println(F("[API] ⚠️ JWT (token d'authentification) non configuré - l'envoi OTA peut échouer"));
    Serial.println(F("[API] 💡 Configurez le JWT via UPDATE_CONFIG pour activer les envois OTA"));
  }
  
  String apiResponse;
  bool ok = httpPost(PATH_MEASURE, body, &apiResponse);
  
  // Afficher le résultat détaillé via USB
  if (ok) {
    Serial.printf("[API] ✅ Mesure envoyée avec succès\n");
    if (apiResponse.length() > 0) {
      Serial.printf("[API] Réponse: %s\n", apiResponse.c_str());
    }
    sendLog("INFO", "Measurement posted successfully", "measurements");
  } else {
    Serial.printf("[API] ❌ Échec envoi mesure\n");
    if (apiResponse.length() > 0) {
      Serial.printf("[API] Erreur: %s\n", apiResponse.c_str());
    }
    sendLog("ERROR", "Measurement failed: " + apiResponse, "measurements");
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
  DynamicJsonDocument doc(256);
  doc["device_sim_iccid"] = DEVICE_ICCID;
  doc["command_id"] = cmd.id;
  doc["status"] = success ? "executed" : "error";
  doc["message"] = message;
  String body;
  serializeJson(doc, body);
  return httpPost(PATH_ACK, body);
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
  DynamicJsonDocument payloadDoc(512);
  bool hasPayload = deserializePayload(cmd, payloadDoc);

  if (cmd.verb == "SET_SLEEP_SECONDS") {
    uint32_t requestedSeconds = hasPayload ? extractSleepSeconds(payloadDoc) : 0;
    uint32_t requestedMinutes = requestedSeconds > 0 ? requestedSeconds / 60 : 0;
    nextSleepMinutes = std::max<uint32_t>(static_cast<uint32_t>(1), requestedMinutes);
    acknowledgeCommand(cmd, true, "Sleep updated");
    sendLog("INFO", "Sleep interval set to " + String(nextSleepMinutes) + " min", "commands");
  } else if (cmd.verb == "PING") {
    acknowledgeCommand(cmd, true, "pong");
    sendLog("INFO", "PING command répondu", "commands");
  } else if (cmd.verb == "UPDATE_CONFIG") {
    if (!hasPayload) {
      acknowledgeCommand(cmd, false, "missing payload");
      sendLog("WARN", "UPDATE_CONFIG sans payload", "commands");
      return;
    }
    if (payloadDoc.containsKey("apn")) {
      NETWORK_APN = payloadDoc["apn"].as<String>();
    }
    // Configuration du JWT (JSON Web Token) - Token d'authentification pour l'API
    // Le JWT permet au dispositif de s'authentifier auprès du serveur lors des envois OTA
    // Format attendu : {"jwt": "Bearer xxxxx"} ou {"jwt": "xxxxx"} (le préfixe "Bearer " est optionnel)
    // Le JWT est obtenu depuis le dashboard/admin et doit être unique par dispositif
    if (payloadDoc.containsKey("jwt")) {
      DEVICE_JWT = payloadDoc["jwt"].as<String>();
    }
    if (payloadDoc.containsKey("iccid")) {
      DEVICE_ICCID = payloadDoc["iccid"].as<String>();
    }
    if (payloadDoc.containsKey("serial")) {
      DEVICE_SERIAL = payloadDoc["serial"].as<String>();
    }
    if (payloadDoc.containsKey("sim_pin")) {
      SIM_PIN = payloadDoc["sim_pin"].as<String>();
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
    if (payloadDoc.containsKey("ota_primary_url")) {
      otaPrimaryUrl = payloadDoc["ota_primary_url"].as<String>();
    }
    if (payloadDoc.containsKey("ota_fallback_url")) {
      otaFallbackUrl = payloadDoc["ota_fallback_url"].as<String>();
    }
    if (payloadDoc.containsKey("ota_md5")) {
      otaExpectedMd5 = payloadDoc["ota_md5"].as<String>();
    }
    saveConfig();
    acknowledgeCommand(cmd, true, "config updated");
    sendLog("INFO", "Configuration mise à jour à distance", "commands");
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
    updateCalibration(payloadDoc["a0"].as<float>(), payloadDoc["a1"].as<float>(), payloadDoc["a2"].as<float>());
    saveConfig();
    acknowledgeCommand(cmd, true, "calibration updated");
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
    
    sendLog("INFO", "OTA request: " + url + (expectedVersion.length() ? " (v" + expectedVersion + ")" : ""), "ota");
    if (performOtaUpdate(url, md5, expectedVersion)) {
      acknowledgeCommand(cmd, true, "ota applied");
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
  DEVICE_JWT  = prefs.getString("jwt", DEVICE_JWT);
  DEVICE_ICCID = prefs.getString("iccid", DEVICE_ICCID);
  DEVICE_SERIAL = prefs.getString("serial", DEVICE_SERIAL);
  SIM_PIN = prefs.getString("sim_pin", SIM_PIN);
  CAL_OVERRIDE_A0 = prefs.getFloat("cal_a0", NAN);
  CAL_OVERRIDE_A1 = prefs.getFloat("cal_a1", NAN);
  CAL_OVERRIDE_A2 = prefs.getFloat("cal_a2", NAN);
  configuredSleepMinutes = prefs.getUInt("sleep_min", configuredSleepMinutes);
  airflowPasses = prefs.getUShort("flow_passes", airflowPasses);
  airflowSamplesPerPass = prefs.getUShort("flow_samples", airflowSamplesPerPass);
  airflowSampleDelayMs = prefs.getUShort("flow_delay", airflowSampleDelayMs);
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
  prefs.putString("jwt", DEVICE_JWT);
  prefs.putString("iccid", DEVICE_ICCID);
  prefs.putString("serial", DEVICE_SERIAL);
  prefs.putString("sim_pin", SIM_PIN);
  prefs.putFloat("cal_a0", CAL_OVERRIDE_A0);
  prefs.putFloat("cal_a1", CAL_OVERRIDE_A1);
  prefs.putFloat("cal_a2", CAL_OVERRIDE_A2);
  prefs.putUInt("sleep_min", configuredSleepMinutes);
  prefs.putUShort("flow_passes", airflowPasses);
  prefs.putUShort("flow_samples", airflowSamplesPerPass);
  prefs.putUShort("flow_delay", airflowSampleDelayMs);
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
  bool secure = true;
  String host;
  String path;
  uint16_t port = 443;
  if (!parseUrl(url, secure, host, port, path)) {
    Serial.println(F("[OTA] URL invalide"));
    return false;
  }

  Client* client = secure ? static_cast<Client*>(&netClient) : static_cast<Client*>(&plainNetClient);
  if (client->connected()) {
    client->stop();
    delay(50);
  }
  Serial.printf("[OTA] Connexion %s:%u%s\n", host.c_str(), port, secure ? " (TLS)" : "");
  if (!client->connect(host.c_str(), port)) {
    Serial.println(F("[OTA] Connexion impossible"));
    return false;
  }

  String request = String("GET ") + path + " HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n";
  client->print(request);

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
    Serial.printf("[OTA] HTTP %d\n", status);
    client->stop();
    return false;
  }

  if (contentLength == 0) {
    contentLength = UPDATE_SIZE_UNKNOWN;
  }
  if (!Update.begin(contentLength)) {
    Serial.println(F("[OTA] Update.begin KO"));
    client->stop();
    return false;
  }
  if (expectedMd5.length() == 32) {
    Update.setMD5(expectedMd5.c_str());
    Serial.printf("[OTA] MD5 attendu: %s\n", expectedMd5.c_str());
  } else {
    Serial.println(F("[OTA] Avertissement: pas de MD5 fourni"));
  }
  
  if (expectedVersion.length() > 0) {
    Serial.printf("[OTA] Version attendue: %s\n", expectedVersion.c_str());
  }

  uint8_t buffer[512];
  size_t written = 0;
  unsigned long lastRead = millis();
  while (client->connected() || client->available()) {
    int len = client->read(buffer, sizeof(buffer));
    if (len > 0) {
      if (Update.write(buffer, len) != len) {
        Serial.println(F("[OTA] Write stream KO"));
        client->stop();
        Update.end();
        return false;
      }
      written += len;
      lastRead = millis();
      feedWatchdog();
    } else {
      if (millis() - lastRead > OTA_STREAM_TIMEOUT_MS) {
        Serial.println(F("[OTA] Timeout flux"));
        client->stop();
        Update.end();
        return false;
      }
      delay(10);
    }
  }
  client->stop();

  if (!Update.end()) {
    Serial.println(F("[OTA] Fin update KO"));
    Update.printError(Serial);
    return false;
  }
  if (!Update.isFinished()) {
    Serial.println(F("[OTA] Flash incomplet"));
    return false;
  }
  
  Serial.printf("[OTA] %u octets flashés avec succès\n", static_cast<unsigned>(written));
  
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
 * Obtient la position du dispositif via GPS ou réseau cellulaire.
 * 
 * IMPORTANT: Le GPS est intégré au modem SIM7600, donc il nécessite que le modem soit démarré.
 * On ne peut pas utiliser le GPS sans démarrer le modem car c'est le même composant matériel.
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
  
  // Essayer d'abord le GPS (plus précis mais peut être plus lent)
  float lat = 0.0, lon = 0.0;
  float speed = 0.0, alt = 0.0;
  int vsat = 0, usat = 0;
  float accuracy = 0.0;
  
  // Tentative GPS avec timeout de 10 secondes
  Serial.println(F("[GPS] Tentative GPS..."));
  unsigned long gpsStart = millis();
  bool gpsSuccess = false;
  
  // Essayer jusqu'à 3 fois avec timeout de 10s par tentative
  for (int attempt = 0; attempt < 3 && !gpsSuccess && (millis() - gpsStart) < 10000; attempt++) {
    if (modem.getGPS(&lat, &lon, &speed, &alt, &vsat, &usat, &accuracy)) {
      // Valider les coordonnées (latitude: -90 à 90, longitude: -180 à 180)
      if (lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0 && 
          lat != 0.0 && lon != 0.0) { // Exclure 0,0 (souvent une erreur)
        *latitude = lat;
        *longitude = lon;
        Serial.printf("[GPS] Position GPS obtenue: %.6f, %.6f (précision: %.1fm, satellites: %d)\n", 
                      lat, lon, accuracy, usat);
        gpsSuccess = true;
        return true;
      }
    }
    delay(500); // Attendre un peu entre les tentatives
    feedWatchdog();
  }
  
  // Si GPS échoue, essayer la localisation réseau cellulaire (plus rapide mais moins précis)
  Serial.println(F("[GPS] GPS indisponible, tentative réseau cellulaire..."));
  lat = 0.0;
  lon = 0.0;
  float gsmAccuracy = 0.0;
  
  if (modem.getGsmLocation(&lat, &lon, &gsmAccuracy)) {
    // Valider les coordonnées
    if (lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0 && 
        lat != 0.0 && lon != 0.0) {
      *latitude = lat;
      *longitude = lon;
      Serial.printf("[GPS] Position réseau cellulaire obtenue: %.6f, %.6f (précision: %.0fm)\n", 
                    lat, lon, gsmAccuracy);
      return true;
    }
  }
  
  Serial.println(F("[GPS] Aucune position disponible (GPS et réseau cellulaire échoués)"));
  return false;
}
