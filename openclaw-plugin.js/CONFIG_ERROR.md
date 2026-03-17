# 配置错误解决

## 错误：`must have required property 'gatewayUrl'`

这个错误表示 OpenClaw 配置中缺少必需的 `gatewayUrl` 字段。

## 解决方法

### 1. 编辑 OpenClaw 配置文件

找到 OpenClaw 配置文件（通常是 `~/.openclaw/config.yaml` 或 `~/.config/openclaw/config.yaml`）：

```bash
# 查找配置文件
openclaw config path
# 或
cat ~/.openclaw/config.yaml
```

### 2. 添加 Wildfire 配置

```yaml
plugins:
  wildfire:
    enabled: true
    gatewayUrl: ws://localhost:8884/robot/gateway
    robotId: FireRobot
    robotSecret: 123456
```

### 3. 通过 OpenClaw CLI 设置

```bash
# 设置网关地址
openclaw config set plugins.wildfire.gatewayUrl ws://localhost:8884/robot/gateway

# 设置机器人ID
openclaw config set plugins.wildfire.robotId FireRobot

# 设置机器人密钥
openclaw config set plugins.wildfire.robotSecret 123456

# 启用插件
openclaw config set plugins.wildfire.enabled true
```

### 4. 完整配置示例

```yaml
# ~/.openclaw/config.yaml
plugins:
  wildfire:
    enabled: true
    gatewayUrl: ws://localhost:8884/robot/gateway
    robotId: FireRobot
    robotSecret: 123456
    requireMention: true
    helpKeywords: "帮,请,分析,总结"
```

### 5. 重启 OpenClaw

```bash
openclaw restart
```

## 验证配置

```bash
# 查看配置
openclaw config get plugins.wildfire

# 应该输出包含 gatewayUrl 的配置
```

## 必需字段

| 字段 | 说明 | 示例 |
|-----|------|------|
| `gatewayUrl` | 野火IM网关WebSocket地址 | `ws://localhost:8884/robot/gateway` |
| `robotId` | 机器人ID | `FireRobot` |
| `robotSecret` | 机器人密钥 | `123456` |

## 可选字段

| 字段 | 说明 | 默认值 |
|-----|------|--------|
| `enabled` | 是否启用 | `true` |
| `requireMention` | 群聊是否需要@ | `true` |
| `helpKeywords` | 触发响应的关键词 | `"帮,请,分析,总结"` |
