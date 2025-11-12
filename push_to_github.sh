#!/bin/bash

# 推送代码到GitHub的脚本

echo "🚀 开始推送代码到GitHub..."

cd "$(dirname "$0")"

# 检查是否有未推送的提交
if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "❌ 无法连接到远程仓库"
    exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ 本地和远程已同步，无需推送"
    exit 0
fi

echo "📤 发现未推送的提交，准备推送..."

# 方法1：尝试使用GitHub CLI
if command -v gh >/dev/null 2>&1; then
    echo "🔐 检查GitHub CLI认证状态..."
    if gh auth status >/dev/null 2>&1; then
        echo "✅ GitHub CLI已认证，使用gh推送..."
        gh repo sync Daniel777611/ParentDoctorServer --force 2>&1 || git push origin main
        exit 0
    else
        echo "⚠️  GitHub CLI未认证"
        echo "请运行以下命令登录："
        echo "  gh auth login"
        echo ""
        echo "或者继续使用git push（需要输入凭据）"
    fi
fi

# 方法2：使用git push
echo "📤 使用git push推送..."
echo "提示：如果要求输入密码，请使用GitHub Personal Access Token"
echo "获取Token: https://github.com/settings/tokens"
echo ""
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo "🚀 Render将自动检测并开始部署（约2-5分钟）"
    echo "📊 查看部署状态: https://dashboard.render.com"
else
    echo ""
    echo "❌ 推送失败"
    echo ""
    echo "解决方案："
    echo "1. 使用GitHub CLI: gh auth login"
    echo "2. 使用Personal Access Token作为密码"
    echo "3. 配置SSH密钥"
fi

