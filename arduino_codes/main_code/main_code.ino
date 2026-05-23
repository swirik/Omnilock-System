#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <HardwareSerial.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

#define MP3_RX_PIN 33
#define MP3_TX_PIN 25
#define CAM_RX_PIN 16
#define CAM_TX_PIN 17
#define BUTTON_PIN 13
#define GREEN_LED 14
#define RED_LED 32
#define SOLENOID_RELAY_PIN 26
#define IGNITION_RELAY_PIN 27

const char *ssid = "GLOBEWIFI_DDB90_2.4GHz";
const char *password = "PLDTWIFI50MMS";
const String FIREBASE_URL = "https://anti-theft-system-50561-default-rtdb.asia-southeast1.firebasedatabase.app/artifacts/anti-theft-app/public/data/vehicle/status.json?auth=WqaYphYJ2GmcBetMgCUp1DrU2KzGZ7toeSYD3ABt";

HardwareSerial mp3Serial(1);
Adafruit_MPU6050 mpu;

bool isArmed = true;
bool isAlarmPlaying = false;
int failedAttempts = 0;

volatile bool buttonInterruptFired = false;
unsigned long lastButtonPress = 0;
bool authRequested = false;

unsigned long lastCloudCheck = 0;
unsigned long lastMpuCheck = 0;
unsigned long ignoreMovementUntil = 0;
bool isEnrolling = false;
bool isScanning = false;
unsigned long scanStartTime = 0;
unsigned long enrollStartTime = 0;
int frameCount = 0;

float lastX = 0, lastY = 0, lastZ = 0;
const float MOVEMENT_THRESHOLD = 3.0;

void IRAM_ATTR handleButton() {
  buttonInterruptFired = true;
}

void sendMP3Command(byte command[], int len) {
  for (int i = 0; i < len; i++) {
    mp3Serial.write(command[i]);
  }
  delay(100);
}

void mp3SetVolume(byte volume) {
  if (volume > 30) volume = 30;
  byte setVol[] = {0x7E, 0x03, 0x31, volume, 0xEF};
  sendMP3Command(setVol, 5);
}

void mp3PlayTrack(byte folder, byte track) {
  byte playCmd[] = {0x7E, 0x04, 0x42, folder, track, 0xEF};
  sendMP3Command(playCmd, 6);
}

void mp3Stop() {
  mp3SetVolume(0);
  delay(50);
  byte pauseCmd[] = {0x7E, 0x02, 0x0E, 0xEF};
  sendMP3Command(pauseCmd, 4);
  delay(50);
  byte stopCmd[] = {0x7E, 0x02, 0x16, 0xEF};
  sendMP3Command(stopCmd, 4);
  delay(50);
  mp3SetVolume(25);
}

void mp3LoopTrack() {
  byte loopCmd[] = {0x7E, 0x02, 0x19, 0xEF};
  sendMP3Command(loopCmd, 4);
}

void syncMPUBaseline() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  lastX = a.acceleration.x;
  lastY = a.acceleration.y;
  lastZ = a.acceleration.z;
}

void resetIdleScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0,0);
  if (isArmed) {
    display.println("System Locked.");
  } else {
    display.println("System Unlocked.");
  }
  display.println("Press Button to Scan.");
  display.display();
}

void patchAlarmState(bool active) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(FIREBASE_URL);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"alarmActive\":" + String(active ? "true" : "false") + "}";
    http.sendRequest("PATCH", payload);
    http.end();
  }
}

void toggleLockState(bool armSystem) {
  detachInterrupt(digitalPinToInterrupt(BUTTON_PIN));
  isArmed = armSystem;
  ignoreMovementUntil = millis() + 5000;
  
  if (isArmed) {
    digitalWrite(IGNITION_RELAY_PIN, LOW);
    digitalWrite(SOLENOID_RELAY_PIN, HIGH);
    delay(180);
    digitalWrite(SOLENOID_RELAY_PIN, LOW);
    syncMPUBaseline();
  } else {
    digitalWrite(IGNITION_RELAY_PIN, HIGH);
    digitalWrite(SOLENOID_RELAY_PIN, LOW);
    if (isAlarmPlaying) {
      mp3Stop();
      isAlarmPlaying = false;
      patchAlarmState(false);
    }
    syncMPUBaseline();
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(FIREBASE_URL);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"isLocked\":" + String(isArmed ? "true" : "false") + "}";
    http.sendRequest("PATCH", payload);
    http.end();
  }
  
  resetIdleScreen();
  buttonInterruptFired = false;
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), handleButton, FALLING);
}

