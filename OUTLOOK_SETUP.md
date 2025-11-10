# Outlook Email Setup for ParentDoctor Notifications

## Quick Setup Guide

Use your Outlook email (`Yaxindesign@outlook.com`) to send review notifications.

## Render.com Environment Variables

Add these environment variables in Render.com:

```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=Yaxindesign@outlook.com
SMTP_PASS=yaxin1234567
SMTP_FROM=ParentDoctor <Yaxindesign@outlook.com>
APP_URL=https://parentdoctorserver.onrender.com
```

## Step-by-Step Instructions

### 1. Log in to Render.com
- Go to https://render.com
- Navigate to your **ParentDoctorServer** service

### 2. Go to Environment Tab
- Click **Environment** in the left sidebar

### 3. Add Environment Variables

Click **Add Environment Variable** for each of the following:

**SMTP_HOST**
- Variable name: `SMTP_HOST`
- Value: `smtp-mail.outlook.com`
- Click **Save Changes**

**SMTP_PORT**
- Variable name: `SMTP_PORT`
- Value: `587`
- Click **Save Changes**

**SMTP_SECURE**
- Variable name: `SMTP_SECURE`
- Value: `false`
- Click **Save Changes**

**SMTP_USER**
- Variable name: `SMTP_USER`
- Value: `Yaxindesign@outlook.com`
- Click **Save Changes**

**SMTP_PASS**
- Variable name: `SMTP_PASS`
- Value: `yaxin1234567`
- Click **Save Changes**

**SMTP_FROM**
- Variable name: `SMTP_FROM`
- Value: `ParentDoctor <Yaxindesign@outlook.com>`
- Click **Save Changes**

**APP_URL** (Optional but recommended)
- Variable name: `APP_URL`
- Value: `https://parentdoctorserver.onrender.com`
- Click **Save Changes**

### 4. Redeploy Service

After adding all variables:
1. Go to **Manual Deploy** tab
2. Click **Deploy latest commit**
3. Wait for deployment to complete

### 5. Verify Configuration

Check the logs after deployment. You should see:
```
✅ Email service configured
```

## Testing

1. Submit a doctor registration
2. Check logs for:
   ```
   📬 Attempting to send notifications for doctor...
      - Email: [doctor's email]
   ✅ Email notification sent to [doctor's email]
   ```
3. Check the doctor's email inbox for the notification

## Troubleshooting

### Email Not Sending

**Check:**
- All environment variables are set correctly
- Password is correct (no extra spaces)
- Service has been redeployed after adding variables
- Check logs for specific error messages

**Common Errors:**
- `Invalid login`: Wrong password or email
- `Connection timeout`: Check SMTP_HOST and SMTP_PORT
- `Authentication failed`: Verify SMTP_USER and SMTP_PASS

### Outlook Security Settings

If emails are not sending, you may need to:
1. Enable "Less secure app access" in Outlook (if available)
2. Or use an App Password if 2FA is enabled
3. Check Outlook account for any security alerts

## Security Notes

⚠️ **Important:**
- Never commit passwords to Git
- Environment variables in Render.com are encrypted
- Keep your Outlook password secure
- Consider using an App Password if 2FA is enabled

## Outlook SMTP Settings Reference

- **SMTP Server:** smtp-mail.outlook.com
- **Port:** 587
- **Encryption:** STARTTLS (SMTP_SECURE=false)
- **Authentication:** Required
- **Username:** Full email address
- **Password:** Your Outlook password

