// aiReview.js —— AI Review Module
// In the future, you can integrate real AI models here (e.g., OpenAI, Claude, Gemini, etc.)

require("dotenv").config();
const { Pool } = require("pg");
const { sendReviewNotification } = require("./notification");

// ✅ Database connection (using the same connection string)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * AI Review Function
 * @param {object} doctor - Complete doctor data object
 */
async function runAIReview(doctor) {
  try {
    let status = "rejected";
    let confidence = 0.0;
    let notes = "";
    let verified = false;

    // Simulated AI review logic
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

    // ✅ Update database
    await pool.query(
      `UPDATE doctor 
       SET ai_review_status=$1, ai_confidence=$2, ai_review_notes=$3, verified=$4
       WHERE doctor_id=$5`,
      [status, confidence, notes, verified, doctor.doctor_id]
    );

    console.log(`🤖 [AI REVIEW] Doctor ${doctor.doctor_id} => ${status}`);

    // ✅ Send review result notification (Email + SMS)
    try {
      console.log(`📬 Attempting to send notifications for doctor ${doctor.doctor_id}`);
      console.log(`   - Email: ${doctor.email || '(empty)'}`);
      console.log(`   - Phone: ${doctor.phone || '(empty)'}`);
      
      const notificationResult = await sendReviewNotification(doctor, status, notes);
      
      if (notificationResult.emailSent) {
        console.log(`✅ Email notification sent to ${doctor.email}`);
      } else {
        console.log(`⚠️  Email notification not sent (check email value and SMTP configuration)`);
      }
      
      if (notificationResult.smsSent) {
        console.log(`✅ SMS notification sent to ${doctor.phone}`);
      } else {
        console.log(`⚠️  SMS notification not sent (check phone value and Twilio configuration)`);
      }
      
      if (!notificationResult.emailSent && !notificationResult.smsSent) {
        console.log(`⚠️  No notifications sent. Please check:`);
        console.log(`   1. Email/Phone values in database`);
        console.log(`   2. SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS)`);
        console.log(`   3. Twilio environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)`);
      }
    } catch (notifyErr) {
      console.error("❌ Notification sending failed:", notifyErr.message);
      console.error("   Stack trace:", notifyErr.stack);
      // Notification failure does not affect review process, only log error
    }
  } catch (err) {
    console.error("❌ AI Review error:", err.message);
  }
}

/**
 * ✅ Future AI model integration (reserved)
 * Call real AI services here, for example:
 * - OpenAI API
 * - Custom AI review model
 */
async function analyzeWithAI(doctorData) {
  // TODO: Call AI review API
  // const response = await fetch("https://api.openai.com/v1/...", {...})
  // return AI review result
  return { approved: true, confidence: 0.98, notes: "Mocked AI result" };
}

module.exports = { runAIReview, analyzeWithAI };
