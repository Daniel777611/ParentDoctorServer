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
// Express
// ----------------------
const app = express();
const server = http.createServer(app);

// 静态页面：医生控制台
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "doctor.html"));
});

// ----------------------
// WebSocket signaling
// ----------------------
const wss = new WebSocketServer({ server, path: "/ws" });

// 在线表：id -> ws
const clients = new Map();

wss.on("connection", (ws) => {
  console.log("✅ WebSocket client connected");

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); }
    catch (e) { console.error("❌ Invalid JSON:", e); return; }

    // 注册
    if (msg.type === "register") {
      ws.id = msg.id || msg.role || `anon_${Math.random().toString(36).slice(2,8)}`;
      ws.role = msg.role || ws.id;
      clients.set(ws.id, ws);
      console.log(`🟢 Registered ${ws.role}: ${ws.id}`);
      ws.send(JSON.stringify({ type: "registered", id: ws.id }));
      return;
    }

    // 兼容：如果直接发 offer/answer/candidate（无外层 type）
    if (msg.offer || msg.answer || msg.candidate) {
      msg = { type: "signal", from: msg.from, to: msg.to, payload: msg };
    }

    // 转发
    if (msg.type === "signal" && msg.to) {
      const to = msg.to;
      const dst = clients.get(to);
      if (dst && dst.readyState === 1) {
        dst.send(JSON.stringify({ type: "signal", from: msg.from, to, payload: msg.payload }));
        console.log(`➡️ Signal relayed from ${msg.from} -> ${to}`);
      } else {
        console.log(`⚠️ No live client for id=${to}`);
      }
      return;
    }
  });

  ws.on("close", () => {
    if (ws.id && clients.get(ws.id) === ws) {
      clients.delete(ws.id);
      console.log(`🔴 ${ws.role || "client"} disconnected: ${ws.id}`);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
