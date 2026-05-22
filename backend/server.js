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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

let failedAttempts = 0;

const triggerSmartAlert = async () => {
  try {
    const dbRes = await fetch(DATABASE_URL + PATH);
    const data = await dbRes.json();

    const lat = data.location?.lat || "Unknown";
    const lon = data.location?.lon || "Unknown";
    const lock = data.isLocked ? "Locked" : "Unlocked";
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;

    const prompt = `Write a highly urgent, plain-English SMS (maximum 120 characters) to a vehicle owner. Context: 3 consecutive failed biometric access attempts detected. Telemetry: Location is ${lat}, ${lon}. Lock status: ${lock}. Do not include hashtags.`;

    const aiResult = await model.generateContent(prompt);
    let alertMessage = aiResult.response.text().trim();
    
    alertMessage = `${alertMessage}\nLoc: ${mapsLink}`;

    await axios.post('https://www.iprogsms.com/api/v1/sms/send', {
      api_token: process.env.IPROGSMS_TOKEN,
      sender_id: process.env.IPROGSMS_SENDER_ID,
      to: process.env.OWNER_PHONE_NUMBER,
      message: alertMessage
    });
    
  } catch (error) {
    console.error(error);
  }
};

app.post('/api/verify-face', async (req, res) => {
  const { status, faceId } = req.body;

  let payload = {};

  if (status === 'enroll_success') {
    payload = {
      lastVerifiedFace: faceId,
      enrollRequested: false
    };
    failedAttempts = 0;
  } else if (status === 'success') {
    payload = {
      rfidStatus: 'authorized',
      lastVerifiedFace: faceId,
      alarmActive: false
    };
    failedAttempts = 0;
  } else {
    payload = {
      rfidStatus: 'unauthorized',
      lastVerifiedFace: null,
      alarmActive: true
    };
    
    failedAttempts++;
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
    res.status(500).json({ error: "Sync Failed" });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log("Bridge server live on port 3000");
});