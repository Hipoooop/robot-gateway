# Openclaw Adapter (Node.js版)

野火IM与Openclaw Gateway的桥接适配器，实现两个系统之间的双向通信和消息格式转换。

## 功能特性

- ✅ **双向桥接**：野火IM ↔ Openclaw Gateway
- ✅ **智能转换**：自动转换消息格式
- ✅ **用户白名单**：只处理指定用户和群组的消息（默认启用）
- ✅ **群聊过滤**：防刷屏策略（@回复、问号回复、关键词回复、白名单）
- ✅ **流式消息**：支持AI流式文本生成（正在输入/完成状态）
- ✅ **上下文管理**：使用runId跟踪消息上下文，确保正确回复
- ✅ **自动重连**：双方断线自动重连（最多重试10次）
- ✅ **健康检查**：提供HTTP接口监控状态
- ✅ **守护进程**：支持后台运行，带启动/停止/重启/状态管理

## 架构

```
野火IM → 野火网关 → Openclaw Adapter → Openclaw Gateway → AI
                    ←                      ←
```

## 安装

### 全局安装（推荐）

```bash
npm install -g @wildfirechat/openclaw-adapter
```

### 本地安装

```bash
npm install @wildfirechat/openclaw-adapter
```

## 配置

### 自动创建配置（全局安装）

安装完成后，会自动创建配置目录 `~/.wf-openclaw-adapter/`，包含示例配置文件。

### 手动创建配置

```bash
mkdir -p ~/.wf-openclaw-adapter
cat > ~/.wf-openclaw-adapter/config.json << 'EOF'
{
  "wildfire": {
    "gateway": {
      "url": "ws://localhost:8884/robot/gateway",
      "robotId": "YourRobotId",
      "robotSecret": "YourRobotSecret"
    }
  },
  "openclaw": {
    "gateway": {
      "url": "ws://127.0.0.1:18789",
      "token": "your-token",
      "scope": "wildfire-im",
      "reconnectInterval": 5000,
      "heartbeatInterval": 30000
    },
    "whitelist": {
      "enabled": true,
      "allowedUsers": ["user1", "user2"],
      "allowedGroups": ["group1"]
    },
    "group": {
      "enabled": true,
      "respondOnMention": true,
      "respondOnQuestion": true,
      "helpKeywords": "帮,请,分析,总结,怎么,如何",
      "allowedIds": ["group1", "group2"]
    }
  },
  "server": {
    "port": 8080
  }
}
EOF
```

### 配置说明

#### 野火网关配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `wildfire.gateway.url` | 野火网关WebSocket地址 | `ws://localhost:8884/robot/gateway` |
| `wildfire.gateway.robotId` | 机器人ID | - |
| `wildfire.gateway.robotSecret` | 机器人密钥 | - |

#### Openclaw Gateway配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `openclaw.gateway.url` | Openclaw Gateway地址 | `ws://127.0.0.1:18789` |
| `openclaw.gateway.token` | 认证令牌 | - |
| `openclaw.gateway.scope` | 作用域 | `wildfire-im` |
| `openclaw.gateway.reconnectInterval` | 重连间隔(ms) | `5000` |
| `openclaw.gateway.heartbeatInterval` | 心跳间隔(ms) | `30000` |

#### 白名单配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `openclaw.whitelist.enabled` | 是否启用白名单 | `true` |
| `openclaw.whitelist.allowedUsers` | 允许的用户ID列表 | `[]` |
| `openclaw.whitelist.allowedGroups` | 允许的群组ID列表 | `[]` |

#### 群聊策略配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `openclaw.group.enabled` | 是否启用群聊策略 | `true` |
| `openclaw.group.respondOnMention` | 被@时回复 | `true` |
| `openclaw.group.respondOnQuestion` | 问号结尾回复 | `true` |
| `openclaw.group.helpKeywords` | 求助关键词 | `帮,请,分析,总结,怎么,如何` |
| `openclaw.group.allowedIds` | 群聊白名单 | `[]` |

### 环境变量

所有配置项都可通过环境变量覆盖：

```bash
export WILDFIRE_GATEWAY_URL=ws://localhost:8884/robot/gateway
export WILDFIRE_ROBOT_ID=mybot
export WILDFIRE_ROBOT_SECRET=secret
export OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=xxx
export SERVER_PORT=8080
```

## 使用

### 启动（全局安装后）

#### 前台运行（调试模式）

```bash
# 使用默认配置路径 (~/.wf-openclaw-adapter/config.json)
openclaw-adapter

# 或使用别名
wf-openclaw

# 指定配置文件
openclaw-adapter -config ./my-config.json

# 显示帮助
openclaw-adapter --help

# 显示版本
openclaw-adapter --version
```

#### 后台守护进程模式（生产环境推荐）

```bash
# 方式1：使用 -d/--daemon 参数启动
openclaw-adapter -d
openclaw-adapter --daemon

# 方式2：使用 start 命令启动
openclaw-adapter start

# 指定配置文件启动守护进程
openclaw-adapter start -config ./my-config.json

# 查看守护进程状态
openclaw-adapter status

# 停止守护进程
openclaw-adapter stop

# 重启守护进程
openclaw-adapter restart
```

