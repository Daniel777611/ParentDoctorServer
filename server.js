// server.js —— Express + PostgreSQL + WS + Cloudflare R2
require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { runAIReview } = require("./aiReview");


const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // ✅ 文件直接存内存（Render 无需本地写入）

// ✅ Cloudflare R2 客户端
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,                   // 形如 https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   forcePathStyle: true,                                 // ★ R2 必需，避免 403 Unauthorized
   credentials: {
     accessKeyId: process.env.R2_ACCESS_KEY_ID,
     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
   },
 });
const bucket = process.env.R2_BUCKET_NAME;

// ✅ 基础设置
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ PostgreSQL 初始化
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully.");
    // doctor 表（如果不存在则自动创建）
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor (
        id SERIAL PRIMARY KEY,
        doctor_id VARCHAR(50),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        nation VARCHAR(100),
        major VARCHAR(200),
        email VARCHAR(200),
        phone VARCHAR(50),
        id_card TEXT,
        medical_license TEXT,
        ai_review_status VARCHAR(50) DEFAULT 'pending',
        ai_confidence FLOAT DEFAULT 0.0,
        ai_review_notes TEXT DEFAULT '',
        reviewed_by VARCHAR(100) DEFAULT 'system',
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    client.release();
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
  }
})();

// ✅ 健康检查
app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ 获取医生列表
app.get("/api/doctors", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM doctor ORDER BY id ASC");
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching doctors:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ 上传文件到 Cloudflare R2
async function uploadToR2(file, doctorId, category) {
  if (!file) return null;

  const key = `HealthAssistance/doctor/doctorsInfo/${doctorId}/${category}/${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer, // ✅ 从内存直接上传
      ContentType: file.mimetype,
    });

    await r2.send(command);
    console.log(`✅ Uploaded: ${key}`);
    return `https://${process.env.R2_ACCOUNT_ID}.r2.dev/${key}`;
  } catch (err) {
    console.error("❌ R2 Upload Failed:", err.message);
    throw new Error("Failed to upload to R2: " + err.message);
  }
}

// ✅ 医生注册接口
app.post(
  "/api/doctors",
  upload.fields([
    { name: "id_card", maxCount: 1 },
    { name: "medical_license", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { first_name, last_name, nation, major, email, phone } = req.body;

      if (!first_name || !last_name || !nation) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      // 生成唯一 doctor_id
      const doctor_id = "doc_" + uuidv4().split("-")[0];

      // 上传文件
      const idCardPath = await uploadToR2(req.files["id_card"]?.[0], doctor_id, "id");
      const licensePath = await uploadToR2(req.files["medical_license"]?.[0], doctor_id, "license");

      // 写入数据库
      const result = await pool.query(
        `INSERT INTO doctor (
          doctor_id, first_name, last_name, nation, major, email, phone, id_card, medical_license,
          ai_review_status, ai_confidence, ai_review_notes, reviewed_by, verified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',0.0,'','system',false)
        RETURNING *`,
        [doctor_id, first_name, last_name, nation, major || "", email || "", phone || "", idCardPath, licensePath]
      );

      // ✅ 调用 AI 审查模块（同步等待执行）
        await runAIReview(result.rows[0]);



      res.status(201).json({
        success: true,
        message: "Doctor registered successfully with files uploaded to R2.",
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
    const { rows } = await pool.query("INSERT INTO health_tests DEFAULT VALUES RETURNING id;");
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ 根路由
app.get("/", (_req, res) => {
  res.send("ParentDoctor Server (PostgreSQL + Cloudflare R2) is running.");
});

// ✅ WebSocket 信令服务器
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
      }
    } catch (err) {
      console.error("❌ WS message error:", err.message);
    }
  });

  ws.on("close", () => {
    if (myId) peers.delete(myId);
  });
});


// ✅ 启动时自动审查所有未审核医生（仅启动时执行一次）
(async () => {
  try {
    const { rows } = await pool.query("SELECT * FROM doctor WHERE ai_review_status='pending'");
    if (rows.length === 0) {
      console.log("🤖 启动时检查：没有待审查的医生。");
    } else {
      for (const doctor of rows) {
        await runAIReview(doctor);
      }
      console.log(`🤖 启动时已自动审查 ${rows.length} 位医生。`);
    }
  } catch (err) {
    console.error("❌ 启动时自动审查失败:", err.message);
  }
})();


server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}\n`);
});
