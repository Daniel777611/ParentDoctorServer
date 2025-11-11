# Cloudflare R2 CORS 配置指南

## 问题
浏览器无法显示 R2 中存储的图片，需要在 Cloudflare R2 中设置 CORS 策略。

## 解决方案

### 步骤 1: 进入 R2 CORS 设置

1. **登录 Cloudflare Dashboard**
   - 访问：https://dash.cloudflare.com
   - 登录你的账户

2. **进入 R2 存储**
   - 点击左侧菜单的 **Storage & databases** → **R2 object storage**
   - 选择你的 bucket：**torahnest**

3. **打开 Settings**
   - 点击顶部的 **Settings** 标签
   - 在左侧设置列表中，找到并点击 **CORS Policy**

### 步骤 2: 配置 CORS 策略

在 CORS Policy 页面，添加以下配置：

```json
[
  {
    "AllowedOrigins": [
      "https://torahnest.com",
      "https://www.torahnest.com",
      "https://parentdoctorserver.onrender.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### 步骤 3: 配置说明

**AllowedOrigins（允许的来源）：**
- `https://torahnest.com` - 你的主域名
- `https://www.torahnest.com` - www 子域名
- `https://parentdoctorserver.onrender.com` - Render 的默认域名（备用）

**AllowedMethods（允许的方法）：**
- `GET` - 获取文件
- `HEAD` - 检查文件是否存在

**AllowedHeaders（允许的请求头）：**
- `*` - 允许所有请求头

**ExposeHeaders（暴露的响应头）：**
- `ETag` - 用于缓存验证

**MaxAgeSeconds（缓存时间）：**
- `3600` - 1小时（3600秒）

### 步骤 4: 保存配置

1. 将上面的 JSON 配置粘贴到 CORS Policy 编辑框中
2. 点击 **Save** 或 **Update** 按钮
3. 等待配置生效（通常几秒钟）

### 步骤 5: 验证配置

配置完成后，在浏览器中：
1. 访问你的网站：`https://torahnest.com/main.html`
2. 检查浏览器控制台（F12）是否有 CORS 错误
3. 查看图片是否能正常显示

## 如果仍然无法显示图片

### 检查 Public Access

1. 在 R2 Settings 的 **General** 部分
2. 确认 **Public Access** 已启用
3. 如果未启用，点击启用

### 使用 Public Development URL

从你的 R2 设置页面可以看到：
- **Public Development URL**: `https://pub-d9b0fd7e8156404f90798d53457cc2cf.r2.dev`

这个 URL 已经可以公开访问，但建议：
1. 配置 CORS 策略（如上）
2. 或者使用自定义域名（推荐生产环境）

### 检查文件 URL 格式

确保代码中生成的 URL 格式正确：
```
https://{R2_ACCOUNT_ID}.r2.dev/{file_path}
```

例如：
```
https://e3fbbb67b918fa05db2f152ed13cde20.r2.dev/HealthAssistance/doctor/doctorsInfo/doc_xxxxx/avatar/1234567890_avatar.jpg
```

## 快速配置步骤总结

1. Cloudflare Dashboard → R2 → torahnest bucket
2. Settings → CORS Policy
3. 粘贴上面的 JSON 配置
4. 保存
5. 刷新网站测试

## 注意事项

- CORS 配置更改可能需要几分钟生效
- 确保所有需要访问的域名都添加到 `AllowedOrigins`
- 如果使用自定义域名访问 R2，也需要在 CORS 中添加该域名

