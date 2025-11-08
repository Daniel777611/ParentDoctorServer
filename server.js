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


// ✅ 静态访问 uploads 文件（Render 云端磁盘路径）
app.use("/uploads", express.static("/opt/render/project/src/uploads"));


// ====== 文件上传设置 ======
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.fieldname}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });






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

      // ✅ 为该医生创建独立文件夹
      const doctorDir = path.join(__dirname, "uploads", doctor_id);
      if (!fs.existsSync(doctorDir)) fs.mkdirSync(doctorDir, { recursive: true });

      // ✅ 将上传的文件分类保存（id_card → /id/ ，license → /license/）
      const saveFileToCategory = (file, category) => {
        if (!file) return null;
        const categoryDir = path.join(doctorDir, category);
        if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

        const safeName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
        const newPath = path.join(categoryDir, safeName);
        fs.renameSync(file.path, newPath);

        // ✅ 数据库中保存相对路径，AI 审核读取时更方便
        return `/uploads/${doctor_id}/${category}/${safeName}`;
      };

      // ✅ 按分类分别保存身份证件与医师执照
      const idCardPath = saveFileToCategory(req.files["id_card"]?.[0], "id");
      const licensePath = saveFileToCategory(req.files["medical_license"]?.[0], "license");


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
