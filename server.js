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
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { runAIReview } = require("./aiReview");
const { sendVerificationCode } = require("./notification");


const app = express();

// ✅ Email Verification Code Storage (in-memory, expires after 10 minutes)
const verificationCodes = new Map(); // email -> { code, expiresAt }

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (data.expiresAt < now) {
      verificationCodes.delete(email);
    }
  }
}

// Clean up expired codes every 5 minutes
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);
const upload = multer({ storage: multer.memoryStorage() }); // ✅ Store files in memory (Render doesn't need local write)

// ✅ Cloudflare R2 Client
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,                   // Format: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   forcePathStyle: true,                                 // ★ Required for R2, avoid 403 Unauthorized
   credentials: {
     accessKeyId: process.env.R2_ACCESS_KEY_ID,
     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
   },
 });
const bucket = process.env.R2_BUCKET_NAME;

// ✅ Basic Settings
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 10000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ PostgreSQL Initialization
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully.");
    // doctor table (auto-create if not exists)
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

// ✅ Health Check
app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Get Doctor List
app.get("/api/doctors", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM doctor ORDER BY id ASC");
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching doctors:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Send Email Verification Code
app.post("/api/verify/send-code", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    // Check if email already registered
    const { rows } = await pool.query("SELECT email FROM doctor WHERE lower(email) = $1 LIMIT 1", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ success: false, message: "This email is already registered." });
    }

    // Generate 6-digit code
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store code
    verificationCodes.set(email, { code, expiresAt });

    // Send email
    const sent = await sendVerificationCode(email, code);
    if (!sent) {
      return res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
    }

    res.json({ success: true, message: "Verification code sent to your email." });
  } catch (err) {
    console.error("❌ Error sending verification code:", err.message);
    res.status(500).json({ success: false, error: "Failed to send verification code." });
  }
});

// ✅ Verify Email Code
app.post("/api/verify/check-code", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const code = (req.body?.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and code are required." });
    }

    const stored = verificationCodes.get(email);
    if (!stored) {
      return res.status(400).json({ success: false, message: "Verification code not found or expired. Please request a new code." });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new code." });
    }

    if (stored.code !== code) {
      return res.status(400).json({ success: false, message: "Invalid verification code. Please try again." });
    }

    // Code is valid, mark email as verified (store in verificationCodes with verified flag)
    verificationCodes.set(email, { ...stored, verified: true });

    res.json({ success: true, message: "Email verified successfully." });
  } catch (err) {
    console.error("❌ Error verifying code:", err.message);
    res.status(500).json({ success: false, error: "Failed to verify code." });
  }
});

