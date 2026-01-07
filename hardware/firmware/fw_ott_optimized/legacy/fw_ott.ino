#define SIM_PIN "1234"
#define NETWORK_APN "free"
#define TINY_GSM_RX_BUFFER 1024 // Set RX buffer to 1Kb

#define MODEM_BAUDRATE                      (115200)
#define MODEM_DTR_PIN                       (25)
#define MODEM_TX_PIN                        (26)
#define MODEM_RX_PIN                        (27)
// The modem boot pin needs to follow the startup sequence.
#define BOARD_PWRKEY_PIN                    (4)
#define BOARD_ADC_PIN                       (35)
// The modem power switch must be set to HIGH for the modem to supply power.
#define BOARD_POWERON_PIN                   (12)
#define MODEM_RING_PIN                      (33)
#define MODEM_RESET_PIN                     (5)
#define BOARD_MISO_PIN                      (2)
#define BOARD_MOSI_PIN                      (15)
#define BOARD_SCK_PIN                       (14)
#define BOARD_SD_CS_PIN                     (13)
#define BOARD_BAT_ADC_PIN                   (35)
#define MODEM_RESET_LEVEL                   HIGH
#define SerialAT                            Serial1
#define MODEM_GPS_ENABLE_GPIO               (-1)
#define MODEM_GPS_ENABLE_LEVEL              (-1)
#define TINY_GSM_MODEM_SIM7600

#define BATTERY_ADC_PIN 35
#define SENSOR_PIN 33

#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

//#define DUMP_AT_COMMANDS
#ifdef DUMP_AT_COMMANDS  // if enabled it requires the streamDebugger lib
  #include <StreamDebugger.h>
  StreamDebugger debugger(SerialAT, Serial);
  TinyGsm modem(debugger);
#else
  TinyGsm modem(SerialAT);
  TinyGsmClient client(modem);
#endif

String status = "";
float mBatteryLevel = -1.0;
int mAirflow = -1;

void setup() {
    
    // Init serial
    initSerial();

    Serial.println("////////////////////////////////////////////////////////////////////////////////");
    Serial.println("OTT DEVICE");
    Serial.println("HAPPLYZ MEDICAL SAS");
    Serial.println("Firmware 1.0 - Dev");
    Serial.println("////////////////////////////////////////////////////////////////////////////////");

    // Init board
    initBoard();

    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();

    switch(cause) {
      case ESP_SLEEP_WAKEUP_UNDEFINED:
      status = "WAKEUP_FROM_COLD_START";
      Serial.println("ESP_SLEEP_WAKEUP_UNDEFINED");
      break;
      case ESP_SLEEP_WAKEUP_TIMER:
      status = "WAKEUP_FROM_SLEEP";
      Serial.println("ESP_SLEEP_WAKEUP_TIMER");
      break;
      case ESP_SLEEP_WAKEUP_EXT0:
      Serial.println("ESP_SLEEP_WAKEUP_EXT0");
      break;
      case ESP_SLEEP_WAKEUP_EXT1:
      Serial.println("ESP_SLEEP_WAKEUP_EXT1");
      break;
      case ESP_SLEEP_WAKEUP_TOUCHPAD:
      Serial.println("ESP_SLEEP_WAKEUP_TOUCHPAD");
      break;
      case ESP_SLEEP_WAKEUP_ULP:
      Serial.println("ESP_SLEEP_WAKEUP_ULP");
      break;
      default : 
      Serial.println("WAKE UP default");
      break;
    }

    pinMode(BATTERY_ADC_PIN, INPUT);
    pinMode(SENSOR_PIN, INPUT);

    mAirflow = measureAirflow();
    Serial.println("Airflow : " + String(mAirflow));
    mBatteryLevel = measureBattery();
    Serial.println("Battery : " + String(mBatteryLevel));    

    if(false && status == "WAKEUP_FROM_COLD_START") {

      // Init modem SIM7600
      initModem();
      // Start modem
      startModem();

      String iccid = modem.getSimCCID();

      StaticJsonDocument<256> jsonDoc;
      jsonDoc["device_sim_iccid"] = String(iccid);
      jsonDoc["status"] = String(status);
      JsonObject jsonObject = jsonDoc.createNestedObject("payload");
      jsonObject["flowrate"] = String(mAirflow);
      jsonObject["battery"] = String(mBatteryLevel);

      String jsonData;
      serializeJson(jsonDoc, jsonData);

      postToServer(&modem, "devices/messages", jsonData);
      Serial.println("Send data to /devices/messages : " + jsonData);
      
      stopModem();

      goSleep();
      
    } else {

      // goSleep();

    }
  
}

void loop() {

  /*
  // Debug AT
  if (SerialAT.available()) {
    Serial.write(SerialAT.read());
  }
  if (Serial.available()) {
    SerialAT.write(Serial.read());
  }
  delay(1);
  */

  mAirflow = measureAirflow();
  Serial.println("Airflow : " + String(mAirflow) + " (raw) - " + String(getAirflowInLperMin(1, mAirflow)) + "L/min (1) - " + String(getAirflowInLperMin(2, mAirflow)) + "L/min (2)");
  mBatteryLevel = measureBattery();
  Serial.println("Battery : " + String(mBatteryLevel));

}

void initSerial() {
    Serial.begin(115200);
    delay(100);
    //clear serial port
    while (Serial.available() > 0) {
        Serial.read();
    }
}

void initBoard() {
    Serial.println("Init board");
    pinMode(BOARD_POWERON_PIN, OUTPUT);
    digitalWrite(BOARD_POWERON_PIN, HIGH);

    pinMode(BOARD_PWRKEY_PIN, OUTPUT);
    digitalWrite(BOARD_PWRKEY_PIN, LOW);
    delay(100);
    digitalWrite(BOARD_PWRKEY_PIN, HIGH);
    delay(100);
    digitalWrite(BOARD_PWRKEY_PIN, LOW);
}

void goSleep() {
    Serial.println("Go to sleep.");
    esp_deep_sleep(10000000);
}

void communicateWithServer(int method, TinyGsm* modem, String endpoint, String jsonData = "") {
  
    modem->sendAT("+HTTPINIT");
    WaitResponse();

    modem->sendAT("+HTTPPARA=\"URL\", \"http://dev.ott.purplepotatoe.com/api.php/" + endpoint +"\"");
    WaitResponse();

    modem->sendAT("+HTTPPARA=\"CONTENT\", \"application/json\"");
    WaitResponse();

    if(method == 1) {
        modem->sendAT("+HTTPDATA=" + String(jsonData.length()) + "," + String(5000));
        WaitResponse();  
        SerialAT.write(jsonData.c_str());
    }

    delay(2000);

    modem->sendAT("+HTTPACTION=" + String(method));
    WaitResponse();

    modem->sendAT("+HTTPHEAD");
    WaitResponse();
}

void getFromServer(TinyGsm* modem, String endpoint) {
    communicateWithServer(0, modem, endpoint);
}

void postToServer(TinyGsm* modem, String endpoint, String jsonData) {
    communicateWithServer(1, modem, endpoint, jsonData);
}

String arrayToJson(String keys[], String values[], int arraySize) {
  String json = "{";

  for (int i = 0; i < arraySize; i++) {
    json += "\"" + keys[i] + "\":\"" + values[i] + "\"";
    if (i < arraySize - 1) {
      json += ",";
    }
  }

  json += "}";
  return json;
}

