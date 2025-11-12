#!/bin/bash
# 清理指定邮箱的所有记录

if [ -z "$1" ]; then
    echo "使用方法: ./cleanup_email.sh <email>"
    echo "示例: ./cleanup_email.sh wangding070@gmail.com"
    exit 1
fi

EMAIL="$1"
echo "🔍 清理邮箱: $EMAIL"
node cleanup_email.js "$EMAIL"
