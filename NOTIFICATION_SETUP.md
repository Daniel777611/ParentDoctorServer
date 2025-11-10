# 审核结果通知功能配置说明

## 功能概述

当医生注册审核结果出来时，系统会自动发送邮件和/或短信通知给医生。

## 安装依赖

```bash
npm install
```

新增的依赖包：
- `nodemailer` - 邮件发送服务
- `twilio` - 短信发送服务

## 环境变量配置

在 `.env` 文件中添加以下配置：

### 邮件服务配置（SMTP）

```env
# 邮件服务配置 - 用于发送审核结果邮件
SMTP_HOST=smtp.gmail.com          # SMTP 服务器地址
SMTP_PORT=587                      # SMTP 端口（587 或 465）
SMTP_SECURE=false                  # 是否使用 SSL/TLS（465 端口设为 true）
SMTP_USER=your_email@gmail.com    # SMTP 用户名（通常是邮箱地址）
SMTP_PASS=your_app_password       # SMTP 密码或应用专用密码
SMTP_FROM=ParentDoctor <noreply@parentdoctor.com>  # 发件人显示名称和邮箱
```

**常用邮件服务配置示例：**

#### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password  # 需要使用 Gmail 应用专用密码
```

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_mailgun_username
SMTP_PASS=your_mailgun_password
```

### 短信服务配置（Twilio）

```env
# 短信服务配置 - 用于发送审核结果短信
TWILIO_ACCOUNT_SID=your_twilio_account_sid      # Twilio 账号 SID
TWILIO_AUTH_TOKEN=your_twilio_auth_token        # Twilio 认证令牌
TWILIO_PHONE_NUMBER=+1234567890                 # Twilio 提供的电话号码（需要包含国家代码）
```

**获取 Twilio 配置：**
1. 注册 Twilio 账号：https://www.twilio.com/
2. 在 Twilio Console 中获取 Account SID 和 Auth Token
3. 购买一个电话号码（Phone Number）

### 应用 URL 配置

```env
# 应用 URL（用于邮件中的链接）
APP_URL=https://your-app-url.com
```

## 功能说明

### 自动通知流程

1. 医生提交注册申请
2. AI 审查系统自动审核
3. 审核完成后，系统自动：
   - 发送邮件通知（如果配置了邮件服务且医生提供了邮箱）
   - 发送短信通知（如果配置了短信服务且医生提供了手机号）

### 通知内容

#### 审核通过
- **邮件**：包含通过消息、登录链接、审核备注
- **短信**：简要通知审核通过

#### 审核未通过
- **邮件**：包含未通过消息、审核备注、客服联系方式
- **短信**：简要通知审核未通过

## 使用说明

### 可选配置

- **仅邮件**：只配置 SMTP 相关变量，不配置 Twilio
- **仅短信**：只配置 Twilio 相关变量，不配置 SMTP
- **两者都配置**：同时发送邮件和短信（推荐）

### 手机号格式

短信服务需要手机号包含国家代码，例如：
- 中国：`+8613812345678`
- 美国：`+11234567890`

如果医生注册时提供的手机号没有国家代码，系统会自动添加 `+1`（美国）。你可以根据实际情况修改 `notification.js` 中的默认国家代码。

## 测试

1. 确保所有环境变量已正确配置
2. 启动服务器：`npm start`
3. 提交一个医生注册申请
4. 检查控制台日志，确认通知发送状态
5. 检查邮箱和手机，确认收到通知

## 故障排查

### 邮件发送失败
- 检查 SMTP 配置是否正确
- 确认 SMTP 密码是应用专用密码（Gmail 需要）
- 检查防火墙是否阻止了 SMTP 端口
- 查看服务器日志中的错误信息

### 短信发送失败
- 检查 Twilio 配置是否正确
- 确认 Twilio 账号有足够的余额
- 检查手机号格式是否正确（需要包含国家代码）
- 查看服务器日志中的错误信息

### 未收到通知
- 检查医生注册时是否提供了邮箱或手机号
- 检查环境变量是否已正确配置
- 查看服务器日志确认通知是否已发送

## 注意事项

1. 通知发送失败不会影响审核流程，只会在日志中记录错误
2. 如果未配置邮件或短信服务，系统会跳过相应的通知，不会报错
3. 建议在生产环境中使用专业的邮件和短信服务（如 SendGrid, Twilio）
4. 注意保护环境变量中的敏感信息，不要提交到代码仓库

