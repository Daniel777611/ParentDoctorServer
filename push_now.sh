#!/bin/bash

# 推送代码到GitHub

cd "$(dirname "$0")"

echo "🚀 准备推送代码到GitHub..."
echo ""

# 检查是否有未推送的提交
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
    echo "❌ 无法连接到远程仓库，请检查网络连接"
    exit 1
fi

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ 本地和远程已同步，无需推送"
    exit 0
fi

echo "📋 待推送的提交："
git log --oneline origin/main..HEAD
echo ""

# 尝试使用GitHub CLI
if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
        echo "✅ 使用GitHub CLI推送..."
        git push origin main
        exit $?
    fi
fi

# 使用git push（需要用户输入凭据）
echo "📤 使用git push推送..."
echo ""
echo "⚠️  需要输入GitHub凭据："
echo "   - Username: Daniel777611"
echo "   - Password: 使用GitHub Personal Access Token（不是账户密码）"
echo ""
echo "💡 如果还没有Token，请访问："
echo "   https://github.com/settings/tokens"
echo "   创建新token，勾选 'repo' 权限"
echo ""
read -p "按Enter继续推送，或Ctrl+C取消..."

git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo "🚀 Render将自动检测并开始部署（约2-5分钟）"
    echo "📊 查看部署: https://dashboard.render.com"
else
    echo ""
    echo "❌ 推送失败"
    echo ""
    echo "💡 建议使用GitHub CLI："
    echo "   gh auth login"
    echo "   git push origin main"
fi

