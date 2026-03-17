# Wildfire 插件配置指南

## 配置文件位置

安装成功后，配置文件位于：

```
~/.openclaw/config.yaml
```

或

```
~/.config/openclaw/config.yaml
```

## 配置方法

### 方法 1：使用 OpenClaw CLI（推荐）

```bash
# 设置网关地址
openclaw config set plugins.wildfire.gatewayUrl "ws://43.143.148.156:8884/robot/gateway"

# 设置机器人ID
openclaw config set plugins.wildfire.robotId "FireRobot"

# 设置机器人密钥
openclaw config set plugins.wildfire.robotSecret "123456"

# 启用插件
openclaw config set plugins.wildfire.enabled true

# 重启生效
openclaw restart
```

### 方法 2：直接编辑配置文件

```bash
# 编辑配置文件
nano ~/.openclaw/config.yaml
```

添加以下内容：

```yaml
plugins:
  wildfire:
    enabled: true
    gatewayUrl: "ws://43.143.148.156:8884/robot/gateway"
    robotId: "FireRobot"
    robotSecret: "123456"
    requireMention: true
    helpKeywords: "帮,请,分析,总结"
```

**注意**：
- 使用空格缩进，不要用 Tab
- 字符串建议加引号

### 方法 3：使用 UI 配置（如果 OpenClaw 支持）

```bash
# 启动 OpenClaw UI
openclaw ui

# 在浏览器中访问 http://localhost:8080
# 进入 Settings -> Plugins -> Wildfire IM
# 填写配置表单
```

## 完整配置示例

### 单账号配置

```yaml
plugins:
  wildfire:
    enabled: true
    gatewayUrl: "ws://localhost:8884/robot/gateway"
    robotId: "FireRobot"
    robotSecret: "123456"
    requireMention: true
    helpKeywords: "帮,请,分析,总结"
```

### 多账号配置

```yaml
plugins:
  wildfire:
    enabled: true
    accounts:
      main:
        enabled: true
        gatewayUrl: "ws://localhost:8884/robot/gateway"
        robotId: "robot1"
        robotSecret: "secret1"
        requireMention: true
      secondary:
        enabled: true
        gatewayUrl: "ws://other-server:8884/robot/gateway"
        robotId: "robot2"
        robotSecret: "secret2"
        requireMention: false
```

## 配置项说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|-------|------|------|--------|------|
| `enabled` | boolean | 否 | true | 是否启用插件 |
| `gatewayUrl` | string | **是** | - | 野火IM网关WebSocket地址 |
| `robotId` | string | **是** | - | 机器人ID |
| `robotSecret` | string | **是** | - | 机器人密钥 |
| `requireMention` | boolean | 否 | true | 群聊是否需要@机器人 |
| `helpKeywords` | string | 否 | "帮,请,分析,总结" | 触发回复的关键词 |

## 验证配置

```bash
# 查看配置
openclaw config get plugins.wildfire

# 应该输出：
# {
#   "enabled": true,
#   "gatewayUrl": "ws://...",
#   "robotId": "FireRobot",
#   "robotSecret": "***",
#   ...
# }

# 检查插件状态
openclaw plugins list

# 查看日志
openclaw logs
```

## 常见问题

### Q: 配置后插件没启动？

```bash
# 检查配置是否正确
openclaw config get plugins.wildfire.gatewayUrl

# 重启 OpenClaw
openclaw restart

# 查看日志
openclaw logs | grep wildfire
```

### Q: 连接失败？

```bash
# 检查网关地址是否可访问
curl -v ws://43.143.148.156:8884/robot/gateway

# 检查机器人凭证是否正确
```

### Q: 如何更新配置？

```bash
# 修改单个配置项
openclaw config set plugins.wildfire.robotSecret "new-secret"

# 重启生效
openclaw restart
```

## 下一步

配置完成后，在 OpenClaw UI 中：
1. 进入 Channels 页面
2. 应该能看到 "Wildfire IM"
3. 点击配置或启用
4. 测试发送消息
