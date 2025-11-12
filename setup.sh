#!/bin/bash

# ParentDoctor Server 自动配置脚本

echo "🚀 开始配置 ParentDoctor Server..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请先安装 Node.js："
    echo "1. 访问 https://nodejs.org/ 下载安装"
    echo "2. 或查看 INSTALL_NODE.md 获取详细说明"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo "✅ npm 版本: $(npm --version)"

# 安装依赖
echo ""
echo "📦 正在安装依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo "✅ 依赖安装完成"

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo ""
    echo "📝 创建 .env 配置文件..."
    cat > .env << 'EOF'
# ============================================
# ParentDoctor Server Environment Variables
# ============================================

# 服务器配置
PORT=10000

# 数据库配置 (PostgreSQL)
# 格式: postgresql://用户名:密码@主机:端口/数据库名
DATABASE_URL=postgresql://postgres:password@localhost:5432/parentdoctor

# Cloudflare R2 存储配置 (可选)
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ACCOUNT_ID=

# 邮件服务配置 (SMTP) - 必需
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=ParentDoctor <noreply@parentdoctor.com>

# SMS服务配置 (Twilio) - 可选
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# 管理员配置
ADMIN_PASSWORD=777777

# 应用URL
APP_URL=http://localhost:10000
EOF
    echo "✅ .env 文件已创建"
    echo ""
    echo "⚠️  请编辑 .env 文件，填入你的配置："
    echo "   - DATABASE_URL: 数据库连接字符串"
    echo "   - SMTP_*: 邮件服务配置（必需）"
    echo "   - R2_*: 文件存储配置（可选）"
else
    echo "✅ .env 文件已存在"
fi

echo ""
echo "✨ 配置完成！"
echo ""
echo "下一步："
echo "1. 编辑 .env 文件，填入你的配置"
echo "2. 运行服务器: npm start"
echo "3. 访问: http://localhost:10000"

