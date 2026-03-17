# OpenClaw 安装插件指南

## 安装方式

### 方式一：从 npm 安装（正式发布后）

```bash
# 安装最新版本
openclaw plugins install @openclaw/wildfire

# 安装指定版本
openclaw plugins install @openclaw/wildfire@1.0.0
```

### 方式二：本地开发安装

```bash
# 1. 在插件目录打包
cd /path/to/openclaw-plugin.js
npm pack

# 2. 通过 OpenClaw CLI 安装本地包
openclaw plugins install ./openclaw-wildfire-1.0.0.tgz

# 或者直接安装目录
openclaw plugins install /path/to/openclaw-plugin.js
```

### 方式三：手动安装（如果 OpenClaw 不支持本地路径）

```bash
# 1. 找到 OpenClaw 配置目录
export OPENCLAW_HOME=${OPENCLAW_HOME:-~/.config/openclaw}

# 2. 创建插件目录
mkdir -p $OPENCLAW_HOME/plugins/wildfire
cd $OPENCLAW_HOME/plugins/wildfire

# 3. 初始化 npm 项目
npm init -y

# 4. 安装插件
npm install /path/to/openclaw-plugin.js/openclaw-wildfire-1.0.0.tgz

# 或者链接开发目录
npm link /path/to/openclaw-plugin.js
```

## 配置 OpenClaw

安装后，在 OpenClaw 配置文件中添加插件配置：

```yaml
# ~/.config/openclaw/config.yaml
plugins:
  wildfire:
    enabled: true
    url: http://localhost:18080
    auth_token: your-generated-token
    webhook_url: http://localhost:8080/webhook/wildfire  # 可选

# 或者在 channels 中配置
channels:
  wildfire-im:
    type: plugin
    plugin: wildfire
    url: http://localhost:18080
    auth_token: your-generated-token
```

## 初始化插件配置

```bash
# 运行插件的初始化命令
openclaw-wf init

# 或
~/.config/openclaw/plugins/wildfire/node_modules/.bin/openclaw-wf init
```

按提示输入：
- 野火网关地址：`ws://localhost:8884/robot/gateway`
- 机器人ID：`FireRobot`
- 机器人密钥：`123456`

## 生成 Auth Token

```bash
# 生成并自动保存到配置
openclaw-wf generate-token

# 复制输出的 token 到 OpenClaw 配置
```

## 启动插件

```bash
# 方式一：使用插件 CLI
openclaw-wf start

# 方式二：通过 OpenClaw 启动（如果支持）
openclaw plugins start wildfire

# 方式三：后台运行
openclaw-wf start &
```

## 验证安装

```bash
# 1. 检查插件状态
openclaw-wf status
# 或
curl http://localhost:18080/health

# 2. 测试发送消息
curl -X POST http://localhost:18080/api/v1/message/send \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation": {"type": 0, "target": "user123"},
    "message": {"text": "Hello"}
  }'
```

## 更新插件

```bash
# 更新到最新版本
openclaw plugins update @openclaw/wildfire

# 或重新安装
openclaw plugins uninstall @openclaw/wildfire
openclaw plugins install @openclaw/wildfire
```

## 卸载插件

```bash
openclaw plugins uninstall @openclaw/wildfire

# 手动清理
rm -rf ~/.config/openclaw/plugins/wildfire
```

## 故障排查

### 插件命令找不到

```bash
# 确保在 PATH 中
export PATH="$PATH:$HOME/.config/openclaw/plugins/wildfire/node_modules/.bin"

# 或使用 npx
npx openclaw-wf help
```

### 配置不生效

```bash
# 检查配置文件位置
cat ~/.config/openclaw/plugins/wildfire/config.json

# 确保权限正确
chmod 600 ~/.config/openclaw/plugins/wildfire/config.json
```

### 端口冲突

```bash
# 修改端口
openclaw-wf config set plugin.server.port 18081
openclaw-wf restart
```
