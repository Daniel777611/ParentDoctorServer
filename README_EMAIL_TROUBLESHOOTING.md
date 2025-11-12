# 邮箱注册/登录问题排查指南

## 问题描述

当遇到以下错误时：
- 注册时：`This email is already registered.`
- 登录时：`Failed to verify code.`

## 排查步骤

### 1. 检查数据库中是否还有该邮箱的记录

```bash
cd Server
./check_email.sh wangding070@gmail.com
```

这会显示：
- 该邮箱在 `family_member` 表中的所有记录
- 相关的家庭信息
- 家庭成员数量

### 2. 如果发现残留记录，清理它们

```bash
cd Server
./cleanup_email.sh wangding070@gmail.com
```

**⚠️ 警告：** 此操作会永久删除该邮箱的所有相关记录！

### 3. 重启服务器

清理后，需要重启服务器以清除验证码缓存：

```bash
# 如果使用 Render，代码推送后会自动重启
# 如果本地运行，重启 Node.js 服务器
```

### 4. 重新尝试注册/登录

清理并重启后，应该可以正常注册或登录了。

## 常见问题

### Q: 为什么手动删除后仍然报错？

A: 可能的原因：
1. **数据库中有多个记录**：可能在不同表中，或者有重复记录
2. **验证码缓存**：服务器内存中的验证码缓存可能还有旧数据
3. **大小写问题**：数据库查询是大小写不敏感的，但可能有其他问题

### Q: 如何确认邮箱已完全清理？

A: 运行检查脚本：
```bash
./check_email.sh <email>
```

如果显示 "✅ 该邮箱在数据库中没有任何记录"，说明已清理完成。

### Q: 清理后仍然无法注册？

A: 尝试以下步骤：
1. 确认服务器已重启（清除验证码缓存）
2. 等待几分钟后重试（可能有数据库索引延迟）
3. 检查服务器日志，查看具体错误信息

## 服务器日志

服务器现在会记录更详细的日志：
- 注册时：`⚠️  Email <email> already exists in family_member table`
- 登录验证码错误：`⚠️  Invalid verification code for <email>. Expected: <code>, Got: <code>`

查看 Render 日志或本地服务器日志以获取更多信息。

