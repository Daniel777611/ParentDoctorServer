# Node.js 安装指南

由于系统环境限制，请按照以下方式安装 Node.js：

## 方式1：从官网下载安装（推荐）

1. **访问 Node.js 官网**：
   https://nodejs.org/

2. **下载 LTS 版本**（推荐 18.x 或 20.x）

3. **安装**：
   - 下载 `.pkg` 文件
   - 双击安装
   - 按照提示完成安装

4. **验证安装**：
   ```bash
   node --version
   npm --version
   ```

## 方式2：使用 nvm (Node Version Manager)

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载shell配置
source ~/.zshrc  # 或 ~/.bash_profile

# 安装 Node.js LTS
nvm install --lts
nvm use --lts

# 验证
node --version
npm --version
```

## 方式3：使用 MacPorts（如果已安装）

```bash
sudo port install nodejs18
```

## 安装完成后

1. **安装项目依赖**：
   ```bash
   cd Server
   npm install
   ```

2. **配置环境变量**：
   编辑 `.env` 文件，填入你的配置

3. **运行服务器**：
   ```bash
   npm start
   ```

