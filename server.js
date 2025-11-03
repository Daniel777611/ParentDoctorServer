// server.js —— Express + PostgreSQL + WS + 静态文件（Render 可直接跑）
require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ====== PostgreSQL 连接 ======
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully.");
    await client.query(`
      CREATE TABLE IF NOT EXISTS health_tests (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    client.release();
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
  }
})();

// 健康检查
app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 测试写入
app.post("/api/test-write", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "INSERT INTO health_tests DEFAULT VALUES RETURNING id;"
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 基础路由
app.get("/", (_req, res) => {
  res.send("ParentDoctor Server (PostgreSQL version) is running.");
});

/* -------------------------- WebSocket 信令 -------------------------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const peers = new Map(); // id -> ws
wss.on("connection", (ws) => {
  let myId = null;

  ws.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString() || "{}");

      if (msg.type === "register") {
        myId = String(msg.id || "anon_" + Date.now());
        peers.set(myId, ws);
        ws.send(JSON.stringify({ type: "registered", id: myId }));
        return;
      }

      if (msg.type === "signal" && msg.to) {
        const peer = peers.get(String(msg.to));
        if (peer && peer.readyState === ws.OPEN) {
          peer.send(JSON.stringify(msg));
        }
        return;
      }
    } catch (err) {
      console.error("❌ WS message error:", err.message);
    }
  });

  ws.on("close", () => {
    if (myId) peers.delete(myId);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}\n`);
});
