# 服务器设置指南

## 第一步：安装 Node.js

### macOS 安装方式

#### 方式1：使用 Homebrew（推荐）

```bash
# 安装 Homebrew（如果还没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js
brew install node
```

#### 方式2：从官网下载

访问 https://nodejs.org/ 下载并安装 Node.js LTS 版本（推荐 18.x 或更高）

#### 验证安装

```bash
node --version  # 应该显示 v18.x.x 或更高
npm --version   # 应该显示 9.x.x 或更高
```

## 第二步：安装项目依赖

```bash
cd Server
npm install
```

## 第三步：配置环境变量

1. **复制环境变量模板**：
   ```bash
   cp .env.example .env
   ```

2. **编辑 .env 文件**，填入你的配置：

### 必需配置

#### 数据库配置 (DATABASE_URL)

**选项1：使用本地PostgreSQL**
```bash
# 安装PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# 创建数据库
createdb parentdoctor

# 在.env中配置
DATABASE_URL=postgresql://$(whoami)@localhost:5432/parentdoctor
```

**选项2：使用云数据库（推荐用于生产）**
- Render.com 提供免费PostgreSQL数据库
- Supabase 提供免费PostgreSQL数据库
- 其他云数据库服务

在 `.env` 中填入云数据库的连接字符串。

#### 邮件服务配置（必需，用于发送验证码）

**Gmail配置（推荐，免费）**：
1. 登录你的Gmail账户
2. 启用两步验证：https://myaccount.google.com/security
3. 生成应用密码：https://myaccount.google.com/apppasswords
4. 在 `.env` 中配置：
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=你的16位应用密码
   SMTP_FROM=ParentDoctor <your_email@gmail.com>
   ```

### 可选配置

#### Cloudflare R2 存储（用于文件上传）

如果需要上传医生身份证、医疗执照等文件：
1. 注册 Cloudflare 账户
2. 创建 R2 存储桶
3. 获取访问密钥
4. 在 `.env` 中配置 R2 相关变量

#### SMS服务（Twilio）

如果需要SMS通知功能：
1. 注册 Twilio 账户
2. 获取 Account SID 和 Auth Token
3. 在 `.env` 中配置 Twilio 相关变量

## 第四步：运行服务器

```bash
npm start
```

服务器将在 `http://localhost:10000` 启动

## 测试服务器

1. **健康检查**：
   ```bash
   curl http://localhost:10000/api/health
   ```

2. **访问前端页面**：
   打开浏览器访问 `http://localhost:10000`

## 常见问题

### 问题1：数据库连接失败

**解决**：
- 检查 PostgreSQL 是否运行：`brew services list`
- 检查 DATABASE_URL 是否正确
- 确保数据库已创建

### 问题2：邮件发送失败

**解决**：
- 检查 SMTP 配置是否正确
- Gmail需要使用应用密码，不是普通密码
- Outlook必须使用应用密码

### 问题3：端口被占用

**解决**：
- 修改 `.env` 中的 `PORT` 值
- 或关闭占用端口的程序

## 生产环境部署

### Render.com 部署

1. 在 Render.com 创建 Web Service
2. 连接你的 GitHub 仓库
3. 在 Environment 标签页添加所有环境变量
4. 部署会自动开始

详细说明请查看 `RENDER_ENV_SETUP.md`

## 下一步

- 配置完成后，iOS应用可以连接到本地服务器进行测试
- 修改 iOS 应用的 `APIConfig.swift` 中的 `baseURL` 为 `http://localhost:10000`

