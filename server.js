// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// 静态网页：public/doctor.html
app.use(express.static(path.join(__dirname, "public")));
app.get("/doctor", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "doctor.html"));
});
app.get("/", (req, res) => {
  res.send("✅ ParentDoctor signaling server is running.");
});

// --- WebSocket 信令：/ws ---
const wss = new WebSocketServer({ server, path: "/ws" });

// 在线客户端字典：id -> ws
const clients = new Map();

// 心跳保活（Render 等平台很有用）
function heartbeat() { this.isAlive = true; }
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  console.log("🟢 WS connected");

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); }
    catch { return; }

    // 1) 客户端注册：{type:'register', id:'parent' | 'doctor1' ...}
    if (msg.type === "register" && msg.id) {
      ws._id = msg.id;
      clients.set(ws._id, ws);
      console.log(`👤 registered: ${ws._id}`);
      // 可选：回个确认
      ws.send(JSON.stringify({ type: "registered", id: ws._id }));
      return;
    }

    // 2) 信令转发：{type:'signal', from, to, payload:{offer|answer|candidate}}
    if (msg.type === "signal" && msg.to && msg.payload) {
      const target = clients.get(msg.to);
      if (target && target.readyState === target.OPEN) {
        target.send(JSON.stringify(msg));
      } else {
        console.log(`❌ target offline: ${msg.to}`);
      }
      return;
    }
  });

  ws.on("close", () => {
    if (ws._id) {
      clients.delete(ws._id);
      console.log(`🔴 disconnected: ${ws._id}`);
    } else {
      console.log("🔴 disconnected");
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
