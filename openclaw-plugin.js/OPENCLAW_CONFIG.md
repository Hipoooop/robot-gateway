# OpenClaw 配置指南

## 错误解决

### 错误：`must have required property 'auth_token'`

这个错误表示 OpenClaw 配置中缺少 `auth_token`。

## 完整配置步骤

### 1. 安装插件

```bash
openclaw plugins install ./openclaw-wildfire-1.0.0.tgz
```

### 2. 生成 Auth Token

```bash
# 使用插件 CLI 生成 token
openclaw-wf generate-token

# 输出示例：
# Generated Auth Token:
# a1b2c3d4e5f6789012345678901234567890abcdef...
```

### 3. 配置 OpenClaw

编辑 OpenClaw 配置文件（通常是 `~/.openclaw/config.yaml` 或 `~/.config/openclaw/config.yaml`）：

```yaml
plugins:
  wildfire:
    enabled: true
    url: http://localhost:18080
    auth_token: "your-generated-token-here"  # 必须！
    webhook_url: http://localhost:8080/webhook/wildfire  # 可选
```

**注意**：`auth_token` 是必需字段，不能为空。

### 4. 启动插件服务

```bash
# 先启动插件服务
openclaw-wf start

# 然后启动 OpenClaw
openclaw start
```

## 配置示例

### 最小配置（仅私聊）

```yaml
plugins:
  wildfire:
    enabled: true
    url: http://localhost:18080
    auth_token: "a1b2c3d4e5f6..."
```

### 完整配置（支持群聊）

```yaml
plugins:
  wildfire:
    enabled: true
    url: http://localhost:18080
    auth_token: "a1b2c3d4e5f6..."
    webhook_url: http://localhost:8080/webhook/wildfire
    
    # 可选：群聊配置
    group:
      enabled: true
      respond_on_mention: true
      help_keywords: "帮,请,分析"
```

## 验证配置

```bash
# 1. 检查插件配置
openclaw config get plugins.wildfire

# 2. 测试插件连接
curl http://localhost:18080/health

# 3. 查看 OpenClaw 日志
openclaw logs
```

## 常见问题

### Q: 如何找到 OpenClaw 配置文件？

```bash
# 查找配置文件路径
openclaw config path
# 或
cat ~/.openclaw/config.yaml
cat ~/.config/openclaw/config.yaml
```

### Q: 如何重新生成 token？

```bash
openclaw-wf generate-token

# 然后更新 OpenClaw 配置
openclaw config set plugins.wildfire.auth_token "new-token"
```

### Q: 插件配置和 OpenClaw 配置的关系？

| 配置位置 | 用途 |
|---------|------|
| `~/.config/openclaw/plugins/wildfire/config.json` | 插件服务配置（野火IM连接信息） |
| `~/.openclaw/config.yaml` | OpenClaw 主配置（插件发现、token） |

### Q: 启动顺序？

```bash
# 1. 先启动野火IM网关（通常是独立的）

# 2. 启动插件服务
openclaw-wf start

# 3. 最后启动 OpenClaw
openclaw start
```

## 故障排查

### 检查配置

```bash
# 查看完整配置
openclaw config show

# 检查插件配置
openclaw config get plugins.wildfire.auth_token

# 设置配置
openclaw config set plugins.wildfire.url "http://localhost:18080"
openclaw config set plugins.wildfire.auth_token "your-token"
```

### 验证插件运行

```bash
# 插件健康检查
curl http://localhost:18080/health

# 测试发送消息
curl -X POST http://localhost:18080/api/v1/message/send \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"conversation":{"type":0,"target":"user123"},"message":{"text":"test"}}'
```
