
void initModem() {
  
    Serial.println("Init modem");

    SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);

    // Set modem reset pin, reset modem
    pinMode(MODEM_RESET_PIN, OUTPUT);
    digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL); delay(100);
    digitalWrite(MODEM_RESET_PIN, MODEM_RESET_LEVEL); delay(2600);
    digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);

}

void startModem() {

    Serial.println("Start modem");

    int retry = 0;
    while (!modem.testAT(1000)) {
      Serial.print(".");
      if (retry++ > 10) {
        digitalWrite(BOARD_PWRKEY_PIN, LOW);
        delay(100);
        digitalWrite(BOARD_PWRKEY_PIN, HIGH);
        delay(1000);
        digitalWrite(BOARD_PWRKEY_PIN, LOW);
        retry = 0;
      }
    }
    Serial.println();

    // Check if SIM card is online
    SimStatus sim = SIM_ERROR;
    while (sim != SIM_READY) {
      sim = modem.getSimStatus();
      switch (sim) {
        case SIM_READY:
          // Serial.println("SIM card online");
          break;
        case SIM_LOCKED:
          // Serial.println("The SIM card is locked. Please unlock the SIM card first.");
          modem.simUnlock(SIM_PIN);
          break;
        default:
          break;
      }
    }

    modem.sendAT(GF("+CGDCONT=1,\"IP\",\""), NETWORK_APN, "\"");
    WaitResponse();

    if (!modem.waitForNetwork()) {
      Serial.println("Network failed.");
      goSleep();
    }

    if (!modem.gprsConnect("free", "", "")) {
      Serial.println("GPRS connection failed.");
      goSleep();
    }

    Serial.println("Network and data connected.");

}

void stopModem() {
    Serial.println("Stop modem");
    modem.gprsDisconnect();
}

void WaitResponse() {
  unsigned long timeout = millis() + 2000;  // 2 secondes max d'attente
    while (millis() < timeout) {
        while (modem.stream.available()) {
            char c = modem.stream.read();
            Serial.write(c);  // Affiche en direct ce que renvoie le modem
        }
    }
}