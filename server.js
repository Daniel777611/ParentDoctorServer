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
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
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
        avatar TEXT,
        ai_review_status VARCHAR(50) DEFAULT 'pending',
        ai_confidence FLOAT DEFAULT 0.0,
        ai_review_notes TEXT DEFAULT '',
        reviewed_by VARCHAR(100) DEFAULT 'system',
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Add avatar column if table already exists
    await client.query(`
      ALTER TABLE doctor 
      ADD COLUMN IF NOT EXISTS avatar TEXT;
    `);
    
    // ✅ family table (for parents)
    await client.query(`
      CREATE TABLE IF NOT EXISTS family (
        id SERIAL PRIMARY KEY,
        family_id VARCHAR(50) UNIQUE NOT NULL,
        family_name VARCHAR(200),
        email VARCHAR(200),
        phone VARCHAR(50),
        device_id VARCHAR(200),
        invite_code VARCHAR(20) UNIQUE,
        auth_provider VARCHAR(50), -- 'email', 'apple', 'google', 'phone'
        auth_provider_id VARCHAR(200), -- Provider-specific ID (e.g., Apple user ID)
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // ✅ family_member table (each connection information = one family member, e.g., Dad, Mom)
    await client.query(`
      CREATE TABLE IF NOT EXISTS family_member (
        id SERIAL PRIMARY KEY,
        family_id VARCHAR(50) NOT NULL REFERENCES family(family_id) ON DELETE CASCADE,
        member_name VARCHAR(200), -- e.g., "Dad", "Mom"
        role VARCHAR(50), -- 'dad', 'mom', 'guardian', etc.
        email VARCHAR(200),
        phone VARCHAR(50),
        auth_provider VARCHAR(50), -- 'email', 'apple', 'google', 'phone'
        auth_provider_id VARCHAR(200), -- Provider-specific ID
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(family_id, email),
        UNIQUE(family_id, phone)
      );
    `);
    
    // ✅ family_device table (tracks device IDs associated with a family)
    await client.query(`
      CREATE TABLE IF NOT EXISTS family_device (
        id SERIAL PRIMARY KEY,
        family_id VARCHAR(50) NOT NULL REFERENCES family(family_id) ON DELETE CASCADE,
        device_id VARCHAR(200) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // ✅ child table (children information extracted from chat)
    await client.query(`
      CREATE TABLE IF NOT EXISTS child (
        id SERIAL PRIMARY KEY,
        family_id VARCHAR(50) NOT NULL REFERENCES family(family_id) ON DELETE CASCADE,
        child_name VARCHAR(200),
        date_of_birth DATE,
        gender VARCHAR(20),
        medical_record TEXT,
        extracted_from_chat BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_family_invite_code ON family(invite_code);
      CREATE INDEX IF NOT EXISTS idx_family_member_family_id ON family_member(family_id);
      CREATE INDEX IF NOT EXISTS idx_family_member_email ON family_member(email);
      CREATE INDEX IF NOT EXISTS idx_family_member_phone ON family_member(phone);
      CREATE INDEX IF NOT EXISTS idx_family_device_family_id ON family_device(family_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_family_device_device_id ON family_device(device_id);
      CREATE INDEX IF NOT EXISTS idx_child_family_id ON child(family_id);
    `);
    
    // ✅ Migrate existing device_id values into family_device table
    await client.query(`
      INSERT INTO family_device (family_id, device_id)
      SELECT family_id, device_id FROM family
      WHERE device_id IS NOT NULL AND device_id <> ''
      ON CONFLICT (device_id) DO NOTHING;
    `);
    
    client.release();
    console.log("✅ Database tables initialized successfully.");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
  }
})();

// Helper function to get family with all members
async function getFamilyWithMembers(familyId) {
  const { rows: familyRows } = await pool.query(
    `SELECT * FROM family WHERE family_id = $1`,
    [familyId]
  );
  
  if (familyRows.length === 0) {
    return null;
  }
  
  const family = familyRows[0];
  
  // Get all members
  const { rows: memberRows } = await pool.query(
    `SELECT * FROM family_member WHERE family_id = $1 ORDER BY created_at ASC`,
    [familyId]
  );
  
  // Get all children
  const { rows: childRows } = await pool.query(
    `SELECT * FROM child WHERE family_id = $1 ORDER BY created_at ASC`,
    [familyId]
  );
  
  return {
    ...family,
    members: memberRows,
    children: childRows
  };
}

