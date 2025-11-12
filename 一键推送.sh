#!/bin/bash

# 一键推送代码到GitHub

cd "$(dirname "$0")"

echo "🚀 准备推送代码到GitHub..."
echo ""

# 显示待推送的提交
echo "📋 待推送的提交："
git log --oneline origin/main..HEAD 2>/dev/null || echo "无法获取远程信息"
echo ""

# 检查GitHub CLI
if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
        echo "✅ GitHub CLI已认证，开始推送..."
        git push origin main
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ 推送成功！"
            echo "🚀 Render将自动检测并开始部署（约2-5分钟）"
            exit 0
        fi
    else
        echo "⚠️  GitHub CLI未认证"
        echo ""
        echo "正在启动GitHub CLI登录..."
        gh auth login --web --git-protocol https
        if [ $? -eq 0 ]; then
            echo "✅ 认证成功，开始推送..."
            git push origin main
            if [ $? -eq 0 ]; then
                echo ""
                echo "✅ 推送成功！"
                echo "🚀 Render将自动检测并开始部署（约2-5分钟）"
                exit 0
            fi
        fi
    fi
fi

# 如果GitHub CLI不可用或失败，使用git push
echo "📤 使用git push推送..."
echo ""
echo "⚠️  需要输入GitHub凭据："
echo "   Username: Daniel777611"
echo "   Password: 使用GitHub Personal Access Token"
echo ""
echo "💡 获取Token: https://github.com/settings/tokens"
echo "   创建新token，勾选 'repo' 权限"
echo ""

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
    echo "💡 建议："
    echo "   1. 使用GitHub CLI: gh auth login"
    echo "   2. 或使用Personal Access Token"
    echo "   3. 或使用GitHub Desktop应用"
fi

