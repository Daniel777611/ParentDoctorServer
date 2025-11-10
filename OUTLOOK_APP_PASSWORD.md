# How to Generate Outlook App Password

## Problem

If you see this error in the logs:
```
❌ Email sending failed: Invalid login: 535 5.7.139 Authentication unsuccessful, basic authentication is disabled.
```

This means Outlook has disabled basic password authentication. You **MUST** use an App Password instead of your regular password.

## Solution: Generate Outlook App Password

### Step 1: Go to Microsoft Account Security

1. Visit: https://account.microsoft.com/security
   - Or: https://account.live.com/proofs/Manage
2. Sign in with your Outlook account (`Yaxindesign@outlook.com`)

### Step 2: Enable Two-Step Verification (if not already enabled)

1. Go to **Security** → **Advanced security options**
2. If Two-step verification is not enabled:
   - Click **Turn on two-step verification**
   - Follow the setup wizard
   - You'll need a phone number or authenticator app

### Step 3: Generate App Password

1. Go to **Security** → **Advanced security options**
2. Scroll down to find **App passwords** section
3. Click **Create a new app password**
4. You may be asked to verify your identity (enter code from phone/authenticator)
5. Select:
   - **App:** Mail
   - **Device:** Other (custom name) - Enter "ParentDoctor Server"
6. Click **Generate**
7. **IMPORTANT:** Copy the 16-character password immediately
   - Format: `abcd-efgh-ijkl-mnop` (with dashes)
   - You will only see this password ONCE!
   - If you lose it, you'll need to generate a new one

### Step 4: Update Render.com Environment Variable

1. Go to Render.com → Your Service → **Environment** tab
2. Find the `SMTP_PASS` variable
3. Click to edit it
4. Replace the value with your **App Password** (the 16-character code you just generated)
5. Click **Save Changes**

### Step 5: Redeploy Service

1. Go to **Manual Deploy** tab
2. Click **Deploy latest commit**
3. Wait for deployment to complete

### Step 6: Test

1. Submit a doctor registration
2. Check logs - you should see:
   ```
   ✅ Email service configured
   ✅ Email notification sent to [email]
   ```
3. Check the doctor's email inbox for the notification

## Alternative: If You Can't Find App Passwords

If you don't see the "App passwords" option:

1. **Make sure Two-Step Verification is enabled:**
   - Go to **Security** → **Advanced security options**
   - Enable **Two-step verification** first
   - App passwords option will appear after enabling 2FA

2. **Check if your account supports App Passwords:**
   - Some Microsoft accounts may have different security settings
   - Try accessing: https://account.live.com/proofs/Manage
   - Look for "App passwords" in the security settings

3. **If still not available:**
   - Consider using a different email service (Gmail, SendGrid, Mailgun)
   - Or contact Microsoft support

## Troubleshooting

### "App passwords" option not visible

**Solution:**
- Enable Two-Step Verification first
- App passwords only appear after 2FA is enabled
- Wait a few minutes after enabling 2FA, then refresh the page

### App Password not working

**Check:**
- Make sure you copied the entire 16-character password (including dashes)
- No extra spaces before or after the password
- You're using the App Password, not your regular password
- The App Password was generated for "Mail" app

### Still getting authentication errors

**Try:**
1. Generate a new App Password
2. Delete the old `SMTP_PASS` variable in Render.com
3. Add it again with the new App Password
4. Redeploy the service

## Security Notes

⚠️ **Important:**
- App Passwords are different from your regular password
- Each App Password can only be used for one application
- You can generate multiple App Passwords for different apps
- If you suspect an App Password is compromised, delete it and generate a new one
- App Passwords are stored securely in Render.com environment variables

## Quick Reference

**What you need:**
- Outlook email: `Yaxindesign@outlook.com`
- App Password: 16-character code from Microsoft Account (e.g., `abcd-efgh-ijkl-mnop`)

**Where to get it:**
- https://account.microsoft.com/security → Advanced security options → App passwords

**Where to use it:**
- Render.com → Environment → `SMTP_PASS` variable

