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

module.exports = {
  sendEmailNotification,
  sendSMSNotification,
  sendReviewNotification,
};