守护进程模式特点：
- 在后台运行，不占用终端
- 自动记录日志到 `~/.wf-openclaw-adapter/openclaw-adapter.log`
- 错误日志记录到 `~/.wf-openclaw-adapter/openclaw-adapter.error.log`
- PID 文件保存在 `~/.wf-openclaw-adapter/openclaw-adapter.pid`

### 使用 npx（无需全局安装）

```bash
npx @wildfirechat/openclaw-adapter
```

### 作为依赖使用

```javascript
import { OpenclawBridge, Config, HealthServer } from '@wildfirechat/openclaw-adapter';

const config = new Config().get();
const bridge = new OpenclawBridge(config);
const healthServer = new HealthServer(config.server.port, bridge);

await healthServer.start();
await bridge.start();
```

## 健康检查

启动后可以通过以下接口检查状态：

```bash
# 健康检查
curl http://localhost:8080/health

# 详细状态
curl http://localhost:8080/status

# 测试接口
curl http://localhost:8080/test
```

### 健康检查响应示例

```json
{
  "status": "UP",
  "components": {
    "wildfire": {
      "status": "UP",
      "details": {
        "connected": true
      }
    },
    "openclaw": {
      "status": "UP",
      "details": {
        "connected": true
      }
    }
  }
}
```

## 消息流程

### 私聊

```
用户 → 野火IM → 野火网关 → Adapter → Openclaw → AI回复 → Adapter → 野火网关 → 用户
```

### 群聊（带过滤）

```
群成员 → 野火IM → 野火网关 → Adapter → [白名单检查] → [群聊策略检查] → Openclaw → AI回复 → 群成员
                                          ↓                  ↓
                                    在白名单？          符合条件？
                                    不在？→ 拦截        不符合？→ 拦截
```

## 群聊策略

群聊默认不直接响应，需满足以下条件之一：

1. **被@时回复**：消息中@机器人
2. **问号结尾**：消息以"?"或"？"结尾
3. **求助关键词**：包含"帮"、"请"、"分析"、"总结"、"怎么"、"如何"等
4. **白名单群聊**：在`allowedIds`中配置的群聊

可以关闭群聊策略：
```json
{
  "openclaw": {
    "group": {
      "enabled": false
    }
  }
}
```

## 项目结构

```
openclaw-adapter.js/
├── bin/
│   ├── openclaw-adapter.js          # 启动脚本
│   └── setup.js                     # 安装后设置脚本
├── src/
│   ├── index.js                     # 主入口
│   ├── core/
│   │   └── OpenclawBridge.js        # 桥接器核心
│   ├── openclaw/
│   │   ├── OpenclawWebSocketClient.js
│   │   └── protocol/
│   │       ├── OpenclawProtocol.js
│   │       ├── OpenclawInMessage.js
│   │       └── OpenclawOutMessage.js
│   ├── converter/
│   │   └── MessageConverter.js      # 消息转换
│   ├── filter/
│   │   ├── WhitelistFilter.js       # 白名单过滤
│   │   └── GroupFilter.js           # 群聊过滤
│   ├── config/
│   │   └── Config.js                # 配置管理
│   └── server/
│       └── HealthServer.js          # HTTP健康检查
├── package.json
├── config.example.json              # 示例配置
└── README.md
```

## 依赖

- `@wildfirechat/robot-gateway-client-sdk` - 野火机器人网关客户端SDK
- `@wildfirechat/server-sdk` - 野火IM服务端SDK（提供消息内容类）
- `ws` - WebSocket客户端

## Docker 部署

```dockerfile
FROM node:18-alpine

RUN npm install -g @wildfirechat/openclaw-adapter

# 复制配置文件
COPY config.json /root/.wf-openclaw-adapter/config.json

EXPOSE 8080

CMD ["openclaw-adapter"]
```

## 故障排查

### 消息无响应

1. **检查白名单配置**
   - 确认`openclaw.whitelist.enabled`设置
   - 验证用户/群组ID是否在白名单中

2. **检查群聊策略**
   - 确认`openclaw.group.enabled`设置
   - 检查是否被@或包含关键词

3. **检查Openclaw Gateway**
   - 确认Openclaw Gateway是否运行
   - 检查网络连接
   - 验证token配置

### 查看日志

```bash
# 前台运行查看日志
openclaw-adapter

# 或使用 DEBUG 环境变量查看详细日志
DEBUG=* openclaw-adapter

# 查看守护进程日志
tail -f ~/.wf-openclaw-adapter/openclaw-adapter.log
tail -f ~/.wf-openclaw-adapter/openclaw-adapter.error.log
```

### 守护进程问题

**无法启动守护进程**
1. 检查是否有权限写入 `~/.wf-openclaw-adapter/` 目录
2. 检查端口是否被占用
3. 查看错误日志：`cat ~/.wf-openclaw-adapter/openclaw-adapter.error.log`

**守护进程无法停止**
1. 手动查找进程：`ps aux | grep openclaw-adapter`
2. 手动终止：`kill -9 <PID>`
3. 删除 PID 文件：`rm ~/.wf-openclaw-adapter/openclaw-adapter.pid`

## 许可证

MIT
