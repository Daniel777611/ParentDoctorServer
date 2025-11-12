# 检查邮件服务配置

## 问题：iOS端注册时没有收到验证码

### 可能的原因：

1. **邮件服务未配置**
   - 检查Render环境变量中是否配置了：
     - `SMTP_HOST`
     - `SMTP_USER`
     - `SMTP_PASS`
     - `SMTP_PORT` (可选，默认587)
     - `SMTP_SECURE` (可选，默认false)

2. **邮件服务配置错误**
   - SMTP服务器地址不正确
   - 用户名或密码错误
   - 端口配置错误

3. **邮件被标记为垃圾邮件**
   - 检查垃圾邮件文件夹
   - 检查邮件服务提供商的发送限制

## 检查步骤：

### 1. 检查服务器日志

在Render Dashboard中查看服务器日志，查找：
- `✅ Email service configured` - 表示邮件服务已配置
- `⚠️  Email service not configured` - 表示邮件服务未配置
- `✅ Verification code sent to [email]` - 表示邮件发送成功
- `❌ Failed to send verification code` - 表示邮件发送失败

### 2. 检查环境变量

在Render Dashboard中：
1. 进入你的服务
2. 点击 "Environment" 标签
3. 检查以下环境变量是否已设置：
   ```
   SMTP_HOST=smtp.gmail.com (或你的邮件服务商)
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_PORT=587
   SMTP_SECURE=false
   ```

### 3. 测试邮件服务

可以使用以下方法测试：

1. **查看服务器日志**：
   - 在Render Dashboard的Logs中查看
   - 应该看到 "✅ Verification code sent to [email]"

2. **检查API响应**：
   - 如果邮件服务未配置，API会返回500错误
   - 错误信息会包含 "Email service not configured"

### 4. 配置邮件服务

#### 使用Gmail（推荐用于测试）：

1. 启用两步验证
2. 生成应用专用密码：
   - 访问：https://myaccount.google.com/apppasswords
   - 生成新的应用密码
3. 在Render中设置环境变量：
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-16-char-app-password
   SMTP_PORT=587
   SMTP_SECURE=false
   ```

#### 使用Outlook：

1. 启用应用密码
2. 在Render中设置环境变量：
   ```
   SMTP_HOST=smtp-mail.outlook.com
   SMTP_USER=your-email@outlook.com
   SMTP_PASS=your-app-password
   SMTP_PORT=587
   SMTP_SECURE=false
   ```

#### 使用其他邮件服务：

参考 `FREE_EMAIL_SETUP.md` 文件中的详细说明。

## 临时解决方案（开发测试）：

如果暂时无法配置邮件服务，可以：

1. **查看服务器日志获取验证码**：
   - 在Render Dashboard的Logs中
   - 查找 "📱 SMS verification code" 或验证码相关的日志
   - 虽然代码中会打印验证码（用于手机号），但邮箱验证码不会打印

2. **修改代码临时打印验证码**（仅用于开发）：
   在 `server.js` 的 `/api/parent/verify/send-code` 端点中，临时添加：
   ```javascript
   console.log(`🔐 Verification code for ${email}: ${code}`);
   ```
   ⚠️ **注意**：生产环境中不要这样做，存在安全风险。

## 验证修复：

1. 配置邮件服务环境变量
2. 重启Render服务
3. 在iOS应用中重新尝试注册
4. 检查邮箱（包括垃圾邮件文件夹）
5. 查看服务器日志确认邮件发送成功

