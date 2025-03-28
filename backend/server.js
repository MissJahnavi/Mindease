const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const { db, API_KEY } = require("./firebase");
const axios = require("axios");
const firebaseApp = require('./fb.js');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require("firebase/auth");

const auth = getAuth(firebaseApp);

const app = express();
app.use(cors());
app.use(express.json());

const journalCollection = db.collection("journal");
const moodsCollection = db.collection("moods");

// Account Endpoints
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userRecord = await createUserWithEmailAndPassword(auth, email, password);
    res.status(201).json({ 
      message: "User created successfully", 
      user: { uid: userRecord.user.uid, email: userRecord.user.email }
    });
    
  } catch (error) {
    res.status(400).json({ 
      message: "Error creating user", 
      error: error.code || "Unknown error" 
    });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body; // Token received from frontend
  
  try {
    
    const userRecord = await signInWithEmailAndPassword(auth, email, password);
    res.status(201).json({ 
      message: true
    });

  } catch (error) {
    res.status(401).json({ 
      message: "Invalid token", 
      error: error.message || "Unknown error" 
    });
  }
});

// Moods Endpoint
app.post("/mood", async (req, res) => {
    try {
      const { userId, mood, timestamp } = req.body;
  
      if (!userId || !mood) {
        return res.status(400).json({ error: "User ID and Mood are required" });
      }
  
      const moodEntry = {
        userId,
        mood,
        timestamp: timestamp ? new Date(timestamp) : new Date(), // Default to current time
      };
  
      await moodsCollection.add(moodEntry);
      res.status(201).json({ message: "Mood recorded successfully" });
    } catch (error) {
      console.error("Error recording mood:", error);
      res.status(500).json({ error: "Failed to record mood" });
    }
  });
  
  // Endpoint to get the latest mood for a user
  
  app.get("/mood/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
  
      const snapshot = await moodsCollection
        .where("userId", "==", userId)
        .orderBy("userId")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();
  
      if (snapshot.empty) {
        return res.status(404).json({ message: "No mood found for this user" });
      }
  
      let latestMood = snapshot.docs[0].data();
      
      // Convert Firestore Timestamp to JavaScript Date
      if (latestMood.timestamp && latestMood.timestamp.toDate) {
        latestMood.timestamp = latestMood.timestamp.toDate().toISOString();
      }
  
      res.status(200).json(latestMood);
    } catch (error) {
      console.error("Error fetching mood:", error);
      res.status(500).json({ error: "Failed to fetch mood" });
    }
  });

// Journal Endpoints
app.get("/jentries", async (req, res) => {
  try {
    const snapshot = await journalCollection.orderBy("timestamp", "desc").get();
    if (snapshot.empty) {
      return res.status(404).json({ message: "No journal entries found" });
    }

    const entries = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/jentry/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await journalCollection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/jlog", async (req, res) => {
  try {
    const { text, date } = req.body;

    if (!text || !date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newEntry = {
      text,
      date: new Date(date),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await journalCollection.add(newEntry);
    res.status(201).json({ message: "Journal entry added", id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gemini
app.post("/gemini", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.status(400).json({ response: "No message provided." });
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        contents: [{ role: "user", parts: [{ text: message }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const geminiResponse =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from Gemini.";
    res.json({ response: geminiResponse });
  } catch (error) {
    console.error("Error:", error?.response?.data || error.message);
    res.status(500).json({
      response: "Oops! Something went wrong. Check your API key or connection.",
    });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
