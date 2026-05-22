#include <WiFi.h>
#include "esp_camera.h"
#include <HTTPClient.h>

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

const char *ssid = "GLOBEWIFI_DDB90_2.4GHz";
const char *password = "PLDTWIFI50MMS";

const char* recognizeUrl = "http://192.168.1.101:5000/api/recognize";
const char* enrollUrl = "http://192.168.1.101:5000/api/enroll";

void setup() {
  Serial.begin(115200);
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("CAM_INIT_FAIL");
    return;
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "SCAN") {
      processImageTask(recognizeUrl, false);
    } else if (cmd == "ENROLL") {
      processImageTask(enrollUrl, true);
    }
  }
}

void processImageTask(const char* targetUrl, bool isEnrollment) {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println(isEnrollment ? "ENROLL_FAIL" : "FACE_FAIL");
    return;
  }

  HTTPClient http;
  http.begin(targetUrl);
  http.setTimeout(15000); 
  http.addHeader("Content-Type", "image/jpeg");
  int httpResponseCode = http.POST(fb->buf, fb->len);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    if (isEnrollment) {
      if (response.indexOf("\"status\":\"success\"") > 0) {
        Serial.println("ENROLL_SUCCESS");
      } else if (response.indexOf("\"message\":\"NO_FACE\"") > 0) {
        Serial.println("NO_FACE");
      } else {
        Serial.println("ENROLL_FAIL");
      }
    } else {
      if (response.indexOf("\"message\":\"NO_FACE\"") > 0) {
        Serial.println("NO_FACE");
      } else if (response.indexOf("\"status\":\"success\"") > 0) {
        String faceId = "Unknown";
        int idIndex = response.indexOf("\"faceId\":\"");
        if (idIndex > 0) {
           int endIndex = response.indexOf("\"", idIndex + 10);
           faceId = response.substring(idIndex + 10, endIndex);
        }
        Serial.println("FACE_OK_" + faceId);
      } else {
        Serial.println("FACE_FAIL");
      }
    }
  } else {
    Serial.println(isEnrollment ? "ENROLL_FAIL" : "FACE_FAIL");
  }
  
  http.end();
  esp_camera_fb_return(fb);
}