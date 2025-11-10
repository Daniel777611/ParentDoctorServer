# Troubleshooting Gmail Authentication Failure

## Error Message

```
❌ Email sending failed: Invalid login: 535-5.7.8 Username and Password not accepted
```

## Common Causes and Solutions

### 1. App Password Incorrect or Has Spaces

**Problem:** App password may have spaces or be copied incorrectly.

**Solution:**
1. Go to: https://myaccount.google.com/apppasswords
2. Delete the old app password (if exists)
3. Create a new app password:
   - Select "Mail"
   - Select "Other (Custom name)"
   - Enter: "ParentDoctor Server"
   - Click "Generate"
4. **Copy the password carefully:**
   - Format: `abcd efgh ijkl mnop` (with spaces)
   - **Remove all spaces** when pasting into Render.com
   - Should be exactly 16 characters: `abcdefghijklmnop`
5. Update `SMTP_PASS` in Render.com with the new password (no spaces)
6. Save and redeploy

### 2. Environment Variable Not Saved Properly

**Problem:** Environment variable may not have been saved correctly.

**Solution:**
1. Go to Render.com → Environment tab
2. Check `SMTP_PASS` value:
   - Should be exactly 16 characters
   - No spaces
   - No extra characters
3. If incorrect, click to edit and update:
   - Delete the old value
   - Paste the new app password (without spaces)
   - Click "Save Changes"
4. Click "Save, rebuild, and deploy"

### 3. Two-Step Verification Not Enabled

**Problem:** App passwords only work if Two-Step Verification is enabled.

**Solution:**
1. Go to: https://myaccount.google.com/security
2. Check if "2-Step Verification" is ON
3. If OFF, enable it:
   - Click "2-Step Verification"
   - Follow the setup wizard
   - Verify with phone number
4. After enabling, generate a new App Password

### 4. Wrong Gmail Account

**Problem:** Using wrong Gmail account or email address.

**Solution:**
1. Verify `SMTP_USER` in Render.com:
   - Should be: `wangding903@gmail.com`
   - No typos
   - No extra spaces
2. Verify the Gmail account has:
   - Two-Step Verification enabled
   - App Password generated for this account

### 5. App Password Format Issues

**Problem:** App password may have hidden characters or formatting issues.

**Solution:**
1. Generate a fresh App Password
2. Copy it carefully:
   - Don't copy any extra spaces
   - Don't copy line breaks
   - Only copy the 16 characters
3. Paste into a text editor first to verify:
   - Should be exactly 16 characters
   - No spaces
   - Only lowercase letters
4. Then copy from text editor to Render.com

## Step-by-Step Fix

### Step 1: Generate New App Password

1. Visit: https://myaccount.google.com/apppasswords
2. If you see "Torahnest" or any existing app password, delete it
3. Click "Create a new app password"
4. Select:
   - **App:** Mail
   - **Device:** Other (Custom name)
   - **Name:** ParentDoctor Server
5. Click "Generate"
6. **Copy the password** (you'll only see it once!)

### Step 2: Update Render.com

1. Go to Render.com → Your Service → Environment tab
2. Find `SMTP_PASS` variable
3. Click to edit
4. **Delete the old value completely**
5. Paste the new app password:
   - Remove all spaces
   - Should be exactly 16 characters
   - Example: `vhlypqpcwxqzjwbl` (no spaces)
6. Click "Save Changes"

### Step 3: Verify Other Variables

Check these variables are correct:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=wangding903@gmail.com
SMTP_PASS=你的16位应用密码（无空格）
SMTP_FROM=ParentDoctor <wangding903@gmail.com>
```

### Step 4: Redeploy

1. Click "Save, rebuild, and deploy" button
2. Wait for deployment to complete (1-2 minutes)
3. Check logs for: `✅ Email service configured`

### Step 5: Test

1. Submit a doctor registration
2. Check logs for:
   ```
   ✅ Email notification sent to [email]
   ```
3. If still failing, check the detailed error message in logs

## Verification Checklist

Before testing, verify:

- [ ] Two-Step Verification is enabled on Gmail account
- [ ] App Password is generated (16 characters)
- [ ] App Password has no spaces when pasted into Render.com
- [ ] `SMTP_USER` is correct: `wangding903@gmail.com`
- [ ] `SMTP_PASS` is exactly 16 characters (no spaces)
- [ ] All environment variables are saved
- [ ] Service has been redeployed after changes

## Still Not Working?

If the problem persists:

1. **Check Gmail Account Security:**
   - Go to: https://myaccount.google.com/security
   - Check for any security alerts
   - Make sure account is not locked

2. **Try a Different App Password:**
   - Delete the old one
   - Generate a completely new one
   - Use a different name (e.g., "ParentDoctor Server 2")

3. **Check Render.com Logs:**
   - Look for detailed error messages
   - Check if environment variables are being read correctly

4. **Verify Environment Variables:**
   - In Render.com, check each variable value
   - Make sure there are no hidden characters
   - Verify no extra spaces at the beginning or end

## Quick Test

After fixing, test with a simple doctor registration:
1. Submit registration with a test email
2. Check logs immediately
3. If successful, you should see: `✅ Email notification sent to [email]`
4. Check the test email inbox for the notification

## Contact

If none of these solutions work, the issue might be:
- Gmail account restrictions
- Network/firewall issues
- Render.com environment variable issues

Consider using SendGrid or Mailgun as an alternative.

