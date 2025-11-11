// notification.js —— Review Result Notification Service (Email + SMS)
require("dotenv").config();
const nodemailer = require("nodemailer");
const twilio = require("twilio");

// ✅ Email Service Configuration
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log("✅ Email service configured");
} else {
  console.log("⚠️  Email service not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS)");
}

// ✅ SMS Service Configuration
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log("✅ SMS service configured");
} else {
  console.log("⚠️  SMS service not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)");
}

/**
 * Send review result email
 * @param {string} email - Doctor email
 * @param {string} firstName - Doctor first name
 * @param {string} lastName - Doctor last name
 * @param {string} status - Review status ('approved' | 'rejected')
 * @param {string} notes - Review notes
 * @returns {Promise<boolean>} Whether sending was successful
 */
async function sendEmailNotification(email, firstName, lastName, status, notes) {
  if (!mailTransporter) {
    console.log("⚠️  Email service not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS), skipping email notification");
    return false;
  }
  if (!email || email.trim() === "") {
    console.log("⚠️  Email is empty, skipping email notification");
    return false;
  }

  try {
    const isApproved = status === "approved";
    const subject = isApproved
      ? "🎉 Doctor Registration Approved - ParentDoctor"
      : "❌ Doctor Registration Not Approved - ParentDoctor";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${isApproved ? "#16a34a" : "#ef4444"}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .status { font-size: 24px; font-weight: bold; margin: 20px 0; color: ${isApproved ? "#16a34a" : "#ef4444"}; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${isApproved ? "✅ Approved" : "❌ Not Approved"}</h1>
          </div>
          <div class="content">
            <p>Dear Dr. ${firstName} ${lastName},</p>
            <p>Thank you for registering with ParentDoctor platform.</p>
            <div class="status">
              ${isApproved ? "🎉 Congratulations! Your registration has been approved." : "We regret to inform you that your registration has not been approved."}
            </div>
            ${notes ? `<p><strong>Review Notes:</strong></p><p>${notes}</p>` : ""}
            ${isApproved 
              ? `<p>You can now log in to the platform and start providing services to patients.</p><p><a href="${process.env.APP_URL || "https://your-app-url.com"}/doctor.html" style="background: #333; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">Go to Doctor Console</a></p>`
              : `<p>If you have any questions, please contact our support team.</p>`
            }
            <div class="footer">
              <p>This email is automatically sent by ParentDoctor system. Please do not reply.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Dear Dr. ${firstName} ${lastName},

Thank you for registering with ParentDoctor platform.

${isApproved ? "🎉 Congratulations! Your registration has been approved." : "We regret to inform you that your registration has not been approved."}

${notes ? `Review Notes: ${notes}` : ""}

${isApproved 
  ? "You can now log in to the platform and start providing services to patients."
  : "If you have any questions, please contact our support team."
}

This email is automatically sent by ParentDoctor system. Please do not reply.
    `;

    const info = await mailTransporter.sendMail({
      from: `"ParentDoctor" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`✅ Email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Email sending failed (${email}):`, error.message);
    
    // Provide detailed error information for troubleshooting
    if (error.message.includes("Invalid login") || error.message.includes("BadCredentials")) {
      console.error(`   🔍 Troubleshooting Gmail authentication:`);
      console.error(`   1. Check if App Password is correct (16 characters, no spaces)`);
      console.error(`   2. Verify SMTP_USER is correct: ${process.env.SMTP_USER || '(not set)'}`);
      console.error(`   3. Verify SMTP_PASS length: ${process.env.SMTP_PASS ? process.env.SMTP_PASS.length + ' characters' : '(not set)'}`);
      console.error(`   4. Make sure Two-Step Verification is enabled on Gmail account`);
      console.error(`   5. Generate a new App Password if needed: https://myaccount.google.com/apppasswords`);
      console.error(`   6. Ensure no extra spaces in SMTP_PASS environment variable`);
    }
    
    return false;
  }
}

/**
 * Send review result SMS
 * @param {string} phone - Doctor phone number (must include country code, e.g., +86...)
 * @param {string} firstName - Doctor first name
 * @param {string} lastName - Doctor last name
 * @param {string} status - Review status ('approved' | 'rejected')
 * @returns {Promise<boolean>} Whether sending was successful
 */
async function sendSMSNotification(phone, firstName, lastName, status) {
  if (!twilioClient) {
    console.log("⚠️  SMS service not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER), skipping SMS notification");
    return false;
  }
  if (!phone || phone.trim() === "") {
    console.log("⚠️  Phone is empty, skipping SMS notification");
    return false;
  }

  try {
    const isApproved = status === "approved";
    const message = isApproved
      ? `🎉 Dear Dr. ${firstName} ${lastName}, your ParentDoctor registration has been approved. You can now log in and start providing services.`
      : `❌ Dear Dr. ${firstName} ${lastName}, we regret to inform you that your ParentDoctor registration has not been approved. Please contact support if you have questions.`;

    // Ensure phone number format is correct (must include country code)
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith("+")) {
      // If no country code, default to +1 (USA), you can modify this based on your needs
      formattedPhone = `+1${formattedPhone}`;
    }

    const messageResult = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });

    console.log(`✅ SMS sent to ${formattedPhone}: ${messageResult.sid}`);
    return true;
  } catch (error) {
    console.error(`❌ SMS sending failed (${phone}):`, error.message);
    return false;
  }
}

/**
 * Send review result notification (Email + SMS)
 * @param {object} doctor - Doctor data object
 * @param {string} status - Review status ('approved' | 'rejected')
 * @param {string} notes - Review notes
 * @returns {Promise<object>} Sending result { emailSent: boolean, smsSent: boolean }
 */
async function sendReviewNotification(doctor, status, notes) {
  const result = {
    emailSent: false,
    smsSent: false,
  };

  // Send email
  if (doctor.email) {
    result.emailSent = await sendEmailNotification(
      doctor.email,
      doctor.first_name || "",
      doctor.last_name || "",
      status,
      notes || ""
    );
  }

  // Send SMS
  if (doctor.phone) {
    result.smsSent = await sendSMSNotification(
      doctor.phone,
      doctor.first_name || "",
      doctor.last_name || "",
      status
    );
  }

  return result;
}

/**
 * Send email verification code
 * @param {string} email - Email address to send code to
 * @param {string} code - 6-digit verification code
 * @returns {Promise<boolean>} Whether sending was successful
 */
async function sendVerificationCode(email, code) {
  if (!mailTransporter) {
    console.log("⚠️  Email service not configured, skipping verification code email");
    return false;
  }
  if (!email || email.trim() === "") {
    console.log("⚠️  Email is empty, skipping verification code email");
    return false;
  }

  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #222; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .code-box { background: #fff; border: 2px dashed #222; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #222; font-family: monospace; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ParentDoctor Email Verification</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Thank you for registering with ParentDoctor. Please use the verification code below to complete your registration:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
            <div class="footer">
              <p>This email is automatically sent by ParentDoctor system. Please do not reply.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Hello,

Thank you for registering with ParentDoctor. Please use the verification code below to complete your registration:

${code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

This email is automatically sent by ParentDoctor system. Please do not reply.
    `;

    const info = await mailTransporter.sendMail({
      from: `"ParentDoctor" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: "ParentDoctor Email Verification Code",
      text: textContent,
      html: htmlContent,
    });

    console.log(`✅ Verification code sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send verification code to ${email}:`, error.message);
    return false;
  }
}

module.exports = {
  sendEmailNotification,
  sendSMSNotification,
  sendReviewNotification,
  sendVerificationCode,
};