// Helper to attach device to family (ensures family_device table is populated)
async function attachDeviceToFamily(familyId, deviceId) {
  if (!familyId || !deviceId) {
    return false;
  }

  const trimmedDeviceId = deviceId.trim();
  if (!trimmedDeviceId) {
    return false;
  }

  try {
    await pool.query(
      `INSERT INTO family_device (family_id, device_id)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE
       SET family_id = EXCLUDED.family_id,
           created_at = NOW()`,
      [familyId, trimmedDeviceId]
    );

    // Backfill family table's device_id if empty (for compatibility)
    await pool.query(
      `UPDATE family
       SET device_id = $1
       WHERE family_id = $2
         AND (device_id IS NULL OR device_id = '')`,
      [trimmedDeviceId, familyId]
    );

    return true;
  } catch (err) {
    console.error("❌ Error attaching device to family:", err.message);
    return false;
  }
}

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

// ✅ Get All Families (Parents)
app.get("/api/admin/families", async (_req, res) => {
  try {
    // First get all families
    const { rows: families } = await pool.query(`
      SELECT * FROM family 
      ORDER BY created_at DESC
    `);
    
    console.log(`📊 Found ${families.length} families in database`);
    
    // Then get members, children, and devices for each family
    const familiesWithDetails = await Promise.all(
      families.map(async (family) => {
        try {
          // Get members
          let members = [];
          try {
            const memberResult = await pool.query(
              `SELECT * FROM family_member WHERE family_id = $1 ORDER BY created_at ASC`,
              [family.family_id]
            );
            members = memberResult.rows || [];
          } catch (memberErr) {
            console.warn(`⚠️  Error fetching members for family ${family.family_id}:`, memberErr.message);
            members = [];
          }
          
          // Get children
          let children = [];
          try {
            const childResult = await pool.query(
              `SELECT * FROM child WHERE family_id = $1 ORDER BY created_at ASC`,
              [family.family_id]
            );
            children = childResult.rows || [];
          } catch (childErr) {
            console.warn(`⚠️  Error fetching children for family ${family.family_id}:`, childErr.message);
            children = [];
          }
          
          // Get device IDs from family_device table (if table exists)
          let deviceId = family.device_id || null;
          try {
            const deviceResult = await pool.query(
              `SELECT device_id FROM family_device WHERE family_id = $1 ORDER BY created_at ASC LIMIT 1`,
              [family.family_id]
            );
            if (deviceResult.rows && deviceResult.rows.length > 0) {
              deviceId = deviceResult.rows[0].device_id;
            }
          } catch (deviceErr) {
            // Table might not exist or query failed, use family.device_id as fallback
            console.warn(`⚠️  Error fetching device for family ${family.family_id}:`, deviceErr.message);
            deviceId = family.device_id || null;
          }
          
          return {
            ...family,
            device_id: deviceId,
            members: members,
            children: children
          };
        } catch (familyErr) {
          console.error(`❌ Error processing family ${family.family_id}:`, familyErr.message);
          // Return family with empty members and children if processing fails
          return {
            ...family,
            members: [],
            children: []
          };
        }
      })
    );
    
    console.log(`✅ Returning ${familiesWithDetails.length} families with details`);
    res.json({ success: true, count: familiesWithDetails.length, data: familiesWithDetails });
  } catch (err) {
    console.error("❌ Error fetching families:", err.message);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Delete Single Family
app.delete("/api/admin/families/:familyId", async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if family exists
    const { rows: existing } = await pool.query(
      "SELECT * FROM family WHERE family_id = $1",
      [familyId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Family not found." });
    }
    
    // Get all family members to delete their folders from R2
    const { rows: members } = await pool.query(
      "SELECT id, email, phone FROM family_member WHERE family_id = $1",
      [familyId]
    );
    
    let deletedFiles = 0;
    
    // Delete each family member's folder from R2
    for (const member of members) {
      // Use member ID or email/phone as identifier for folder
      const memberIdentifier = member.email || member.phone || `member_${member.id}`;
      const folderPrefix = `HealthAssistance/family/${familyId}/${memberIdentifier}/`;
      const filesDeleted = await deleteFolderFromR2(folderPrefix);
      deletedFiles += filesDeleted;
    }
    
    // Also delete family-level folder if exists
    const familyFolderPrefix = `HealthAssistance/family/${familyId}/`;
    const familyFilesDeleted = await deleteFolderFromR2(familyFolderPrefix);
    deletedFiles += familyFilesDeleted;
    
    // Delete family (cascade will delete members and children)
    const deleteResult = await pool.query(
      "DELETE FROM family WHERE family_id = $1",
      [familyId]
    );
    
    const deletedCount = deleteResult.rowCount || 0;
    console.log(`🗑️  Deleted family ${familyId}: ${deletedFiles} file(s) deleted from R2`);
    
    res.json({
      success: true,
      message: `Family deleted successfully. ${deletedFiles} file(s) deleted from R2.`,
      deletedCount,
      deletedFiles,
    });
  } catch (err) {
    console.error("❌ Error deleting family:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Delete Single Child
app.delete("/api/admin/children/:childId", async (req, res) => {
  try {
    const { childId } = req.params;
    
    // Check if child exists
    const { rows: existing } = await pool.query(
      "SELECT * FROM child WHERE id = $1",
      [childId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Child not found." });
    }
    
    // Delete child
    const deleteResult = await pool.query(
      "DELETE FROM child WHERE id = $1",
      [childId]
    );
    
    const deletedCount = deleteResult.rowCount || 0;
    console.log(`🗑️  Deleted child ${childId}`);
    
    res.json({
      success: true,
      message: `Child deleted successfully.`,
      deletedCount,
    });
  } catch (err) {
    console.error("❌ Error deleting child:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Get All Family Members (Parents)
app.get("/api/admin/members", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, f.family_name, f.invite_code
      FROM family_member m
      LEFT JOIN family f ON m.family_id = f.family_id
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching members:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Delete Single Family Member (Parent)
app.delete("/api/admin/members/:memberId", async (req, res) => {
  try {
    const { memberId } = req.params;
    
    // Check if member exists and get family_id
    const { rows: existing } = await pool.query(
      "SELECT id, family_id, email, phone FROM family_member WHERE id = $1",
      [memberId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Family member not found." });
    }
    
    const member = existing[0];
    
    // Delete member's folder from R2 if exists
    let deletedFiles = 0;
    if (member.family_id) {
      const memberIdentifier = member.email || member.phone || `member_${member.id}`;
      const folderPrefix = `HealthAssistance/family/${member.family_id}/${memberIdentifier}/`;
      deletedFiles = await deleteFolderFromR2(folderPrefix);
    }
    
    // Delete member
    const deleteResult = await pool.query(
      "DELETE FROM family_member WHERE id = $1",
      [memberId]
    );
    
    const deletedCount = deleteResult.rowCount || 0;
    console.log(`🗑️  Deleted family member ${memberId}: ${deletedFiles} file(s) deleted from R2`);
    
    res.json({
      success: true,
      message: `Family member deleted successfully. ${deletedFiles} file(s) deleted from R2.`,
      deletedCount,
      deletedFiles,
    });
  } catch (err) {
    console.error("❌ Error deleting family member:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Get All Children
app.get("/api/admin/children", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, f.family_name, f.email, f.phone 
      FROM child c
      LEFT JOIN family f ON c.family_id = f.family_id
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching children:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Get All Data (Summary)
app.get("/api/admin/all-data", async (_req, res) => {
  try {
    const [doctorsResult, familiesResult, childrenResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM doctor"),
      pool.query("SELECT COUNT(*) as count FROM family"),
      pool.query("SELECT COUNT(*) as count FROM child")
    ]);

    res.json({
      success: true,
      data: {
        doctors: parseInt(doctorsResult.rows[0].count),
        families: parseInt(familiesResult.rows[0].count),
        children: parseInt(childrenResult.rows[0].count)
      }
    });
  } catch (err) {
    console.error("❌ Error fetching summary:", err.message);
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

// ✅ Send Login Verification Code
app.post("/api/login/send-code", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    // Check if email is registered (opposite of registration)
    const { rows } = await pool.query("SELECT email FROM doctor WHERE lower(email) = $1 LIMIT 1", [email]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "This email is not registered." });
    }

    // Generate 6-digit code
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store code with login flag
    verificationCodes.set(`login_${email}`, { code, expiresAt, type: "login" });

    // Send email
    const sent = await sendVerificationCode(email, code);
    if (!sent) {
      return res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
    }

    res.json({ success: true, message: "Verification code sent to your email." });
  } catch (err) {
    console.error("❌ Error sending login verification code:", err.message);
    res.status(500).json({ success: false, error: "Failed to send verification code." });
  }
});

// ✅ Verify Login Code and Get Doctor Info
app.post("/api/login/verify-code", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const code = (req.body?.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and code are required." });
    }

    const stored = verificationCodes.get(`login_${email}`);
    if (!stored) {
      return res.status(400).json({ success: false, message: "Verification code not found or expired. Please request a new code." });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(`login_${email}`);
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new code." });
    }

    if (stored.code !== code) {
      return res.status(400).json({ success: false, message: "Invalid verification code. Please try again." });
    }

    // Code is valid, get doctor info
    const { rows } = await pool.query(
      `SELECT doctor_id, first_name, last_name, email, avatar, ai_review_status, ai_review_notes, verified, created_at
       FROM doctor
       WHERE lower(email) = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor not found." });
    }

    // Clear verification code after successful login
    verificationCodes.delete(`login_${email}`);

    res.json({ success: true, doctor: rows[0], message: "Login successful." });
  } catch (err) {
    console.error("❌ Error verifying login code:", err.message);
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

// ✅ Delete Folder from Cloudflare R2 (delete all objects with prefix)
async function deleteFolderFromR2(prefix) {
  if (!prefix) return 0;
  
  try {
    let deletedCount = 0;
    let continuationToken = undefined;
    
    do {
      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      
      const listResponse = await r2.send(listCommand);
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        break;
      }
      
      // Delete objects in batches (max 1000 per request)
      const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));
      
      if (objectsToDelete.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });
        
        const deleteResponse = await r2.send(deleteCommand);
        deletedCount += objectsToDelete.length;
        console.log(`🗑️  Deleted ${objectsToDelete.length} file(s) from R2 folder: ${prefix}`);
      }
      
      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
    
    console.log(`🗑️  Deleted folder from R2: ${prefix} (${deletedCount} file(s) total)`);
    return deletedCount;
  } catch (err) {
    console.error(`❌ R2 Folder Delete Failed (${prefix}):`, err.message);
    return 0;
  }
}

// ✅ Doctor Registration Endpoint
app.post(
  "/api/doctors",
  upload.fields([
    { name: "id_card", maxCount: 1 },
    { name: "medical_license", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
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
      const avatarPath = await uploadToR2(req.files["avatar"]?.[0], doctor_id, "avatar");

      // Insert into database
      const result = await pool.query(
        `INSERT INTO doctor (
          doctor_id, first_name, last_name, nation, major, email, phone, id_card, medical_license, avatar,
          ai_review_status, ai_confidence, ai_review_notes, reviewed_by, verified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',0.0,'','system',false)
        RETURNING *`,
        [doctor_id, first_name, last_name, nation, major || "", email || "", phone || "", idCardPath, licensePath, avatarPath]
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
      "SELECT id_card, medical_license, avatar FROM doctor WHERE doctor_id = $1",
      [doctorId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // Delete entire doctor folder from R2 (prefix: HealthAssistance/doctor/doctorsInfo/{doctorId}/)
    const folderPrefix = `HealthAssistance/doctor/doctorsInfo/${doctorId}/`;
    const deletedFiles = await deleteFolderFromR2(folderPrefix);

    // Delete from database
    const deleteResult = await pool.query("DELETE FROM doctor WHERE doctor_id = $1", [doctorId]);

    console.log(`🗑️  Deleted doctor ${doctorId}: ${deletedFiles} file(s) deleted from R2 folder`);
    res.json({
      success: true,
      message: `Doctor deleted successfully. ${deletedFiles} file(s) deleted from R2 folder.`,
      deletedFiles,
    });
  } catch (err) {
    console.error("❌ Error deleting doctor:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Update Doctor Avatar
app.post(
  "/api/doctors/avatar",
  upload.single("avatar"),
  async (req, res) => {
    try {
      // Get doctor_id from session or request body
      const doctorId = req.body?.doctor_id;
      if (!doctorId) {
        return res.status(400).json({ success: false, message: "Doctor ID is required." });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: "Avatar file is required." });
      }

      // Check if doctor exists
      const { rows: existing } = await pool.query(
        "SELECT avatar FROM doctor WHERE doctor_id = $1",
        [doctorId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: "Doctor not found." });
      }

      // Delete old avatar if exists
      if (existing[0].avatar) {
        await deleteFromR2(existing[0].avatar);
      }

      // Upload new avatar
      const avatarPath = await uploadToR2(req.file, doctorId, "avatar");

      // Update database
      const result = await pool.query(
        "UPDATE doctor SET avatar = $1 WHERE doctor_id = $2 RETURNING *",
        [avatarPath, doctorId]
      );

      res.json({
        success: true,
        message: "Avatar updated successfully.",
        doctor: result.rows[0],
      });
    } catch (err) {
      console.error("❌ Error updating avatar:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ✅ Clear All Data (for testing/reset)
app.delete("/api/admin/clear-all", async (req, res) => {
  try {
    let deletedFiles = 0;
    
    // Get all doctor IDs and delete their folders
    const { rows: doctors } = await pool.query("SELECT doctor_id FROM doctor");
    for (const doctor of doctors) {
      const folderPrefix = `HealthAssistance/doctor/doctorsInfo/${doctor.doctor_id}/`;
      const filesDeleted = await deleteFolderFromR2(folderPrefix);
      deletedFiles += filesDeleted;
    }

    // Get all families and delete their folders
    const { rows: families } = await pool.query("SELECT family_id FROM family");
    for (const family of families) {
      // Delete family-level folder
      const familyFolderPrefix = `HealthAssistance/family/${family.family_id}/`;
      const familyFilesDeleted = await deleteFolderFromR2(familyFolderPrefix);
      deletedFiles += familyFilesDeleted;
      
      // Get and delete member folders
      const { rows: members } = await pool.query(
        "SELECT id, email, phone FROM family_member WHERE family_id = $1",
        [family.family_id]
      );
      
      for (const member of members) {
        const memberIdentifier = member.email || member.phone || `member_${member.id}`;
        const memberFolderPrefix = `HealthAssistance/family/${family.family_id}/${memberIdentifier}/`;
        const memberFilesDeleted = await deleteFolderFromR2(memberFolderPrefix);
        deletedFiles += memberFilesDeleted;
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

// ✅ Clear Specific Table (clear form)
app.delete("/api/admin/clear/:table", async (req, res) => {
  try {
    const { table } = req.params;
    let deletedCount = 0;
    let deletedFiles = 0;
    let message = "";
    
    if (table === "doctors") {
      // Get all doctor IDs and delete their folders
      const { rows: doctors } = await pool.query("SELECT doctor_id FROM doctor");
      
      // Delete each doctor's folder from R2
      for (const doctor of doctors) {
        const folderPrefix = `HealthAssistance/doctor/doctorsInfo/${doctor.doctor_id}/`;
        const filesDeleted = await deleteFolderFromR2(folderPrefix);
        deletedFiles += filesDeleted;
      }
      
      // Delete all doctors from database
      const result = await pool.query("DELETE FROM doctor");
      deletedCount = result.rowCount || 0;
      message = `All doctors cleared successfully. ${deletedCount} doctor(s) deleted, ${deletedFiles} file(s) deleted from R2.`;
      
    } else if (table === "families") {
      // Get all families with their members
      const { rows: families } = await pool.query("SELECT family_id FROM family");
      
      // Delete each family's folder and member folders from R2
      for (const family of families) {
        // Delete family-level folder
        const familyFolderPrefix = `HealthAssistance/family/${family.family_id}/`;
        const familyFilesDeleted = await deleteFolderFromR2(familyFolderPrefix);
        deletedFiles += familyFilesDeleted;
        
        // Get and delete member folders
        const { rows: members } = await pool.query(
          "SELECT id, email, phone FROM family_member WHERE family_id = $1",
          [family.family_id]
        );
        
        for (const member of members) {
          const memberIdentifier = member.email || member.phone || `member_${member.id}`;
          const memberFolderPrefix = `HealthAssistance/family/${family.family_id}/${memberIdentifier}/`;
          const memberFilesDeleted = await deleteFolderFromR2(memberFolderPrefix);
          deletedFiles += memberFilesDeleted;
        }
      }
      
      // Delete all families (cascade will delete members and children)
      const result = await pool.query("DELETE FROM family");
      deletedCount = result.rowCount || 0;
      message = `All families cleared successfully. ${deletedCount} family(ies) deleted, ${deletedFiles} file(s) deleted from R2.`;
      
    } else if (table === "members") {
      // Get all members to delete their folders from R2
      const { rows: members } = await pool.query(
        "SELECT id, family_id, email, phone FROM family_member"
      );
      
      // Delete each member's folder from R2
      for (const member of members) {
        if (member.family_id) {
          const memberIdentifier = member.email || member.phone || `member_${member.id}`;
          const folderPrefix = `HealthAssistance/family/${member.family_id}/${memberIdentifier}/`;
          const filesDeleted = await deleteFolderFromR2(folderPrefix);
          deletedFiles += filesDeleted;
        }
      }
      
      // Delete all members from database
      const result = await pool.query("DELETE FROM family_member");
      deletedCount = result.rowCount || 0;
      message = `All family members cleared successfully. ${deletedCount} member(s) deleted, ${deletedFiles} file(s) deleted from R2.`;
      
    } else if (table === "children") {
      // Delete all children
      const result = await pool.query("DELETE FROM child");
      deletedCount = result.rowCount || 0;
      message = `All children cleared successfully. ${deletedCount} child(ren) deleted.`;
      
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid table name. Use 'doctors', 'families', 'members', or 'children'." 
      });
    }
    
    console.log(`🗑️  Cleared ${table}: ${deletedCount} record(s) deleted`);
    res.json({
      success: true,
      message,
      deletedCount,
      deletedFiles,
    });
  } catch (err) {
    console.error(`❌ Error clearing ${req.params.table}:`, err.message);
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
      `SELECT doctor_id, first_name, last_name, email, avatar, ai_review_status, ai_review_notes, verified, created_at
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

// ✅ Root Route - Serve index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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


// ✅ Parent/Family Registration - Send Verification Code
app.post("/api/parent/verify/send-code", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const phone = (req.body?.phone || "").trim();
    
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: "Email or phone is required." });
    }
    
    // Check if already registered (check in family_member table)
    // Only check for active members (not soft-deleted)
    if (email) {
      const { rows } = await pool.query(
        "SELECT family_id FROM family_member WHERE lower(email) = $1 LIMIT 1", 
        [email]
      );
      if (rows.length > 0) {
        // Log for debugging
        console.log(`⚠️  Email ${email} already exists in family_member table`);
        return res.status(400).json({ success: false, message: "This email is already registered." });
      }
    }
    if (phone) {
      const { rows } = await pool.query(
        "SELECT family_id FROM family_member WHERE phone = $1 LIMIT 1", 
        [phone]
      );
      if (rows.length > 0) {
        return res.status(400).json({ success: false, message: "This phone number is already registered." });
      }
    }
    
    // Generate 6-digit code
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    // Store code with identifier
    const identifier = email || phone;
    verificationCodes.set(`parent_${identifier}`, { code, expiresAt, email, phone });
    
    // Send verification code
    if (email) {
      // 🔐 DEVELOPMENT ONLY: Log verification code for testing (remove in production)
      // This helps debug when email service is not configured
      console.log(`🔐 [DEV] Verification code for ${email}: ${code}`);
      
      const sent = await sendVerificationCode(email, code);
      if (!sent) {
        console.error(`❌ Failed to send verification code to ${email}. Check email service configuration.`);
        console.error(`   Verification code (for testing): ${code}`);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to send verification code. Please check your email service configuration or try again later. Check server logs for verification code (development mode).",
          error: "Email service not configured or failed to send"
        });
      }
      console.log(`✅ Verification code sent to ${email}`);
    } else if (phone) {
      // TODO: Implement SMS sending via Twilio
      console.log(`📱 SMS verification code for ${phone}: ${code}`);
    }
    
    res.json({ success: true, message: "Verification code sent." });
  } catch (err) {
    console.error("❌ Error sending parent verification code:", err.message);
    res.status(500).json({ success: false, error: "Failed to send verification code." });
  }
});

// ✅ Parent/Family Registration - Verify Code and Register
app.post("/api/parent/register", async (req, res) => {
  try {
    const { email, phone, code, familyName, deviceId, authProvider, authProviderId } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: "Email or phone is required." });
    }
    
    // Verify code (skip for OAuth providers)
    if (authProvider !== "apple" && authProvider !== "google") {
      const identifier = (email || "").trim().toLowerCase() || phone;
      const stored = verificationCodes.get(`parent_${identifier}`);
      
      if (!stored) {
        return res.status(400).json({ success: false, message: "Verification code not found or expired." });
      }
      
      if (Date.now() > stored.expiresAt) {
        verificationCodes.delete(`parent_${identifier}`);
        return res.status(400).json({ success: false, message: "Verification code has expired." });
      }
      
      if (stored.code !== code) {
        return res.status(400).json({ success: false, message: "Invalid verification code." });
      }
    }
    
    // Generate family_id and invite_code (By system)
    const familyId = "fam_" + uuidv4().split("-")[0];
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6-character code
    
    // Generate device_id if not provided (By system)
    // Device ID should be created when user skips login, but if not provided, generate one
    const finalDeviceId = (deviceId && deviceId.trim() !== "") ? deviceId.trim() : "device_" + uuidv4();
    
    console.log(`📱 Registering family with device_id: ${finalDeviceId}`);
    
    // Check if family already exists (by device_id via family_device table)
    let existingFamily = null;
    if (finalDeviceId) {
      const { rows } = await pool.query(
        `SELECT f.*
         FROM family f
         LEFT JOIN family_device fd ON fd.family_id = f.family_id
         WHERE fd.device_id = $1
         LIMIT 1`,
        [finalDeviceId]
      );
      // Backward compatibility: also check legacy device_id column if not found
      if (rows.length === 0) {
        const legacy = await pool.query(
          "SELECT * FROM family WHERE device_id = $1 LIMIT 1",
          [finalDeviceId]
        );
        if (legacy.rows.length > 0) {
          rows.push(legacy.rows[0]);
        }
      }
      if (rows.length > 0) {
        existingFamily = rows[0];
        console.log(`📱 Found existing family by device_id: ${existingFamily.family_id}`);
      }
    }
    
    let finalFamilyId;
    let finalInviteCode;
    
    if (existingFamily) {
      // Use existing family
      finalFamilyId = existingFamily.family_id;
      finalInviteCode = existingFamily.invite_code;
    } else {
      // Create new family (only shared info: family_id, family_name, device_id, invite_code)
      const familyResult = await pool.query(
        `INSERT INTO family (
          family_id, family_name, device_id, invite_code
        ) VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
          familyId,
          familyName || null,
          finalDeviceId,
          inviteCode
        ]
      );
      finalFamilyId = familyResult.rows[0].family_id;
      finalInviteCode = familyResult.rows[0].invite_code;
    }
    
    // Attach the device ID to the family (tracks multiple devices)
    await attachDeviceToFamily(finalFamilyId, finalDeviceId);
    
    // Check if member already exists (by email or phone)
    let memberRole = "parent"; // Default role, can be "dad", "mom", etc.
    if (email) {
      const { rows: existingMember } = await pool.query(
        "SELECT * FROM family_member WHERE family_id = $1 AND lower(email) = $2 LIMIT 1",
        [finalFamilyId, email.trim().toLowerCase()]
      );
      if (existingMember.length > 0) {
        // Member already exists, update if needed
        const updateResult = await pool.query(
          `UPDATE family_member 
           SET auth_provider = $1, auth_provider_id = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [authProvider || "email", authProviderId || null, existingMember[0].id]
        );
        const familyWithMembers = await getFamilyWithMembers(finalFamilyId);
        res.status(200).json({
          success: true,
          message: "Family member updated successfully.",
          family: familyWithMembers,
        });
        return;
      }
    } else if (phone) {
      const { rows: existingMember } = await pool.query(
        "SELECT * FROM family_member WHERE family_id = $1 AND phone = $2 LIMIT 1",
        [finalFamilyId, phone.trim()]
      );
      if (existingMember.length > 0) {
        // Member already exists, update if needed
        const updateResult = await pool.query(
          `UPDATE family_member 
           SET auth_provider = $1, auth_provider_id = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [authProvider || "phone", authProviderId || null, existingMember[0].id]
        );
        const familyWithMembers = await getFamilyWithMembers(finalFamilyId);
        res.status(200).json({
          success: true,
          message: "Family member updated successfully.",
          family: familyWithMembers,
        });
        return;
      }
    }
    
    // Create new family member (each connection information = one member)
    const memberResult = await pool.query(
      `INSERT INTO family_member (
        family_id, member_name, role, email, phone, auth_provider, auth_provider_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        finalFamilyId,
        familyName || null, // Can be "Dad", "Mom", etc.
        memberRole,
        email ? email.trim().toLowerCase() : null,
        phone || null,
        authProvider || "email",
        authProviderId || null
      ]
    );
    
    // Clear verification code
    const identifier = (email || "").trim().toLowerCase() || phone;
    verificationCodes.delete(`parent_${identifier}`);
    
    // Get family with all members
    const familyWithMembers = await getFamilyWithMembers(finalFamilyId);
    
    res.status(201).json({
      success: true,
      message: "Family registered successfully.",
      family: familyWithMembers,
    });
  } catch (err) {
    console.error("❌ Error registering family:", err.message);
    if (err.code === "23505") { // Unique constraint violation
      return res.status(400).json({ success: false, message: "This email or phone is already registered." });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Attach device to family via invite code (before registration)
app.post("/api/parent/invite/attach", async (req, res) => {
  try {
    const inviteCode = (req.body?.inviteCode || "").trim().toUpperCase();
    let deviceId = (req.body?.deviceId || "").trim();

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: "Invite code is required." });
    }

    if (!deviceId) {
      deviceId = "device_" + uuidv4();
    }

    const { rows } = await pool.query(
      "SELECT * FROM family WHERE invite_code = $1 LIMIT 1",
      [inviteCode]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Invalid invite code." });
    }

    const family = rows[0];

    await attachDeviceToFamily(family.family_id, deviceId);

    const familyWithMembers = await getFamilyWithMembers(family.family_id);

    res.json({
      success: true,
      message: "Device attached to family successfully.",
      family: familyWithMembers,
      deviceId,
    });
  } catch (err) {
    console.error("❌ Error attaching device via invite code:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Parent/Family Login - Send Code
app.post("/api/parent/login/send-code", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const phone = (req.body?.phone || "").trim();
    
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: "Email or phone is required." });
    }
    
    // Check if registered (check in family_member table)
    let query = "SELECT * FROM family_member WHERE ";
    let params = [];
    if (email) {
      query += "lower(email) = $1";
      params.push(email);
    } else {
      query += "phone = $1";
      params.push(phone);
    }
    query += " LIMIT 1";
    
    const { rows: memberRows } = await pool.query(query, params);
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: "Account not found. Please register first." });
    }
    
    // Generate code
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const identifier = email || phone;
    verificationCodes.set(`parent_login_${identifier}`, { code, expiresAt });
    
    // Send code
    if (email) {
      const sent = await sendVerificationCode(email, code);
      if (!sent) {
        return res.status(500).json({ success: false, message: "Failed to send verification code." });
      }
    } else if (phone) {
      console.log(`📱 SMS login code for ${phone}: ${code}`);
    }
    
    res.json({ success: true, message: "Verification code sent." });
  } catch (err) {
    console.error("❌ Error sending parent login code:", err.message);
    res.status(500).json({ success: false, error: "Failed to send verification code." });
  }
});

// ✅ Parent/Family Login - Verify Code
app.post("/api/parent/login/verify-code", async (req, res) => {
  try {
    const { email, phone, code } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: "Email or phone is required." });
    }
    
    // Verify code
    const identifier = (email || "").trim().toLowerCase() || phone;
    const stored = verificationCodes.get(`parent_login_${identifier}`);
    
    if (!stored) {
      console.log(`⚠️  No verification code found for ${identifier}`);
      return res.status(400).json({ success: false, message: "Verification code not found. Please request a new code." });
    }
    
    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(`parent_login_${identifier}`);
      console.log(`⚠️  Verification code expired for ${identifier}`);
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new code." });
    }
    
    if (stored.code !== code) {
      console.log(`⚠️  Invalid verification code for ${identifier}. Expected: ${stored.code}, Got: ${code}`);
      return res.status(400).json({ success: false, message: "Invalid verification code. Please check and try again." });
    }
    
    // Find member by email or phone
    let memberQuery = "SELECT * FROM family_member WHERE ";
    let memberParams = [];
    if (email) {
      memberQuery += "lower(email) = $1";
      memberParams.push(email);
    } else {
      memberQuery += "phone = $1";
      memberParams.push(phone);
    }
    memberQuery += " LIMIT 1";
    
    const { rows: memberRows } = await pool.query(memberQuery, memberParams);
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }
    
    const member = memberRows[0];
    
    // Get family info with all members
    const familyWithMembers = await getFamilyWithMembers(member.family_id);
    if (!familyWithMembers) {
      return res.status(404).json({ success: false, message: "Family not found." });
    }
    
    // Clear code
    verificationCodes.delete(`parent_login_${identifier}`);
    
    res.json({ success: true, family: familyWithMembers, message: "Login successful." });
  } catch (err) {
    console.error("❌ Error verifying parent login code:", err.message);
    res.status(500).json({ success: false, error: "Failed to verify code." });
  }
});

// ✅ Get Family Info
app.get("/api/parent/family/:familyId", async (req, res) => {
  try {
    const { familyId } = req.params;
    const familyWithMembers = await getFamilyWithMembers(familyId);
    
    if (!familyWithMembers) {
      return res.status(404).json({ success: false, message: "Family not found." });
    }
    
    res.json({ success: true, family: familyWithMembers });
  } catch (err) {
    console.error("❌ Error fetching family:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Add/Update Child Info (from chat extraction)
app.post("/api/parent/child", async (req, res) => {
  try {
    const { familyId, childName, dateOfBirth, gender, medicalRecord } = req.body;
    
    if (!familyId) {
      return res.status(400).json({ success: false, message: "Family ID is required." });
    }
    
    // Check if child with same name exists for this family
    const { rows: existing } = await pool.query(
      "SELECT id FROM child WHERE family_id = $1 AND child_name = $2 LIMIT 1",
      [familyId, childName]
    );
    
    if (existing.length > 0) {
      // Update existing
      const result = await pool.query(
        `UPDATE child 
         SET date_of_birth = $1, gender = $2, medical_record = $3, updated_at = NOW()
         WHERE family_id = $4 AND child_name = $5
         RETURNING *`,
        [dateOfBirth || null, gender || null, medicalRecord || null, familyId, childName]
      );
      res.json({ success: true, child: result.rows[0], message: "Child info updated." });
    } else {
      // Insert new
      const result = await pool.query(
        `INSERT INTO child (family_id, child_name, date_of_birth, gender, medical_record)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [familyId, childName, dateOfBirth || null, gender || null, medicalRecord || null]
      );
      res.json({ success: true, child: result.rows[0], message: "Child info added." });
    }
  } catch (err) {
    console.error("❌ Error adding child info:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
