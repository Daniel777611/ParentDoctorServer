# Gmail Configuration for wangding903@gmail.com

## Your Gmail Account Information

- **Email:** wangding903@gmail.com
- **App Password:** `vhly pqpc wxqz jwbl` (16 characters)

## Render.com Environment Variables Configuration

Copy and paste these exact values into Render.com → Environment tab:

### Required Variables

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=wangding903@gmail.com
SMTP_PASS=vhlypqpcwxqzjwbl
SMTP_FROM=ParentDoctor <wangding903@gmail.com>
APP_URL=https://parentdoctorserver.onrender.com
```

## Step-by-Step Configuration in Render.com

1. **Log in to Render.com**
   - Go to https://render.com
   - Navigate to your **ParentDoctorServer** service

2. **Go to Environment Tab**
   - Click **Environment** in the left sidebar

3. **Add Each Variable**

   **SMTP_HOST:**
   - Variable name: `SMTP_HOST`
   - Value: `smtp.gmail.com`
   - Click **Save Changes**

   **SMTP_PORT:**
   - Variable name: `SMTP_PORT`
   - Value: `587`
   - Click **Save Changes**

   **SMTP_SECURE:**
   - Variable name: `SMTP_SECURE`
   - Value: `false`
   - Click **Save Changes**

   **SMTP_USER:**
   - Variable name: `SMTP_USER`
   - Value: `wangding903@gmail.com`
   - Click **Save Changes**

   **SMTP_PASS:**
   - Variable name: `SMTP_PASS`
   - Value: `vhlypqpcwxqzjwbl` (without spaces)
   - Click **Save Changes**

   **SMTP_FROM:**
   - Variable name: `SMTP_FROM`
   - Value: `ParentDoctor <wangding903@gmail.com>`
   - Click **Save Changes**

   **APP_URL:**
   - Variable name: `APP_URL`
   - Value: `https://parentdoctorserver.onrender.com`
   - Click **Save Changes**

4. **Redeploy Service**
   - Go to **Manual Deploy** tab
   - Click **Deploy latest commit**
   - Wait for deployment to complete

5. **Verify Configuration**
   - Check logs for: `✅ Email service configured`
   - Test by submitting a doctor registration
   - Check logs for: `✅ Email notification sent to [email]`

## Notes

- **App Password:** You can use `vhlypqpcwxqzjwbl` (no spaces) or `vhly pqpc wxqz jwbl` (with spaces) - both work
- **Security:** The app password is stored securely in Render.com environment variables
- **Testing:** After deployment, submit a test registration to verify email sending works

## Troubleshooting

If emails are not sending:

1. **Check logs** for specific error messages
2. **Verify** all environment variables are set correctly
3. **Confirm** the app password is correct (no extra spaces)
4. **Ensure** two-step verification is enabled on Gmail account
5. **Check** Gmail account for any security alerts

## Quick Copy-Paste for Render.com

If you want to add all variables at once, use these exact values:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=wangding903@gmail.com
SMTP_PASS=vhlypqpcwxqzjwbl
SMTP_FROM=ParentDoctor <wangding903@gmail.com>
APP_URL=https://parentdoctorserver.onrender.com
```

