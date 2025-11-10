// aiReview.js —— 模拟 AI 审查模块
// 未来可以在这里接入真正的 AI 模型（如 OpenAI、Claude、Gemini 等）

require("dotenv").config();
const { Pool } = require("pg");

// ✅ 连接数据库（使用同一条连接字符串）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * 模拟AI审查函数
 * @param {object} doctor - 包含医生的完整数据
 */
async function runAIReview(doctor) {
  try {
    let status = "rejected";
    let confidence = 0.0;
    let notes = "";
    let verified = false;

    // 模拟 AI 审查逻辑
    if (doctor.id_card && doctor.medical_license) {
      status = "approved";
      confidence = 0.98;
      notes = "Files uploaded successfully; simulated AI review passed.";
      verified = true;
    } else {
      status = "rejected";
      confidence = 0.3;
      notes = "Missing one or more required documents; simulated AI review failed.";
      verified = false;
    }

    // ✅ 更新数据库
    await pool.query(
      `UPDATE doctor 
       SET ai_review_status=$1, ai_confidence=$2, ai_review_notes=$3, verified=$4
       WHERE doctor_id=$5`,
      [status, confidence, notes, verified, doctor.doctor_id]
    );

    console.log(`🤖 [AI REVIEW] Doctor ${doctor.doctor_id} => ${status}`);
  } catch (err) {
    console.error("❌ AI Review error:", err.message);
  }
}

/**
 * ✅ 未来接入 AI 模型接口（预留）
 * 在这里调用真正的 AI 服务，例如：
 * - OpenAI API
 * - 自建 AI 审查模型
 */
async function analyzeWithAI(doctorData) {
  // TODO: 调用 AI 审查接口
  // const response = await fetch("https://api.openai.com/v1/...", {...})
  // return AI 审查结果
  return { approved: true, confidence: 0.98, notes: "Mocked AI result" };
}

module.exports = { runAIReview, analyzeWithAI };
