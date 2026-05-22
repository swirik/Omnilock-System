#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

const char *ssid = "GLOBEWIFI_DDB90_2.4GHz";
const char *password = "PLDTWIFI50MMS";
const String FIREBASE_URL = "https://anti-theft-system-50561-default-rtdb.asia-southeast1.firebasedatabase.app/artifacts/anti-theft-app/public/data/vehicle/status.json?auth=WqaYphYJ2GmcBetMgCUp1DrU2KzGZ7toeSYD3ABt";

const int BUTTON_PIN = 13;
const int GREEN_LED = 14;
const int RED_LED = 27;
const int RELAY_PIN = 12;

bool authRequested = false;
unsigned long lastCloudCheck = 0;
bool isEnrolling = false;
bool isScanning = false;
unsigned long scanStartTime = 0;
unsigned long enrollStartTime = 0;
bool localLockState = true;
int frameCount = 0;

void IRAM_ATTR handleButton() {
  if (!isEnrolling && !isScanning) {
    authRequested = true;
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), handleButton, FALLING);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  if(!display.begin(0x3C, true)) {
    for(;;);
  }
  
  resetIdleScreen();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  
  resetIdleScreen();
}

void loop() {
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
    display.println("No Response.");
    display.display();
    delay(3000);
    resetIdleScreen();
  }

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

void checkCloudCommands() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(FIREBASE_URL);
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      String payload = http.getString();
      
      if (payload.indexOf("\"enrollRequested\":true") > 0) {
        initiateSmartEnrollment();
      }
      
      bool cloudIsLocked = (payload.indexOf("\"isLocked\":true") > 0);
      
      if (cloudIsLocked && !localLockState) {
        digitalWrite(RELAY_PIN, LOW);
        localLockState = true;
        if (!isEnrolling && !isScanning) {
          resetIdleScreen();
        }
      } else if (!cloudIsLocked && localLockState) {
        localLockState = false;
      }
    }
    http.end();
  }
}

void initiateSmartEnrollment() {
  isEnrolling = true;
  
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

void handleEnrollmentFeedback(String feedback) {
  if (feedback != "NO_FACE" && feedback != "ENROLL_SUCCESS" && feedback != "ENROLL_FAIL") {
    return;
  }

  display.clearDisplay();
  display.setCursor(0,0);
  
  if (feedback == "NO_FACE") {
    display.println("NO FACE DETECTED");
    display.println("Move into frame");
    digitalWrite(RED_LED, HIGH);
    digitalWrite(GREEN_LED, LOW);
    delay(3000);
    digitalWrite(RED_LED, LOW);
    isEnrolling = false;
    resetIdleScreen();
    return;
  } 
  else if (feedback == "ENROLL_SUCCESS") {
    display.println("BIOMETRIC SAVED");
    display.println("Registration Complete");
    digitalWrite(GREEN_LED, HIGH);
    delay(3000);
    digitalWrite(GREEN_LED, LOW);
    isEnrolling = false;
    resetIdleScreen();
    return;
  }
  else if (feedback == "ENROLL_FAIL") {
    display.println("REGISTRATION FAILED");
    display.println("Alignment lost.");
    digitalWrite(RED_LED, HIGH);
    delay(3000);
    digitalWrite(RED_LED, LOW);
    isEnrolling = false;
    resetIdleScreen();
    return;
  }
  
  display.display();
}

void startAuthentication() {
  isScanning = true;
  frameCount = 0;
  scanStartTime = millis();
  display.clearDisplay();
  display.setCursor(0,0);
  display.println("Authenticating...");
  display.println("Looking for face...");
  display.display();
  Serial2.println("SCAN");
}

void processResult(String status, String faceId) {
  display.clearDisplay();
  display.setCursor(0,0);
  
  if (status == "success") {
    display.println("Access Granted");
    display.println("ID: " + faceId);
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(RELAY_PIN, HIGH);
    delay(2000);
    digitalWrite(GREEN_LED, LOW);
  } else if (status == "timeout") {
    display.println("Scan Timeout");
    display.println("No face found.");
    digitalWrite(RED_LED, HIGH);
    delay(2000);
    digitalWrite(RED_LED, LOW);
  } else {
    display.println("Access Denied");
    digitalWrite(RED_LED, HIGH);
    digitalWrite(RELAY_PIN, LOW); 
    delay(2000);
    digitalWrite(RED_LED, LOW);
  }
  display.display();
  resetIdleScreen();
}

void resetIdleScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0,0);
  display.println("System Locked.");
  display.println("Press Button to Scan.");
  display.display();
}