# 自定义域名配置指南 - torahnest.com

## 概述
本指南将帮助你将 Render 服务从 `parentdoctorserver.onrender.com` 迁移到自定义域名 `torahnest.com`。

## 步骤 1: 在 Render 上添加自定义域名

1. **登录 Render Dashboard**
   - 访问：https://render.com
   - 登录你的账户

2. **进入服务设置**
   - 选择 `ParentDoctorServer` 服务
   - 点击左侧菜单的 **Settings**

3. **添加自定义域名**
   - 在 **Custom Domains** 部分
   - 点击 **Add Custom Domain**
   - 输入：`torahnest.com`
   - 点击 **Save**

4. **获取 DNS 配置信息**
   - Render 会显示需要配置的 DNS 记录
   - 通常是一个 CNAME 记录，指向类似 `xxx.onrender.com` 的地址
   - **重要：** 记录下这个 CNAME 目标值

## 步骤 2: 在 Cloudflare 上配置 DNS

1. **登录 Cloudflare Dashboard**
   - 访问：https://dash.cloudflare.com
   - 选择域名 `torahnest.com`

2. **进入 DNS 设置**
   - 点击左侧菜单的 **DNS** → **Records**

3. **添加 CNAME 记录（根域名）**
   - 点击 **Add record**
   - **Type:** 选择 `CNAME`
   - **Name:** 输入 `@` 或留空（表示根域名 `torahnest.com`）
   - **Target:** 输入 Render 提供的 CNAME 目标值（例如：`xxx.onrender.com`）
   - **Proxy status:** 点击云朵图标，设置为 **DNS only**（灰色云朵，不代理）
   - 点击 **Save**

4. **添加 CNAME 记录（www 子域名，可选）**
   - 点击 **Add record**
   - **Type:** 选择 `CNAME`
   - **Name:** 输入 `www`
   - **Target:** 输入与上面相同的 CNAME 目标值
   - **Proxy status:** 设置为 **DNS only**（灰色云朵）
   - 点击 **Save**

5. **删除或修改冲突记录**
   - 如果已有 A 记录指向其他 IP，需要删除或修改
   - 确保根域名只使用 CNAME 记录指向 Render

## 步骤 3: 更新环境变量

1. **在 Render 中更新 APP_URL**
   - 进入 `ParentDoctorServer` 服务
   - 点击 **Environment** 标签
   - 找到 `APP_URL` 变量
   - 点击编辑，将值改为：`https://torahnest.com`
   - 点击 **Save Changes**

2. **更新 SMTP_FROM（如果使用自定义域名邮箱）**
   - 如果邮件服务支持，可以更新 `SMTP_FROM` 为：
     ```
     SMTP_FROM=Torahnest Health <noreply@torahnest.com>
     ```
   - 注意：这需要先配置域名的邮件服务（如 SendGrid Domain Authentication）

## 步骤 4: 等待配置生效

1. **DNS 传播**
   - DNS 更改通常需要 5-30 分钟生效
   - 可以使用工具检查：https://dnschecker.org
   - 输入 `torahnest.com`，选择 CNAME 记录类型

2. **SSL 证书**
   - Render 会自动为自定义域名配置 SSL 证书
   - 这可能需要几分钟时间
   - 在 Render 的 Custom Domains 页面查看状态

3. **验证配置**
   - 在 Render 的 Custom Domains 页面
   - 域名状态应显示为 **Active**（绿色）
   - 如果显示 "Pending" 或错误，检查 DNS 配置

## 步骤 5: 测试访问

1. **测试根域名**
   - 访问：https://torahnest.com
   - 应该能看到主页

2. **测试子页面**
   - 访问：https://torahnest.com/doctor.html
   - 访问：https://torahnest.com/signin.html
   - 确保所有页面都能正常访问

## 常见问题

### DNS 记录不生效
- 检查 Cloudflare 的 Proxy 状态是否为 **DNS only**（灰色云朵）
- 等待更长时间（最多 48 小时）
- 清除浏览器 DNS 缓存

### SSL 证书问题
- Render 会自动配置 SSL，通常需要几分钟
- 如果长时间未生效，检查 DNS 是否正确配置
- 确保域名正确指向 Render

### 邮件服务问题
- 如果使用自定义域名发送邮件，需要配置 SPF、DKIM 等记录
- 参考 SendGrid 或其他邮件服务的域名验证文档

## 配置完成后

✅ **域名配置完成后的检查清单：**
- [ ] DNS 记录已正确配置（CNAME 指向 Render）
- [ ] Render 中域名状态显示为 "Active"
- [ ] SSL 证书已自动配置（HTTPS 可用）
- [ ] 环境变量 `APP_URL` 已更新为 `https://torahnest.com`
- [ ] 可以通过 `https://torahnest.com` 访问网站
- [ ] 所有子页面都能正常访问

## 回退方案

如果遇到问题需要回退：
1. 在 Render 中删除自定义域名
2. 将 `APP_URL` 改回 `https://parentdoctorserver.onrender.com`
3. 服务会继续使用原来的 Render 域名

