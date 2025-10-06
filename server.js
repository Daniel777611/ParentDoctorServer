import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// ✅ 托管静态网页（public 文件夹内的 doctor.html）
app.use(express.static(path.join(__dirname, "public")));

// ✅ /doctor 路径显示 doctor.html
app.get("/doctor", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "doctor.html"));
});

// ✅ 测试根路径
app.get("/", (req, res) => {
  res.send("✅ ParentDoctor Server is running and serving doctor console!");
});

// ======== WebSocket 信令部分 ======== //
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 New WebSocket connection");

  ws.on("message", (msg) => {
    console.log("💬 Received:", msg.toString());

    // 广播给所有客户端
    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("🔴 Client disconnected");
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
