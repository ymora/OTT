/**
 * ================================================================
 *  OTT Firmware v3.1-gps - Reconstruction complète + GPS
 * ================================================================
 * Objectifs :
 *   - Mesurer le débit d'oxygène + la batterie et publier la mesure
 *   - Consommer les commandes descendantes émises depuis le dashboard
 *   - Journaliser localement ou côté API chaque événement important
 *   - Autoriser la reconfiguration complète d'un boîtier sans reflasher
 *   - Envoyer la position GPS/réseau cellulaire avec chaque mesure
 *
 * Nouveautés majeures :
 *   - TinyGSM SIM7600 : init matériel, gestion SIM/PIN, GPRS, HTTPS
 *   - Commandes : SET_SLEEP_SECONDS, PING, UPDATE_CONFIG, UPDATE_CALIBRATION
 *   - Persistence : APN/JWT/ICCID/PIN/calibration stockés en NVS (Preferences)
 *   - Logs : POST /devices/logs + tampon en NVS quand le réseau est coupé
 *   - Payloads mesures enrichis (firmware_version, RSSI, latitude, longitude)
 *   - Géolocalisation : GPS (priorité) ou réseau cellulaire (fallback) inclus dans chaque mesure
 *
 * Toutes les sections ci-dessous sont abondamment commentées pour guider
 * la maintenance ou l'extension (ex. ajout d'une commande OTA_REQUEST).
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

static constexpr uint32_t DEFAULT_SLEEP_MINUTES = 5;
static constexpr uint8_t  MAX_COMMANDS = 4;
static constexpr uint32_t MODEM_BOOT_TIMEOUT_DEFAULT_MS = 15000;
static constexpr uint32_t SIM_READY_TIMEOUT_DEFAULT_MS = 30000;
static constexpr uint32_t NETWORK_ATTACH_TIMEOUT_DEFAULT_MS = 60000;
static constexpr uint8_t  MODEM_MAX_REBOOTS_DEFAULT = 3;
static constexpr uint32_t WATCHDOG_TIMEOUT_DEFAULT_SEC = 30;
static constexpr uint8_t  MIN_WATCHDOG_TIMEOUT_SEC = 5;
static constexpr uint32_t OTA_STREAM_TIMEOUT_MS = 20000;
static constexpr uint32_t USB_STREAM_DEFAULT_INTERVAL_MS = 1000;
static constexpr uint32_t USB_STREAM_MIN_INTERVAL_MS = 200;
static constexpr uint32_t USB_STREAM_MAX_INTERVAL_MS = 10000;
static constexpr uint32_t USB_HANDSHAKE_WINDOW_MS = 3500;

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

String SIM_PIN        = OTT_DEFAULT_SIM_PIN;
String NETWORK_APN    = OTT_DEFAULT_APN;
String DEVICE_ICCID   = OTT_DEFAULT_ICCID;
String DEVICE_SERIAL  = OTT_DEFAULT_SERIAL;
String DEVICE_JWT     = OTT_DEFAULT_JWT;

const char* API_HOST       = "ott-jbln.onrender.com";
const uint16_t API_PORT    = 443;
const char* API_PREFIX     = "/api.php";
const char* PATH_MEASURE   = "/devices/measurements";
const char* PATH_ACK       = "/devices/commands/ack";
const char* PATH_LOGS      = "/devices/logs";

// Version du firmware - stockée dans une section spéciale pour extraction depuis le binaire
// Cette constante sera visible dans le binaire compilé via une section .version
#define FIRMWARE_VERSION_STR "3.1-gps"
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

bool sendMeasurement(const Measurement& m, float* latitude = nullptr, float* longitude = nullptr);
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
bool detectUsbStreamingMode();
void usbStreamingLoop();
void emitUsbMeasurement(const Measurement& m, uint32_t sequence, uint32_t intervalMs);
void printUsbStreamHelp(uint32_t intervalMs);
bool getDeviceLocation(float* latitude, float* longitude);

void setup()
{
  initSerial();
  Serial.println(F("\n[BOOT] ========================================"));
  Serial.printf("[BOOT] Firmware version: %s\n", FIRMWARE_VERSION);
  Serial.println(F("[BOOT] ========================================\n"));
  
  initBoard();
  initModem();
  loadConfig();
  
  // Vérifier si on doit faire un rollback (si le boot a échoué plusieurs fois)
  checkBootFailureAndRollback();
  
  // Valider le boot et marquer le firmware comme stable si c'est un boot réussi
  validateBootAndMarkStable();
  
  configureWatchdog(watchdogTimeoutSeconds);
  feedWatchdog();
  logRuntimeConfig();

  if (detectUsbStreamingMode()) {
    usbStreamingLoop();
    Serial.println(F("[USB] Redémarrage pour reprendre le cycle normal..."));
    delay(100);
    ESP.restart();
  }

  Measurement m = captureSensorSnapshot();
  Serial.printf("[MEASURE] pré-mesure flow=%.2f L/min, batt=%.1f%% (RSSI en attente)\n", m.flow, m.battery);

  if (!startModem()) {
    Serial.println(F("[MODEM] indisponible → wake 1 min (envoi mesure annulé)"));
    goToSleep(1);
    return;
  }

  m.rssi = modem.getSignalQuality();
  Serial.printf("[MEASURE] final flow=%.2f L/min, batt=%.1f%%, rssi=%d dBm\n", m.flow, m.battery, m.rssi);

  // Obtenir la position GPS ou réseau cellulaire (optionnel, ne bloque pas l'envoi)
  float latitude = 0.0, longitude = 0.0;
  bool hasLocation = getDeviceLocation(&latitude, &longitude);
  if (hasLocation) {
    Serial.printf("[GPS] Position: %.6f, %.6f\n", latitude, longitude);
  } else {
    Serial.println(F("[GPS] Position non disponible"));
  }

  if (!sendMeasurement(m, hasLocation ? &latitude : nullptr, hasLocation ? &longitude : nullptr)) {
    Serial.println(F("[API] Echec envoi mesure"));
  } else {
    Serial.println(F("[API] Mesure envoyée avec succès"));
  }

  uint32_t nextSleep = configuredSleepMinutes > 0 ? configuredSleepMinutes : DEFAULT_SLEEP_MINUTES;
  Command cmds[MAX_COMMANDS];
  int count = fetchCommands(cmds, MAX_COMMANDS);
  Serial.printf("[COMMANDS] %d commande(s) reçue(s)\n", count);
  for (int i = 0; i < count; ++i) {
    handleCommand(cmds[i], nextSleep);
  }

  stopModem();
  goToSleep(nextSleep);
}

void loop()
{
  // pas utilisé (deep sleep permanent)
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

  modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), NETWORK_APN.c_str(), "\"");
  modem.waitResponse(2000);
  Serial.printf("[MODEM] APN=%s\n", NETWORK_APN.c_str());

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

// Envoyer les informations du dispositif dès la connexion USB
void emitUsbDeviceInfo()
{
  // Essayer de lire l'ICCID depuis la SIM si le modem est disponible
  // (sans démarrer complètement le modem, juste une lecture rapide)
  String iccidToSend = DEVICE_ICCID;
  String serialToSend = DEVICE_SERIAL;
  
  // Si l'ICCID est la valeur par défaut, essayer de le lire depuis la SIM
  if (iccidToSend == OTT_DEFAULT_ICCID || iccidToSend.isEmpty()) {
    // Initialiser le modem juste pour lire l'ICCID
    initModem();
    delay(1000);
    if (modem.testAT(2000)) {
      String realIccid = modem.getSimCCID();
      if (realIccid.length() > 0 && realIccid.length() <= 20) {
        iccidToSend = realIccid;
        DEVICE_ICCID = realIccid;
        saveConfig();
      }
    }
  }
  
  // Envoyer les infos du dispositif en JSON
  StaticJsonDocument<512> infoDoc;
  infoDoc["type"] = "device_info";
  infoDoc["iccid"] = iccidToSend;
  infoDoc["serial"] = serialToSend;
  infoDoc["firmware_version"] = FIRMWARE_VERSION;
  infoDoc["device_name"] = String("OTT-") + (iccidToSend.length() >= 4 ? iccidToSend.substring(iccidToSend.length() - 4) : serialToSend.length() >= 4 ? serialToSend.substring(serialToSend.length() - 4) : "XXXX");
  
  serializeJson(infoDoc, Serial);
  Serial.println();
  
  Serial.printf("[USB] Device info envoyé: ICCID=%s, Serial=%s, FW=%s\n", 
                iccidToSend.c_str(), serialToSend.c_str(), FIRMWARE_VERSION);
}

bool detectUsbStreamingMode()
{
  // Envoyer immédiatement les infos du dispositif dès la connexion USB
  emitUsbDeviceInfo();
  
  Serial.println(F("[USB] Branché au PC ? Tapez 'usb' + Entrée sous 3s pour streaming continu."));
  unsigned long start = millis();
  String buffer;

  while (millis() - start < USB_HANDSHAKE_WINDOW_MS) {
    while (Serial.available()) {
      char incoming = Serial.read();
      if (incoming == '\r') {
        continue;
      }
      if (incoming == '\n') {
        buffer.trim();
        if (buffer.length() > 0) {
          String lowered = buffer;
          lowered.toLowerCase();
          if (lowered == "usb" || lowered == "u" || lowered == "stream" ||
              lowered == "usb_on" || lowered == "usb_stream_on") {
            Serial.println(F("[USB] Mode streaming continu activé."));
            return true;
          }
        }
        buffer = "";
      } else {
        buffer += incoming;
        if (buffer.length() > 32) {
          buffer.remove(0, buffer.length() - 32);
        }
      }
    }
    delay(20);
  }

  return false;
}

void usbStreamingLoop()
{
  uint32_t intervalMs = USB_STREAM_DEFAULT_INTERVAL_MS;
  uint32_t sequence = 0;
  unsigned long lastSend = 0;
  String commandBuffer;

  Serial.println(F("[USB] Streaming en continu (1 mesure/s)."));
  printUsbStreamHelp(intervalMs);

  while (true) {
    feedWatchdog();

    unsigned long now = millis();
    if (now - lastSend >= intervalMs) {
      Measurement snapshot = captureSensorSnapshot();
      emitUsbMeasurement(snapshot, ++sequence, intervalMs);
      lastSend = now;
    }

    while (Serial.available()) {
      char incoming = Serial.read();
      if (incoming == '\r') {
        continue;
      }
      if (incoming == '\n') {
        String command = commandBuffer;
        commandBuffer = "";
        command.trim();

        if (command.length() == 0) {
          continue;
        }

        String lowered = command;
        lowered.toLowerCase();

        if (lowered == "exit" || lowered == "sleep" || lowered == "usb_stream_off") {
          Serial.println(F("[USB] Sortie du streaming sur demande utilisateur."));
          return;
        }

        if (lowered == "help") {
          printUsbStreamHelp(intervalMs);
          continue;
        }

        if (lowered == "once") {
          Measurement snapshot = captureSensorSnapshot();
          emitUsbMeasurement(snapshot, ++sequence, intervalMs);
          lastSend = millis();
          continue;
        }

        if (lowered.startsWith("interval=")) {
          long requested = lowered.substring(9).toInt();
          if (requested < static_cast<long>(USB_STREAM_MIN_INTERVAL_MS) ||
              requested > static_cast<long>(USB_STREAM_MAX_INTERVAL_MS)) {
            Serial.printf("[USB] Intervalle invalide (%ld ms). Autorisé: %lu-%lu ms.\n",
                          requested,
                          static_cast<unsigned long>(USB_STREAM_MIN_INTERVAL_MS),
                          static_cast<unsigned long>(USB_STREAM_MAX_INTERVAL_MS));
          } else {
            intervalMs = static_cast<uint32_t>(requested);
            Serial.printf("[USB] Nouvel intervalle: %lu ms.\n", static_cast<unsigned long>(intervalMs));
            lastSend = millis();
          }
          continue;
        }

        Serial.printf("[USB] Commande inconnue: %s\n", command.c_str());
        printUsbStreamHelp(intervalMs);
      } else {
        commandBuffer += incoming;
        if (commandBuffer.length() > 64) {
          commandBuffer.remove(0, commandBuffer.length() - 64);
        }
      }
    }

    delay(5);
  }
}

void emitUsbMeasurement(const Measurement& m, uint32_t sequence, uint32_t intervalMs)
{
  StaticJsonDocument<256> doc;
  doc["mode"] = "usb_stream";
  doc["seq"] = sequence;
  doc["flow_lpm"] = m.flow;
  doc["battery_percent"] = m.battery;
  doc["rssi"] = m.rssi;
  doc["interval_ms"] = intervalMs;
  doc["sleep_minutes"] = configuredSleepMinutes;
  doc["timestamp_ms"] = millis();
  doc["firmware_version"] = FIRMWARE_VERSION; // Ajout de la version firmware
  serializeJson(doc, Serial);
  Serial.println();

  Serial.printf("[USB] #%lu flow=%.2f L/min | batt=%.1f%% | rssi=%d | interval=%lums\n",
                static_cast<unsigned long>(sequence),
                m.flow,
                m.battery,
                m.rssi,
                static_cast<unsigned long>(intervalMs));
}

void printUsbStreamHelp(uint32_t intervalMs)
{
  Serial.println(F("[USB] Commandes (terminer par Entrée):"));
  Serial.println(F("  once ............. Mesure immédiate sans attendre l'intervalle"));
  Serial.println(F("  interval=<ms> .... Modifier l'intervalle (200-10000 ms)"));
  Serial.println(F("  help ............. Afficher cette aide"));
  Serial.println(F("  exit ............. Quitter le streaming et redémarrer"));
  Serial.printf("[USB] Intervalle actuel: %lu ms.\n", static_cast<unsigned long>(intervalMs));
}

void configureWatchdog(uint32_t timeoutSeconds)
{
  uint32_t applied = std::max<uint32_t>(timeoutSeconds, static_cast<uint32_t>(MIN_WATCHDOG_TIMEOUT_SEC));
  watchdogTimeoutSeconds = applied;

  // Nettoie toute instance précédente potentiellement créée par l’ESP-IDF
  esp_task_wdt_delete(NULL);
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
  int csq = modem.getSignalQuality();
  String oper = modem.getOperator();
  bool eps = modem.isNetworkConnected();
  bool gprs = modem.isGprsConnected();

  Serial.printf("[MODEM][%s] CSQ=%d reg=%d (%s) oper=%s eps=%s gprs=%s\n",
                stage,
                csq,
                reg,
                regStatusToString(reg),
                oper.length() ? oper.c_str() : "<n/a>",
                eps ? "ok" : "KO",
                gprs ? "ok" : "KO");
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

bool attachNetwork(uint32_t timeoutMs)
{
  unsigned long start = millis();
  Serial.println(F("[MODEM] attache réseau en cours"));
  logRadioSnapshot("attach:start");
  while (millis() - start < timeoutMs) {
    feedWatchdog();
    if (modem.isNetworkConnected()) {
      logRadioSnapshot("attach:success");
      return true;
    }
    if (modem.waitForNetwork(10000)) {
      logRadioSnapshot("attach:event");
      return true;
    }
    Serial.println(F("[MODEM] attente réseau..."));
    logRadioSnapshot("attach:retry");
  }
  logRadioSnapshot("attach:timeout");
  return false;
}

bool connectData(uint32_t timeoutMs)
{
  unsigned long start = millis();
  Serial.println(F("[MODEM] connexion data"));
  logRadioSnapshot("data:start");
  while (millis() - start < timeoutMs) {
    feedWatchdog();
    if (modem.isGprsConnected()) {
      logRadioSnapshot("data:already");
      return true;
    }
    if (modem.gprsConnect(NETWORK_APN.c_str(), "", "")) {
      logRadioSnapshot("data:connected");
      return true;
    }
    Serial.println(F("[MODEM] tentative GPRS supplémentaire"));
    logRadioSnapshot("data:retry");
    delay(2000);
  }
  logRadioSnapshot("data:timeout");
  return false;
}

// ----------------------------------------------------------------------------- //
// Mesures capteur                                                               //
// ----------------------------------------------------------------------------- //

float measureBattery()
{
  float pct = (analogRead(BATTERY_ADC_PIN) / 4095.0f) * 100.0f;
  Serial.printf("[SENSOR] Batterie brute=%.1f%%\n", pct);
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

String buildAuthHeader()
{
  if (DEVICE_JWT.isEmpty()) {
    return String();
  }
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

bool sendMeasurement(const Measurement& m, float* latitude, float* longitude)
{
  DynamicJsonDocument doc(768); // Augmenté pour inclure position
  doc["sim_iccid"] = DEVICE_ICCID; // Format firmware (sim_iccid au lieu de device_sim_iccid)
  doc["device_sim_iccid"] = DEVICE_ICCID; // Compatibilité ancien format
  doc["device_serial"] = DEVICE_SERIAL;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["status"] = "TIMER";
  JsonObject payload = doc.createNestedObject("payload");
  payload["flowrate"] = m.flow;
  payload["battery"] = m.battery;
  payload["signal_strength"] = m.rssi;
  payload["signal_dbm"] = m.rssi;
  doc["flowrate"] = m.flow;
  doc["battery"] = m.battery;
  doc["signal_dbm"] = m.rssi;
  
  // Ajouter la position GPS/réseau cellulaire si disponible
  if (latitude != nullptr && longitude != nullptr) {
    doc["latitude"] = *latitude;
    doc["longitude"] = *longitude;
    payload["latitude"] = *latitude;
    payload["longitude"] = *longitude;
  }
  
  String body;
  serializeJson(doc, body);
  bool ok = httpPost(PATH_MEASURE, body);
  sendLog(ok ? "INFO" : "ERROR",
          ok ? "Measurement posted" : "Measurement failed",
          "measurements");
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
    if (payloadDoc.containsKey("airflow_passes")) {
      airflowPasses = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["airflow_passes"].as<uint16_t>());
    }
    if (payloadDoc.containsKey("airflow_samples_per_pass")) {
      airflowSamplesPerPass = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["airflow_samples_per_pass"].as<uint16_t>());
    }
    if (payloadDoc.containsKey("airflow_delay_ms")) {
      airflowSampleDelayMs = std::max<uint16_t>(static_cast<uint16_t>(1), payloadDoc["airflow_delay_ms"].as<uint16_t>());
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
 * Priorité:
 * 1. GPS si disponible (modem.getGPS())
 * 2. Réseau cellulaire (modem.getGsmLocation()) si GPS échoue
 * 
 * @param latitude Pointeur vers la variable latitude (sortie)
 * @param longitude Pointeur vers la variable longitude (sortie)
 * @return true si la position a été obtenue, false sinon
 */
bool getDeviceLocation(float* latitude, float* longitude)
{
  if (!modemReady || latitude == nullptr || longitude == nullptr) {
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
  int gsmAccuracy = 0;
  
  if (modem.getGsmLocation(&lat, &lon, &gsmAccuracy)) {
    // Valider les coordonnées
    if (lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0 && 
        lat != 0.0 && lon != 0.0) {
      *latitude = lat;
      *longitude = lon;
      Serial.printf("[GPS] Position réseau cellulaire obtenue: %.6f, %.6f (précision: %dm)\n", 
                    lat, lon, gsmAccuracy);
      return true;
    }
  }
  
  Serial.println(F("[GPS] Aucune position disponible (GPS et réseau cellulaire échoués)"));
  return false;
}
