const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors());

const DATABASE_URL = "https://anti-theft-system-50561-default-rtdb.asia-southeast1.firebasedatabase.app";
const SECRET = "WqaYphYJ2GmcBetMgCUp1DrU2KzGZ7toeSYD3ABt";
const PATH = `/artifacts/anti-theft-app/public/data/vehicle/status.json?auth=${SECRET}`;

app.post('/api/verify-face', async (req, res) => {
  const { status, faceId } = req.body;

  let payload = {};

  if (status === 'enroll_success') {
    payload = {
      lastVerifiedFace: faceId,
      enrollRequested: false
    };
  } else {
    payload = {
      rfidStatus: status === 'success' ? 'authorized' : 'unauthorized',
      lastVerifiedFace: faceId || null,
      alarmActive: status !== 'success'
    };
  }

  try {
    const response = await fetch(DATABASE_URL + PATH, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Firebase rejection');
    }

    res.status(200).json({ message: "Firebase Synced" });
  } catch (error) {
    res.status(500).json({ error: "Sync Failed" });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log("Bridge server live on port 3000");
});