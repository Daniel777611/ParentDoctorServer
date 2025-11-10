# Render.com Environment Variables Setup Guide

## Overview

This guide explains how to configure environment variables in Render.com for the notification system (Email and SMS).

## Accessing Environment Variables in Render.com

1. Log in to [Render.com](https://render.com)
2. Navigate to your **ParentDoctorServer** service
3. Go to **Environment** tab (in the left sidebar)
4. Click **Add Environment Variable** to add each variable

## Required Environment Variables

### Email Service (SMTP) - At least one is required

Add these variables to enable email notifications:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=ParentDoctor <noreply@parentdoctor.com>
```

**Common SMTP Providers:**

#### Outlook/Hotmail
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=Yaxindesign@outlook.com
SMTP_PASS=your_password
SMTP_FROM=ParentDoctor <Yaxindesign@outlook.com>
```

**Note:** For Outlook/Hotmail:
- Use `smtp-mail.outlook.com` as the SMTP host
- Port 587 with STARTTLS (SMTP_SECURE=false)
- Use your full email address as SMTP_USER
- Use your regular Outlook password (or App Password if 2FA is enabled)

#### Gmail
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password  # Use App Password, not regular password
SMTP_FROM=ParentDoctor <your_email@gmail.com>
```

**Note:** For Gmail, you need to:
1. Enable 2-Step Verification
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the 16-character App Password (not your regular password)

#### SendGrid
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
SMTP_FROM=ParentDoctor <noreply@yourdomain.com>
```

#### Mailgun
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_mailgun_username
SMTP_PASS=your_mailgun_password
SMTP_FROM=ParentDoctor <noreply@yourdomain.com>
```

### SMS Service (Twilio) - Optional

Add these variables to enable SMS notifications:

```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Getting Twilio Credentials:**
1. Sign up at [Twilio.com](https://www.twilio.com/)
2. Go to Console Dashboard
3. Find your **Account SID** and **Auth Token**
4. Purchase a phone number from Twilio
5. Use the purchased number for `TWILIO_PHONE_NUMBER`

### Application URL

Add this for email links:

```
APP_URL=https://parentdoctorserver.onrender.com
```

## Step-by-Step Setup Instructions

### 1. Configure Email Service (Recommended)

1. Choose an SMTP provider (Outlook, Gmail, SendGrid, or Mailgun)
2. Get your SMTP credentials
3. In Render.com, go to **Environment** tab
4. Add each SMTP variable:
   - Click **Add Environment Variable**
   - Enter variable name (e.g., `SMTP_HOST`)
   - Enter variable value (e.g., `smtp-mail.outlook.com` for Outlook)
   - Click **Save Changes**
5. Repeat for all SMTP variables

**For Outlook/Hotmail specifically:**
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=Yaxindesign@outlook.com
SMTP_PASS=yaxin1234567
SMTP_FROM=ParentDoctor <Yaxindesign@outlook.com>
```

### 2. Configure SMS Service (Optional)

1. Sign up for Twilio account
2. Get Account SID, Auth Token, and Phone Number
3. In Render.com, go to **Environment** tab
4. Add each Twilio variable:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
5. Click **Save Changes**

### 3. Add Application URL

1. Add `APP_URL` variable with your Render.com service URL
2. Example: `APP_URL=https://parentdoctorserver.onrender.com`

### 4. Redeploy Service

After adding environment variables:
1. Go to **Manual Deploy** tab
2. Click **Deploy latest commit** (or wait for auto-deploy)
3. Check logs to verify services are configured

## Verification

After deployment, check the logs for:

✅ **Success messages:**
```
✅ Email service configured
✅ SMS service configured
```

⚠️ **Warning messages (if not configured):**
```
⚠️  Email service not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS)
⚠️  SMS service not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
```

## Testing

1. Submit a doctor registration
2. Check logs for notification status:
   - `✅ Email notification sent to [email]`
   - `✅ SMS notification sent to [phone]`
3. Verify email/SMS was received

## Troubleshooting

### Email Not Sending

**Check:**
- All SMTP variables are set correctly
- SMTP credentials are valid
- For Gmail: Using App Password (not regular password)
- Email address in database is not empty
- Check logs for specific error messages

**Common Errors:**
- `Invalid login`: Wrong SMTP_USER or SMTP_PASS
- `Connection timeout`: Wrong SMTP_HOST or SMTP_PORT
- `Email is empty`: Doctor registration didn't include email

### SMS Not Sending

**Check:**
- All Twilio variables are set correctly
- Twilio account has sufficient balance
- Phone number format includes country code (e.g., +1234567890)
- Phone number in database is not empty
- Check logs for specific error messages

**Common Errors:**
- `Invalid Account SID`: Wrong TWILIO_ACCOUNT_SID
- `Invalid Auth Token`: Wrong TWILIO_AUTH_TOKEN
- `Phone number format invalid`: Missing country code

### No Notifications Sent

**Possible causes:**
1. Environment variables not configured
2. Email/Phone fields are empty in database
3. Service not redeployed after adding variables

**Solution:**
1. Check all environment variables are set
2. Verify doctor registration includes email/phone
3. Redeploy service after adding variables

## Security Notes

⚠️ **Important:**
- Never commit `.env` file to Git
- Environment variables in Render.com are encrypted
- Use App Passwords for Gmail (not regular passwords)
- Keep Twilio credentials secure

## Quick Reference

**Minimum required for email (Outlook example):**
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=Yaxindesign@outlook.com
SMTP_PASS=yaxin1234567
```

**Or Gmail example:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

**Minimum required for SMS:**
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Recommended:**
```
APP_URL=https://parentdoctorserver.onrender.com
```

