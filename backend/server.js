require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(express.json());
app.use(cors());

const DATABASE_URL = "https://anti-theft-system-50561-default-rtdb.asia-southeast1.firebasedatabase.app";
const SECRET = "WqaYphYJ2GmcBetMgCUp1DrU2KzGZ7toeSYD3ABt";
const PATH = `/artifacts/anti-theft-app/public/data/vehicle/status.json?auth=${SECRET}`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

let failedAttempts = 0;

const triggerSmartAlert = async () => {
  console.log("\n[ALERT] 3 Consecutive failures reached. Initiating Smart Alert sequence...");
  
  try {
    const dbRes = await fetch(DATABASE_URL + PATH);
    const data = await dbRes.json();

    const lat = data.location?.lat || "Unknown";
    const lon = data.location?.lon || "Unknown";
    const lock = data.isLocked ? "Locked" : "Unlocked";
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
    
    const targetPhoneNumber = data.ownerPhoneNumber || process.env.OWNER_PHONE_NUMBER;

    console.log(`[AI] Requesting plain-English translation from Gemini...`);
    
    const prompt = `Write an emergency security log to a motorcycle owner. Context: 3 consecutive facial authentication failures occurred at the ignition point. System has enforced an absolute ignition lockout. Current lock status: ${lock}. Do not use fluffy or conversational filler words. Keep it structured, critical, and robotic. Max 140 characters.`;

    const aiResult = await model.generateContent(prompt);
    let alertMessage = aiResult.response.text().trim();
    
    alertMessage = `${alertMessage}\nLoc: ${mapsLink}`;
    console.log(`[AI] Message Generated: "${alertMessage}"`);

    console.log(`[SMS] Dispatching to iPROGSMS for number: ${targetPhoneNumber}...`);
    const smsResponse = await axios.post('https://www.iprogsms.com/api/v1/sms_messages', {
      api_token: process.env.IPROGSMS_TOKEN,
      phone_number: targetPhoneNumber,
      message: alertMessage
    });
    
    console.log(`[SMS] iPROGSMS Network Response:`, smsResponse.data);
    
  } catch (error) {
    console.error("[ERROR] Alert Sequence Failed!");
    if (error.response) {
      console.error("API Error Data:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
};

app.post('/api/verify-face', async (req, res) => {
  const { status, faceId } = req.body;

  let payload = {};

  if (status === 'enroll_success') {
    console.log(`[AUTH] Registration successful. Resetting failure count.`);
    payload = { lastVerifiedFace: faceId, enrollRequested: false };
    failedAttempts = 0;
    
  } else if (status === 'success') {
    console.log(`[AUTH] Face verified: ${faceId}. Resetting failure count.`);
    payload = { rfidStatus: 'authorized', lastVerifiedFace: faceId, alarmActive: false };
    failedAttempts = 0;
    
  } else {
    failedAttempts++;
    console.log(`[AUTH] Biometric mismatch. Strike ${failedAttempts}/3.`);
    payload = { rfidStatus: 'unauthorized', lastVerifiedFace: null };
    
    if (failedAttempts >= 3) {
      triggerSmartAlert();
      failedAttempts = 0; 
    }
  }

  try {
    await fetch(DATABASE_URL + PATH, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    res.status(200).json({ message: "Firebase Synced" });
  } catch (error) {
    console.error("[ERROR] Failed to sync with Firebase database.");
    res.status(500).json({ error: "Sync Failed" });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log("========================================");
  console.log("OmniLock Bridge Server Live (Port 3000)");
  console.log("Monitoring biometric authentication...");
  console.log("========================================");
});