void processMovement() {
  if (!isArmed || isAlarmPlaying) return;
  if (millis() < ignoreMovementUntil) {
    syncMPUBaseline();
    return;
  }
  if (millis() - lastMpuCheck < 30) return;

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float deltaX = fabs(a.acceleration.x - lastX);
  float deltaY = fabs(a.acceleration.y - lastY);
  float deltaZ = fabs(a.acceleration.z - lastZ);

  if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD || deltaZ > MOVEMENT_THRESHOLD) {
    isAlarmPlaying = true;
    patchAlarmState(true);
    mp3PlayTrack(1, 2);
    mp3LoopTrack();
  } else {
    lastX = (lastX * 0.98f) + (a.acceleration.x * 0.02f);
    lastY = (lastY * 0.98f) + (a.acceleration.y * 0.02f);
    lastZ = (lastZ * 0.98f) + (a.acceleration.z * 0.02f);
  }
  lastMpuCheck = millis();
}

void processResult(String status, String faceId) {
  display.clearDisplay();
  display.setCursor(0,0);
  ignoreMovementUntil = millis() + 5000;
  
  if (status == "success") {
    display.println("Access Granted");
    display.println("ID: " + faceId);
    digitalWrite(GREEN_LED, HIGH);
    failedAttempts = 0;
    toggleLockState(false);
    delay(2000);
    digitalWrite(GREEN_LED, LOW);
  } else {
    if (status == "timeout") {
      display.println("Scan Timeout");
    } else {
      display.println("Access Denied");
    }
    digitalWrite(RED_LED, HIGH);
    failedAttempts++;

    if (failedAttempts >= 3) {
      display.setCursor(0, 30);
      display.println("SYSTEM LOCKDOWN");
      toggleLockState(true);
      isAlarmPlaying = true;
      patchAlarmState(true);
      mp3PlayTrack(1, 2);
      mp3LoopTrack();
      failedAttempts = 0;
    }

    delay(2000);
    digitalWrite(RED_LED, LOW);
  }
  
  display.display();
  resetIdleScreen();
}

void handleEnrollmentFeedback(String feedback) {
  if (feedback != "NO_FACE" && feedback != "ENROLL_SUCCESS" && feedback != "ENROLL_FAIL") {
    return;
  }

  display.clearDisplay();
  display.setCursor(0,0);
  ignoreMovementUntil = millis() + 5000;
  
  if (feedback == "NO_FACE") {
    display.println("NO FACE DETECTED");
    display.println("Move into frame");
    digitalWrite(RED_LED, HIGH);
    delay(3000);
    digitalWrite(RED_LED, LOW);
  } 
  else if (feedback == "ENROLL_SUCCESS") {
    display.println("BIOMET SAVED");
    digitalWrite(GREEN_LED, HIGH);
    delay(3000);
    digitalWrite(GREEN_LED, LOW);
  }
  else if (feedback == "ENROLL_FAIL") {
    display.println("REGISTRATION FAILED");
    digitalWrite(RED_LED, HIGH);
    delay(3000);
    digitalWrite(RED_LED, LOW);
  }
  
  isEnrolling = false;
  display.display();
  resetIdleScreen();
}

void startAuthentication() {
  isScanning = true;
  frameCount = 0;
  scanStartTime = millis();
  ignoreMovementUntil = millis() + 5000;
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Authenticating...");
  display.println("Looking for face...");
  display.display();
  Serial2.println("SCAN");
}

void initiateSmartEnrollment() {
  isEnrolling = true;
  ignoreMovementUntil = millis() + 15000;
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(FIREBASE_URL);
    http.addHeader("Content-Type", "application/json");
    http.sendRequest("PATCH", "{\"enrollRequested\":false}");
    http.end();
  }

  for(int i = 5; i > 0; i--) {
    display.clearDisplay();
    display.setCursor(0,0);
    display.println("ALIGNMENT MODE");
    display.print("Look at camera in: ");
    display.println(i);
    display.display();
    delay(1000);
  }
  
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Capturing...");
  display.display();
  while (Serial2.available()) {
    Serial2.read();
  }
  enrollStartTime = millis(); 
  Serial2.println("ENROLL");
}

