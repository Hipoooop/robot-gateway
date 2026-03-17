# 开发指南 - 本地打包与安装测试

## 快速开始

### 1. 克隆并准备

```bash
cd /Users/jiangecho/bitbucket/wildfirechat/robot-gateway/openclaw-plugin.js

# 安装依赖
npm install

# 构建
npm run build
```

### 2. 本地打包

```bash
# 生成 .tgz 文件
npm pack

# 会看到类似输出：
# npm notice 📦  @openclaw/wildfire@1.0.0
# npm notice === Tarball Contents ===
# ...
# npm notice === Tarball Details ===
# npm notice name:          @openclaw/wildfire
# npm notice version:       1.0.0
# npm notice filename:      @openclaw/wildfire-1.0.0.tgz
# npm notice package size:  15.4 kB
# npm notice unpacked size: 58.2 kB
# npm notice total files:   25

# 生成的文件
ls -la @openclaw/wildfire-1.0.0.tgz
```

### 3. 本地安装测试

#### 方式一：全局安装（推荐用于测试 CLI）

```bash
# 全局安装本地包
npm install -g ./@openclaw/wildfire-1.0.0.tgz

# 测试命令
openclaw-wf --version
openclaw-wf help

# 初始化配置
openclaw-wf init

# 启动服务
openclaw-wf start
```

#### 方式二：安装到测试项目

```bash
# 创建测试目录
mkdir -p /tmp/test-openclaw-plugin
cd /tmp/test-openclaw-plugin

# 初始化 npm 项目
npm init -y

# 安装本地包
npm install /path/to/openclaw-plugin.js/@openclaw/wildfire-1.0.0.tgz

# 使用 npx 运行
npx openclaw-wf help
npx openclaw-wf init
```

#### 方式三：直接链接开发版本（不打包）

```bash
# 在插件目录创建链接
cd /path/to/openclaw-plugin.js
npm link

# 在测试项目使用链接
mkdir -p /tmp/test-project
cd /tmp/test-project
npm link @openclaw/wildfire

# 现在测试项目使用的是开发目录的最新代码
# 修改代码后，测试项目立即生效（需要重启服务）
```

### 4. 完整测试流程

```bash
#!/bin/bash
# test-install.sh - 完整安装测试脚本

set -e

echo "=== 1. 构建项目 ==="
cd /Users/jiangecho/bitbucket/wildfirechat/robot-gateway/openclaw-plugin.js
npm run build

echo ""
echo "=== 2. 打包 ==="
npm pack
PACKAGE=$(ls -t @openclaw/wildfire-*.tgz | head -1)
echo "生成的包: $PACKAGE"

echo ""
echo "=== 3. 创建测试环境 ==="
TEST_DIR="/tmp/openclaw-plugin-test-$$"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo ""
echo "=== 4. 安装本地包 ==="
npm init -y
npm install "/Users/jiangecho/bitbucket/wildfirechat/robot-gateway/openclaw-plugin.js/$PACKAGE"

echo ""
echo "=== 5. 测试 CLI ==="
./node_modules/.bin/openclaw-wf help

echo ""
echo "=== 6. 初始化配置 ==="
# 非交互式初始化，使用环境变量或默认值
mkdir -p ~/.config/openclaw/plugins/wildfire
cat > ~/.config/openclaw/plugins/wildfire/config.json << 'EOF'
{
  "wildfire": {
    "gateway": {
      "url": "ws://localhost:8884/robot/gateway",
      "robotId": "test-robot",
      "robotSecret": "test-secret"
    }
  },
  "plugin": {
    "server": {
      "host": "0.0.0.0",
      "port": 18080,
      "authToken": "test-token-123456"
    },
    "webhook": {
      "url": "",
      "authToken": ""
    },
    "group": {
      "enabled": true,
      "respondOnMention": true,
      "respondOnQuestion": true,
      "helpKeywords": "帮,请,分析",
      "allowedIds": []
    },
    "whitelist": {
      "enabled": false,
      "allowedUsers": [],
      "allowedGroups": []
    },
    "file": {
      "enabled": true,
      "allowedTypes": ["image", "video", "audio", "file"],
      "maxSize": 100
    }
  }
}
EOF

echo ""
echo "=== 7. 启动服务测试 ==="
# 后台启动
timeout 5s ./node_modules/.bin/openclaw-wf start &
PID=$!
sleep 2

echo ""
echo "=== 8. 健康检查 ==="
curl -s http://localhost:18080/health | head -20 || echo "服务未启动（可能没有野火IM环境）"

# 清理
kill $PID 2>/dev/null || true

echo ""
echo "=== 9. 清理 ==="
cd /
rm -rf "$TEST_DIR"
rm -f "/Users/jiangecho/bitbucket/wildfirechat/robot-gateway/openclaw-plugin.js/$PACKAGE"

echo ""
echo "✅ 测试完成！"
```

### 5. 调试模式

```bash
# 1. 直接运行（不打包）
cd openclaw-plugin.js
npm run build
npm start

# 2. 修改代码后热重载（两个终端）
# 终端 1: 监听编译
npm run dev

# 终端 2: 运行
node dist/server.js

# 3. 使用 ts-node 直接运行 TypeScript（如果安装了 ts-node）
npx ts-node src/server.ts
```

### 6. 模拟 OpenClaw 调用

```bash
# 测试健康检查
curl http://localhost:18080/health

# 测试发送消息
curl -X POST http://localhost:18080/api/v1/message/send \
  -H "Authorization: Bearer test-token-123456" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation": {
      "type": 0,
      "target": "test-user"
    },
    "message": {
      "text": "Hello from test"
    }
  }'

# 测试发送文件（base64 编码的图片）
echo '{"type":"image","name":"test.png","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}' > /tmp/test-image.json

curl -X POST http://localhost:18080/api/v1/file/send \
  -H "Authorization: Bearer test-token-123456" \
  -H "Content-Type: application/json" \
  -d @/tmp/test-image.json
```

### 7. 发布到 npm（正式）

```bash
# 1. 登录 npm
npm login

# 2. 检查包内容
npm pack --dry-run

# 3. 发布
npm publish --access public

# 4. 发布后用户可以这样安装
npm install -g @openclaw/wildfire
# 或
openclaw plugins install @openclaw/wildfire
```

## 常见问题

### Q: 打包时包含不必要的文件？

在 `.npmignore` 中添加排除规则：

```
src/
tsconfig.json
*.tgz
.gitignore
DEVELOP.md
```

### Q: 安装后找不到命令？

```bash
# 检查全局安装位置
npm root -g

# 确保路径在 PATH 中
export PATH="$PATH:$(npm root -g)/.bin"

# 或者使用 npx
npx openclaw-wf help
```

### Q: 本地修改后如何更新？

```bash
# 如果使用的是 npm link，直接修改即可生效

# 如果使用的是打包安装，需要重新打包安装
cd openclaw-plugin.js
npm run build
npm pack
npm install -g ./@openclaw/wildfire-1.0.0.tgz --force
```

## 目录结构

```
openclaw-plugin.js/
├── bin/cli.js              # CLI 入口
├── dist/                   # 编译输出（打包包含）
│   ├── server.js
│   ├── WildfireChannel.js
│   └── ...
├── src/                    # 源码（打包排除）
│   ├── server.ts
│   ├── WildfireChannel.ts
│   └── ...
├── @openclaw/wildfire-1.0.0.tgz  # 生成的包（git 忽略）
└── DEVELOP.md              # 本文件
```
