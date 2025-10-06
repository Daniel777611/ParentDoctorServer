// ===== ParentDoctorServer =====
// Real-time chat + ChatGPT API server

import express from "express";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== ChatGPT API Route =====
app.post("/api/chat", async (req, res) => {
  const userMsg = req.body.message;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await response.json();
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error("❌ Chat API Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== WebSocket =====
const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 New WebSocket connection");

  ws.on("message", (msg) => {
    console.log("📩 Received:", msg.toString());
    // 广播给所有客户端
    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => console.log("🔴 Client disconnected"));
});
