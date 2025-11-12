# 推送到Git并部署到Render

## ✅ 已完成

1. **Xcode项目文件已更新**
   - 已自动添加以下文件到Xcode项目：
     - `ParentRegistrationView.swift`
     - `ParentLoginView.swift`
     - `WelcomeView.swift`

2. **服务器代码已提交到本地Git**
   - 提交信息：Add parent/family registration system
   - 包含的文件：
     - `server.js` (已修改，添加了家长注册API)
     - `CONFIGURATION_STATUS.md`
     - `INSTALL_NODE.md`
     - `SETUP_INSTRUCTIONS.md`
     - `setup.sh`

## 📤 需要手动推送

由于需要Git认证，请手动执行以下命令推送代码：

### 方法1：使用HTTPS（需要Personal Access Token）

```bash
cd Server
git push origin main
```

如果提示输入用户名和密码：
- 用户名：你的GitHub用户名
- 密码：使用GitHub Personal Access Token（不是账户密码）

### 方法2：使用SSH（推荐）

如果已配置SSH密钥：

```bash
cd Server
# 检查远程URL
git remote get-url origin

# 如果是HTTPS，切换到SSH
git remote set-url origin git@github.com:Daniel777611/ParentDoctorServer.git

# 推送
git push origin main
```

### 方法3：在Xcode中推送

1. 打开Xcode
2. 选择 Source Control → Push
3. 输入GitHub凭据

## 🚀 Render自动部署

一旦代码推送到GitHub，Render会自动检测并开始部署：

1. **检查部署状态**：
   - 登录 https://render.com
   - 进入你的ParentDoctorServer服务
   - 查看"Events"标签页，应该看到新的部署开始

2. **部署时间**：
   - 通常需要2-5分钟
   - 部署完成后，服务器会自动重启并应用新代码

3. **验证部署**：
   - 部署完成后，访问：`https://parentdoctorserver.onrender.com/api/health`
   - 应该返回正常响应

## 📝 新API端点

推送后，以下新API端点将可用：

- `POST /api/parent/verify/send-code` - 发送注册验证码
- `POST /api/parent/register` - 家长注册
- `POST /api/parent/login/send-code` - 发送登录验证码
- `POST /api/parent/login/verify-code` - 验证登录
- `GET /api/parent/family/:familyId` - 获取家庭信息
- `POST /api/parent/child` - 添加/更新孩子信息

## ⚠️ 注意事项

1. **数据库迁移**：
   - 新表（family, child）会在服务器启动时自动创建
   - 确保数据库连接正常

2. **环境变量**：
   - 确保Render中已配置所有必需的环境变量
   - 特别是 `DATABASE_URL` 和邮件服务配置

3. **测试**：
   - 部署完成后，使用iOS应用测试注册功能
   - 确保API端点正常工作

