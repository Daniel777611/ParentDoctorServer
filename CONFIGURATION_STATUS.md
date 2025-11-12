# 配置状态总结

## ✅ 已完成

1. **项目文件已拉取**
   - 所有后端服务器代码已克隆到 `Server/` 目录

2. **配置文件已创建**
   - `.env` 配置文件模板已创建
   - `setup.sh` 自动配置脚本已创建
   - `SETUP_INSTRUCTIONS.md` 详细设置指南已创建
   - `INSTALL_NODE.md` Node.js安装指南已创建

## ⚠️ 需要手动完成

### 1. 安装 Node.js（必需）

**当前状态**：Node.js 未安装

**安装方法**（选择其一）：

**方法1：从官网下载（最简单）**
1. 访问 https://nodejs.org/
2. 下载 LTS 版本（推荐 18.x 或 20.x）
3. 双击 `.pkg` 文件安装

**方法2：使用 nvm**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.zshrc
nvm install --lts
```

**验证安装**：
```bash
node --version  # 应该显示 v18.x.x 或更高
npm --version   # 应该显示 9.x.x 或更高
```

### 2. 安装项目依赖

安装 Node.js 后，运行：

```bash
cd Server
npm install
```

或者运行自动配置脚本：

```bash
cd Server
./setup.sh
```

### 3. 配置环境变量

编辑 `Server/.env` 文件，至少需要配置：

#### 必需配置

**数据库 (DATABASE_URL)**
- 选项1：本地PostgreSQL
  ```bash
  # 安装PostgreSQL
  brew install postgresql@14
  brew services start postgresql@14
  createdb parentdoctor
  
  # 在.env中配置
  DATABASE_URL=postgresql://$(whoami)@localhost:5432/parentdoctor
  ```

- 选项2：云数据库（推荐）
  - Render.com 免费PostgreSQL
  - Supabase 免费PostgreSQL
  - 其他云服务

**邮件服务 (SMTP) - 必需，用于发送验证码**

Gmail配置（推荐，免费）：
1. 登录Gmail账户
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

#### 可选配置

**Cloudflare R2 存储**（用于文件上传）
- 如果需要上传医生身份证、医疗执照等文件
- 注册 Cloudflare 账户并创建 R2 存储桶

**SMS服务 (Twilio)**
- 如果需要SMS通知功能
- 注册 Twilio 账户

### 4. 运行服务器

配置完成后：

```bash
cd Server
npm start
```

服务器将在 `http://localhost:10000` 启动

## 📋 快速开始清单

- [ ] 安装 Node.js
- [ ] 运行 `npm install` 安装依赖
- [ ] 配置 `.env` 文件（至少数据库和邮件服务）
- [ ] 运行 `npm start` 启动服务器
- [ ] 测试：访问 `http://localhost:10000/api/health`

## 📚 相关文档

- `SETUP_INSTRUCTIONS.md` - 详细设置指南
- `INSTALL_NODE.md` - Node.js安装指南
- `RENDER_ENV_SETUP.md` - Render部署配置
- `FREE_EMAIL_SETUP.md` - 免费邮件服务设置

## 🔗 有用的链接

- Node.js下载：https://nodejs.org/
- PostgreSQL下载：https://www.postgresql.org/download/
- Render.com：https://render.com
- Supabase：https://supabase.com
- Gmail应用密码：https://myaccount.google.com/apppasswords

## 💡 提示

1. **本地开发**：可以使用本地PostgreSQL和Gmail免费账户
2. **生产环境**：建议使用云数据库和专业的邮件服务
3. **文件存储**：如果不需要文件上传功能，R2配置可以留空
4. **测试**：配置完成后，iOS应用可以连接到 `http://localhost:10000` 进行测试

