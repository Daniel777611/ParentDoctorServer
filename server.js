// server.js —— Express + PostgreSQL + WS + 静态文件（Render 可直接跑）
require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");
const multer = require("multer");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // ✅ 直接从内存上传到R2


// ✅ Cloudflare R2 Client
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.R2_BUCKET_NAME;




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
})







// ✅ 健康检查
app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ 获取医生列表 API
app.get("/api/doctors", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM doctor ORDER BY id ASC");
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("❌ Error fetching doctors:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ✅ 医生注册接口（支持文件上传 + 独立文件目录 + 随机医生ID + 兼容AI审核）
app.post(
  "/api/doctors",
  upload.fields([
    { name: "id_card", maxCount: 1 },
    { name: "medical_license", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // ✨ 新增 email、phone 字段接收
      const { first_name, last_name, nation, major, email, phone } = req.body;

      if (!first_name || !last_name || !nation) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      // ✅ 生成唯一 doctor_id
      const doctor_id = "doc_" + uuidv4().split("-")[0];

      // ✅ 上传文件到 Cloudflare R2
async function uploadToR2(file, doctorId, category) {
  if (!file) return null;

  const key = `HealthAssistance/doctor/doctorsInfo/${doctorId}/${category}/${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

  // ✅ 直接使用内存中的文件 buffer（Render 不写磁盘）
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await r2.send(command);
  console.log(`✅ Uploaded: ${key}`);
  return `https://${process.env.R2_ACCOUNT_ID}.r2.dev/${key}`;
}


// ✅ 上传身份证件与行医执照文件
const idCardPath = await uploadToR2(req.files["id_card"]?.[0], doctor_id, "id");
const licensePath = await uploadToR2(req.files["medical_license"]?.[0], doctor_id, "license");


      // ✅ 插入数据库（为未来AI审核、通知系统预留字段）
      const result = await pool.query(
        `INSERT INTO doctor (
          doctor_id, first_name, last_name, nation, major,
          email, phone,
          id_card, medical_license,
          ai_review_status, ai_confidence, ai_review_notes, reviewed_by, verified
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',0.0,'','system',false)
        RETURNING *`,
        [doctor_id, first_name, last_name, nation, major || "", email || "", phone || "", idCardPath, licensePath]
      );

      res.status(201).json({
        success: true,
        message: "Doctor registered successfully with files.",
        doctor: result.rows[0],
      });

    } catch (err) {
      console.error("❌ Error registering doctor:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ✅ 测试写入
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

// ✅ 浏览器访问根路径时的默认返回
app.get("/", (_req, res) => {
  res.send("ParentDoctor Server (PostgreSQL version) is running.");
})


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
