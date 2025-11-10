# Mailgun Setup Guide for ParentDoctor Notifications

## Overview

Mailgun is a professional email service designed for sending transactional emails. It's perfect for sending notification emails from your application.

**Advantages:**
- Free tier: 5,000 emails per month
- Simple configuration
- Uses API Key (no App Password needed)
- Reliable delivery
- Good for production use

## Step-by-Step Setup

### Step 1: Sign Up for Mailgun

1. Visit: https://www.mailgun.com/
2. Click **"Sign Up"** or **"Start Free"**
3. Create an account with your email
4. Verify your email address

### Step 2: Verify Your Domain (Optional but Recommended)

**For Production Use:**
1. In Mailgun dashboard, go to **Sending** → **Domains**
2. Click **"Add New Domain"**
3. Enter your domain (e.g., `parentdoctor.com`)
4. Follow the DNS setup instructions
5. Add the required DNS records to your domain

**For Testing (Quick Start):**
- Mailgun provides a sandbox domain (e.g., `sandbox123.mailgun.org`)
- You can use this for testing, but emails will have a notice
- For production, you should verify your own domain

### Step 3: Get Your SMTP Credentials

1. In Mailgun dashboard, go to **Sending** → **Domain Settings**
2. Select your domain (or sandbox domain)
3. Scroll down to **"SMTP credentials"** section
4. You'll see:
   - **SMTP Hostname:** `smtp.mailgun.org`
   - **Port:** `587` (or `465` for SSL)
   - **Username:** Your Mailgun username (usually your domain or email)
   - **Password:** Your Mailgun SMTP password (or generate a new one)

**To generate a new SMTP password:**
1. In the SMTP credentials section
2. Click **"Reset Password"** or **"Generate Password"**
3. Copy the password immediately (you'll only see it once)

### Step 4: Configure Render.com Environment Variables

Go to Render.com → Your Service → **Environment** tab and add:

#### SMTP_HOST
- Variable name: `SMTP_HOST`
- Value: `smtp.mailgun.org`
- Click **Save Changes**

#### SMTP_PORT
- Variable name: `SMTP_PORT`
- Value: `587`
- Click **Save Changes**

#### SMTP_SECURE
- Variable name: `SMTP_SECURE`
- Value: `false`
- Click **Save Changes**

#### SMTP_USER
- Variable name: `SMTP_USER`
- Value: Your Mailgun SMTP username (from Step 3)
- Usually format: `postmaster@your-domain.mailgun.org` or your email
- Click **Save Changes**

#### SMTP_PASS
- Variable name: `SMTP_PASS`
- Value: Your Mailgun SMTP password (from Step 3)
- Click **Save Changes**

#### SMTP_FROM
- Variable name: `SMTP_FROM`
- Value: `ParentDoctor <noreply@your-domain.mailgun.org>`
- Or use your verified domain: `ParentDoctor <noreply@yourdomain.com>`
- Click **Save Changes**

#### APP_URL (Optional but Recommended)
- Variable name: `APP_URL`
- Value: `https://parentdoctorserver.onrender.com`
- Click **Save Changes**

### Step 5: Redeploy Service

1. Go to **Manual Deploy** tab
2. Click **Deploy latest commit**
3. Wait for deployment to complete

### Step 6: Verify Configuration

After deployment, check the logs. You should see:
```
✅ Email service configured
```

### Step 7: Test Email Sending

1. Submit a doctor registration
2. Check logs for:
   ```
   📬 Attempting to send notifications for doctor...
      - Email: [doctor's email]
   ✅ Email notification sent to [doctor's email]
   ```
3. Check the doctor's email inbox for the notification

## Configuration Summary

**Complete Environment Variables for Mailgun:**

```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your_mailgun_smtp_password
SMTP_FROM=ParentDoctor <noreply@your-domain.mailgun.org>
APP_URL=https://parentdoctorserver.onrender.com
```

## Troubleshooting

### Email Not Sending

**Check:**
- All environment variables are set correctly
- SMTP credentials are correct (username and password)
- Domain is verified (if using custom domain)
- Check Mailgun dashboard for sending logs
- Check Render.com logs for specific error messages

**Common Errors:**
- `Invalid login`: Wrong SMTP_USER or SMTP_PASS
- `Connection timeout`: Check SMTP_HOST and SMTP_PORT
- `Domain not verified`: Verify your domain in Mailgun dashboard

### Using Sandbox Domain

If you're using Mailgun's sandbox domain:
- Emails will have a notice: "Delivered by Mailgun"
- You can only send to authorized recipients (add them in Mailgun dashboard)
- For production, verify your own domain

### Domain Verification

To verify your own domain:
1. Go to Mailgun → Sending → Domains
2. Add your domain
3. Add the required DNS records (TXT, CNAME, MX)
4. Wait for verification (usually a few minutes)
5. Once verified, use your domain in SMTP_FROM

## Mailgun Dashboard Features

**Sending Logs:**
- View all sent emails
- Check delivery status
- See bounce/complaint rates

**Analytics:**
- Track email delivery
- Monitor open rates (if using tracking)
- View sending statistics

**API Access:**
- Mailgun also provides REST API
- Can be used for more advanced email sending
- Current setup uses SMTP (simpler)

## Free Tier Limits

- **5,000 emails per month** (free tier)
- **100 emails per day** (free tier)
- Perfect for testing and small applications
- Upgrade to paid plan for higher limits

## Security Notes

⚠️ **Important:**
- Keep your Mailgun SMTP password secure
- Never commit passwords to Git
- Environment variables in Render.com are encrypted
- Use API Key for production (more secure than SMTP password)
- Consider verifying your own domain for better deliverability

## Quick Reference

**Mailgun Dashboard:**
- https://app.mailgun.com/

**SMTP Settings:**
- Host: `smtp.mailgun.org`
- Port: `587` (STARTTLS) or `465` (SSL)
- Username: From Mailgun dashboard
- Password: From Mailgun dashboard

**Documentation:**
- https://documentation.mailgun.com/