// ✅ Upload File to Cloudflare R2
async function uploadToR2(file, doctorId, category) {
  if (!file) return null;

  const key = `HealthAssistance/doctor/doctorsInfo/${doctorId}/${category}/${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer, // ✅ Upload directly from memory
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

// ✅ Delete File from Cloudflare R2
async function deleteFromR2(url) {
  if (!url || !url.includes(".r2.dev/")) return;

  try {
    // Extract key from URL: https://<ACCOUNT_ID>.r2.dev/HealthAssistance/doctor/...
    const urlParts = url.split(".r2.dev/");
    if (urlParts.length < 2) return;

    const key = urlParts[1];
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await r2.send(command);
    console.log(`🗑️  Deleted from R2: ${key}`);
    return true;
  } catch (err) {
    console.error(`❌ R2 Delete Failed (${url}):`, err.message);
    return false;
  }
}

// ✅ Doctor Registration Endpoint
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

      // Check if email is verified
      const emailLower = (email || "").trim().toLowerCase();
      const stored = verificationCodes.get(emailLower);
      if (!stored || !stored.verified) {
        return res.status(400).json({ success: false, message: "Email not verified. Please verify your email first." });
      }

      // Check if email already registered (double check before insert)
      const { rows: existing } = await pool.query("SELECT email FROM doctor WHERE lower(email) = $1 LIMIT 1", [emailLower]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: "This email is already registered." });
      }

      // Generate unique doctor_id
      const doctor_id = "doc_" + uuidv4().split("-")[0];

      // Upload files
      const idCardPath = await uploadToR2(req.files["id_card"]?.[0], doctor_id, "id");
      const licensePath = await uploadToR2(req.files["medical_license"]?.[0], doctor_id, "license");

      // Insert into database
      const result = await pool.query(
        `INSERT INTO doctor (
          doctor_id, first_name, last_name, nation, major, email, phone, id_card, medical_license,
          ai_review_status, ai_confidence, ai_review_notes, reviewed_by, verified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',0.0,'','system',false)
        RETURNING *`,
        [doctor_id, first_name, last_name, nation, major || "", email || "", phone || "", idCardPath, licensePath]
      );

      // ✅ Call AI Review Module (synchronous execution)
      await runAIReview(result.rows[0]);

      // Clear verification code after successful registration
      verificationCodes.delete(emailLower);

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

// ✅ Admin Login
app.post("/api/admin/login", async (req, res) => {
  try {
    const password = req.body?.password || "";
    // Simple password check (you can set this via environment variable)
    const adminPassword = process.env.ADMIN_PASSWORD || "777777";
    
    if (password === adminPassword) {
      res.json({ success: true, message: "Login successful" });
    } else {
      res.status(401).json({ success: false, message: "Invalid password" });
    }
  } catch (err) {
    console.error("❌ Admin login error:", err.message);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// ✅ Delete Single Doctor
app.delete("/api/admin/doctors/:doctorId", async (req, res) => {
  try {
    const doctorId = req.params.doctorId;

    // Get doctor data to extract file URLs
    const { rows } = await pool.query(
      "SELECT id_card, medical_license FROM doctor WHERE doctor_id = $1",
      [doctorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const doctor = rows[0];
    let deletedFiles = 0;

    // Delete files from R2
    if (doctor.id_card) {
      const deleted = await deleteFromR2(doctor.id_card);
      if (deleted) deletedFiles++;
    }
    if (doctor.medical_license) {
      const deleted = await deleteFromR2(doctor.medical_license);
      if (deleted) deletedFiles++;
    }

    // Delete from database
    const deleteResult = await pool.query("DELETE FROM doctor WHERE doctor_id = $1", [doctorId]);

    console.log(`🗑️  Deleted doctor ${doctorId}: ${deletedFiles} file(s) deleted from R2`);
    res.json({
      success: true,
      message: `Doctor deleted successfully. ${deletedFiles} file(s) deleted from R2.`,
      deletedFiles,
    });
  } catch (err) {
    console.error("❌ Error deleting doctor:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Clear All Data (for testing/reset)
app.delete("/api/admin/clear-all", async (req, res) => {
  try {
    // First, get all doctors to extract file URLs
    const { rows: doctors } = await pool.query("SELECT id_card, medical_license FROM doctor WHERE id_card IS NOT NULL OR medical_license IS NOT NULL");

    // Delete files from R2
    let deletedFiles = 0;
    for (const doctor of doctors) {
      if (doctor.id_card) {
        const deleted = await deleteFromR2(doctor.id_card);
        if (deleted) deletedFiles++;
      }
      if (doctor.medical_license) {
        const deleted = await deleteFromR2(doctor.medical_license);
        if (deleted) deletedFiles++;
      }
    }

    // Then delete all doctors from database
    const result = await pool.query("DELETE FROM doctor");
    const deletedCount = result.rowCount || 0;

    // Also clear any other tables if they exist
    try {
      await pool.query("DELETE FROM health_tests");
    } catch (err) {
      // Table might not exist, ignore
    }

    console.log(`🗑️  Cleared all data: ${deletedCount} doctor(s) deleted, ${deletedFiles} file(s) deleted from R2`);
    res.json({
      success: true,
      message: `All data cleared successfully. ${deletedCount} doctor(s) deleted, ${deletedFiles} file(s) deleted from R2.`,
      deletedCount,
      deletedFiles,
    });
  } catch (err) {
    console.error("❌ Error clearing data:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Doctor Login / Status Check
app.post("/api/doctors/login", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const { rows } = await pool.query(
      `SELECT doctor_id, first_name, last_name, email, ai_review_status, ai_review_notes, verified, created_at
       FROM doctor
       WHERE lower(email) = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor not found." });
    }

    res.json({ success: true, doctor: rows[0] });
  } catch (err) {
    console.error("❌ Doctor login error:", err.message);
    res.status(500).json({ success: false, error: "Failed to fetch doctor details." });
  }
});

// ✅ Test Write
app.post("/api/test-write", async (_req, res) => {
  try {
    const { rows } = await pool.query("INSERT INTO health_tests DEFAULT VALUES RETURNING id;");
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Root Route
app.get("/", (_req, res) => {
  res.send("ParentDoctor Server (PostgreSQL + Cloudflare R2) is running.");
});

// ✅ WebSocket Signaling Server
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


// ✅ Auto-review all pending doctors on startup (executed once on startup)
(async () => {
  try {
    const { rows } = await pool.query("SELECT * FROM doctor WHERE ai_review_status='pending'");
    if (rows.length === 0) {
      console.log("🤖 Startup check: No pending doctors to review.");
    } else {
      for (const doctor of rows) {
        await runAIReview(doctor);
      }
      console.log(`🤖 Auto-reviewed ${rows.length} doctor(s) on startup.`);
    }
  } catch (err) {
    console.error("❌ Auto-review on startup failed:", err.message);
  }
})();


server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}\n`);
});
