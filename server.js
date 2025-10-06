// ===== Import dependencies =====
import express from "express";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ===== Basic HTTP Route =====
app.get("/", (req, res) => {
  res.send("✅ ParentDoctor Server is running!");
});

// ===== Chat API Endpoint =====
app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message || "";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response";
    res.json({ reply });
  } catch (err) {
    console.error("Chat API Error:", err);
    res.status(500).json({ error: "Chat API failed" });
  }
});

// ===== Start HTTP Server =====
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

// ===== WebSocket Signaling for WebRTC =====
const wss = new WebSocketServer({ server });

const peers = new Map();

wss.on("connection", (ws) => {
  console.log("🟢 New WebSocket connection established");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 Received:", data);

      // Handle registration
      if (data.type === "register") {
        peers.set(data.id, ws);
        console.log(`✅ Registered client: ${data.id}`);
        return;
      }

      // Forward signaling messages
      if (data.type === "signal" && data.to) {
        const target = peers.get(data.to);
        if (target && target.readyState === ws.OPEN) {
          target.send(
            JSON.stringify({
              type: "signal",
              from: data.from,
              payload: data.payload,
            })
          );
          console.log(`➡️ Forwarded signal from ${data.from} to ${data.to}`);
        } else {
          console.log(`⚠️ Target ${data.to} not found or not open`);
        }
      }
    } catch (err) {
      console.error("❌ Error parsing WS message:", err);
    }
  });

  ws.on("close", () => {
    for (const [id, sock] of peers.entries()) {
      if (sock === ws) {
        peers.delete(id);
        console.log(`🔴 Client ${id} disconnected`);
      }
    }
  });
});
