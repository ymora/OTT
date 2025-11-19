
void testAirflow() {
  
  // Moyenne de 15 x Moy(100)
  // 5L / min = 2468
  // 4L / min = 2236
  // 3L / min = 2062
  // 2L / min = 1956
  // 1L / min = 1860
  // 0.5L / min = 1839
  // 0L / min = 1818

  float testAirflow = 0.0;

  for(int ii = 0;ii<15;ii++) {

    int airflow = 0;
    float fAirflow = 0.0;

    for(int i=0;i<100;i++) {
        fAirflow += (float) analogRead(SENSOR_PIN);
        delay(10);
    }

    airflow = (int) fAirflow / 100.0;
    testAirflow += airflow;
    Serial.print(".");

  }

  Serial.println("Airflow : " + String((int) testAirflow / 15.0));
  
}

int measureAirflow() {

    float fAirflow = 0.0;

    Serial.print("Measure airflow");

    for (int ii=0;ii<5;ii++) {
      for(int i=0;i<100;i++) {
          fAirflow += (float) analogRead(SENSOR_PIN);
          delay(10);
      }
      Serial.print(".");
    }
    Serial.println("");    

    return (int) (fAirflow / 500.0);
}

float getAirflowInLperMin(int degree, float airflow) {

    // Linear
    if(degree == 1) {
        float x_values[] = {1770, 1800, 1890, 1985, 2160, 2380};
        float y_values[] = {0, 1, 2, 3, 4, 5};
        int n = 6;

        float a = 0;  // Pente
        float b = 0;  // Ordonnée à l'origine

        float sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (int i = 0; i < n; i++) {
          sumX += x_values[i];
          sumY += y_values[i];
          sumXY += x_values[i] * y_values[i];
          sumXX += x_values[i] * x_values[i];
        }

        a = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        b = (sumY - a * sumX) / n;

        return a * airflow + b;
    
    // Polynomial (degree 2)
    } else if(degree == 2) {

      float x_values[] = {1762, 1795, 1890, 1980, 2160, 2380};
      float y_values[] = {0, 1, 2, 3, 4, 5};
      int n = 6;

      float a0 = 0;   // Ordonnée à l'origine
      float a1 = 0;   // Coefficient linéaire
      float a2 = 0;   // Coefficient quadratique

      float Sx0 = n;
      float Sx1 = 0;
      float Sx2 = 0;
      float Sx3 = 0;
      float Sx4 = 0;
      float Sy  = 0;
      float Sxy = 0;
      float Sx2y = 0;

      for (int i = 0; i < n; i++) {
        float x = x_values[i];
        float y = y_values[i];
        float x2 = x * x;

        Sx1  += x;
        Sx2  += x2;
        Sx3  += x2 * x;
        Sx4  += x2 * x2;

        Sy   += y;
        Sxy  += x * y;
        Sx2y += x2 * y;
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

      a0 = inv00 * Sy + inv01 * Sxy + inv02 * Sx2y;
      a1 = inv10 * Sy + inv11 * Sxy + inv12 * Sx2y;
      a2 = inv20 * Sy + inv21 * Sxy + inv22 * Sx2y;

      return a2 * airflow * airflow + a1 * airflow + a0;
        
    } else {
      return -1.0;
    }

}

float measureBattery() {
  return analogRead(BATTERY_ADC_PIN) * 100.0 / 4096.0;
}