void checkCloudCommands() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(FIREBASE_URL);
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      String payload = http.getString();
      
      StaticJsonDocument<1024> doc;
      DeserializationError err = deserializeJson(doc, payload);
      
      if (!err) {
        if (doc.containsKey("enrollRequested") && doc["enrollRequested"] == true) {
          initiateSmartEnrollment();
        }
        
        if (doc.containsKey("isLocked")) {
          bool cloudIsLocked = doc["isLocked"];
          if (cloudIsLocked && !isArmed) {
            toggleLockState(true);
          } else if (!cloudIsLocked && isArmed) {
            toggleLockState(false);
          }
        }

        if (doc.containsKey("alarmActive")) {
          bool cloudAlarm = doc["alarmActive"];
          if (cloudAlarm && !isAlarmPlaying) {
            isAlarmPlaying = true;
            ignoreMovementUntil = millis() + 5000;
            mp3PlayTrack(1, 1);
            mp3LoopTrack();
          } else if (!cloudAlarm && isAlarmPlaying) {
            mp3Stop();
            isAlarmPlaying = false;
            syncMPUBaseline();
            ignoreMovementUntil = millis() + 5000;
          }
        }
      }
    }
    http.end();
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, CAM_RX_PIN, CAM_TX_PIN);
  mp3Serial.begin(9600, SERIAL_8N1, MP3_RX_PIN, MP3_TX_PIN);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), handleButton, FALLING);
  
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(SOLENOID_RELAY_PIN, OUTPUT);
  pinMode(IGNITION_RELAY_PIN, OUTPUT);
  
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  
  Wire.begin(21, 22);
  Wire.setClock(400000);

  if(!display.begin(0x3C, true)) {
    for(;;);
  }

  if (mpu.begin()) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    syncMPUBaseline();
  }

  byte selectDevice[] = {0x7E, 0x03, 0x35, 0x01, 0xEF};
  sendMP3Command(selectDevice, 5);
  mp3SetVolume(25);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  
  HTTPClient http;
  http.begin(FIREBASE_URL);
  http.addHeader("Content-Type", "application/json");
  http.sendRequest("PATCH", "{\"isLocked\":true, \"alarmActive\":false}");
  http.end();
  
  toggleLockState(true);
}

void loop() {
  if (buttonInterruptFired) {
    buttonInterruptFired = false;
    unsigned long currentMillis = millis();
    
    if (currentMillis > 5000 && (currentMillis - lastButtonPress > 500)) {
      lastButtonPress = currentMillis;
      if (!isEnrolling && !isScanning) {
        if (isArmed) {
          authRequested = true;
        } else {
          toggleLockState(true);
        }
      }
    }
  }

  if (authRequested) {
    authRequested = false;
    startAuthentication();
  }

  if (isScanning && (millis() - scanStartTime > 10000)) {
    isScanning = false;
    processResult("timeout", "");
  }

  if (isEnrolling && (millis() - enrollStartTime > 15000)) {
    isEnrolling = false;
    display.clearDisplay();
    display.setCursor(0,0);
    display.println("Camera Error");
    display.display();
    delay(3000);
    resetIdleScreen();
  }

  processMovement();

  if (!isEnrolling && !isScanning && millis() - lastCloudCheck > 3000) {
    lastCloudCheck = millis();
    checkCloudCommands();
  }

  if (Serial2.available()) {
    String camResponse = Serial2.readStringUntil('\n');
    camResponse.trim();
    if (isEnrolling) {
      handleEnrollmentFeedback(camResponse);
    } else if (isScanning) {
      if (camResponse == "NO_FACE") {
        if (millis() - scanStartTime < 10000) {
          frameCount++;
          display.fillRect(0, 40, 128, 24, SH110X_BLACK);
          display.setCursor(0, 40);
          display.print("Scans: ");
          display.println(frameCount);
          display.println("Status: NO FACE");
          display.display();
          Serial2.println("SCAN");
        }
      } else if (camResponse.startsWith("FACE_OK")) {
        isScanning = false;
        processResult("success", camResponse.substring(8));
      } else if (camResponse == "FACE_FAIL") {
        isScanning = false;
        processResult("fail", "");
      }
    }
  }
}