// ----------------------
// ParentDoctorServer WebRTC Signaling Server
// ----------------------
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------
// Express setup
// ----------------------
const app = express();
const server = http.createServer(app);

// Serve static files (doctor web UI)
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "doctor.html"));
});

// ----------------------
// WebSocket Signaling
// ----------------------
const wss = new WebSocketServer({ server, path: "/ws" });

// 存储在线客户端: { id, role, ws }
const clients = new Map();

wss.on("connection", (ws) => {
  console.log("✅ WebSocket client connected");

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch (err) {
      console.error("❌ Invalid JSON message:", err);
      return;
    }

    // 注册阶段
    if (msg.type === "register") {
      ws.id = msg.id || Math.random().toString(36).substring(2, 8);
      ws.role = msg.role || "unknown";
      clients.set(ws.id, ws);
      console.log(`🟢 Registered ${ws.role}: ${ws.id}`);
      ws.send(JSON.stringify({ type: "registered", id: ws.id }));
      return;
    }

    // 信令转发阶段
    if (msg.type === "signal" && msg.to && msg.payload) {
      const target = clients.get(msg.to);
      if (target && target.readyState === target.OPEN) {
        target.send(JSON.stringify({
          type: "signal",
          from: msg.from,
          payload: msg.payload
        }));
        console.log(`📡 Signal relayed from ${msg.from} → ${msg.to}`);
      } else {
        console.log(`⚠️ Target ${msg.to} is offline`);
      }
      return;
    }
  });

  ws.on("close", () => {
    if (ws.id && clients.has(ws.id)) {
      clients.delete(ws.id);
      console.log(`🔴 ${ws.role || "client"} disconnected: ${ws.id}`);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Server running on port ${PORT}`)
);
