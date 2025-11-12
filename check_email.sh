#!/bin/bash
# 检查指定邮箱在数据库中的状态

if [ -z "$1" ]; then
    echo "使用方法: ./check_email.sh <email>"
    echo "示例: ./check_email.sh wangding070@gmail.com"
    exit 1
fi

EMAIL="$1"
echo "🔍 检查邮箱: $EMAIL"
node check_email.js "$EMAIL"
