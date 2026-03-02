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

## 架构

```
野火IM → 野火网关 → Openclaw Adapter → Openclaw Gateway → AI
                    ←                      ←
```

## 安装

```bash
# 克隆仓库后进入目录
cd openclaw-adapter.js

# 安装依赖
npm install

# 如果使用 yarn
yarn install
```

## 配置

### 配置文件位置

配置文件优先查找顺序：
1. 命令行 `-config` 参数指定的文件
2. `~/.wf-openclaw-adapter/config.json` （默认位置）
3. 环境变量

### 创建配置目录和文件

```bash
# 创建配置目录
mkdir -p ~/.wf-openclaw-adapter

# 复制示例配置
cp config.example.json ~/.wf-openclaw-adapter/config.json

# 编辑配置
nano ~/.wf-openclaw-adapter/config.json
```

### 配置示例

```json
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
      "token": "47ad97ccf12a4cf3ed799dc7dfc94690990c67348f4cf242",
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
WILDFIRE_GATEWAY_URL=ws://localhost:8884/robot/gateway \
WILDFIRE_ROBOT_ID=mybot \
WILDFIRE_ROBOT_SECRET=secret \
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789 \
OPENCLAW_GATEWAY_TOKEN=xxx \
SERVER_PORT=8080 \
node bin/openclaw-adapter.js
```

## 使用

### 启动

```bash
# 使用默认配置路径 (~/.wf-openclaw-adapter/config.json)
npm start

# 或使用 yarn
yarn start

# 指定配置文件
node bin/openclaw-adapter.js -config ./my-config.json

# 开发模式（使用当前目录的 config.json）
npm run dev
```

### 健康检查

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
│   └── openclaw-adapter.js          # 启动脚本
├── src/
│   ├── index.js                     # 主入口
│   ├── core/
│   │   └── OpenclawBridge.js        # 桥接器核心
│   ├── openclaw/
│   │   ├── OpenclawWebSocketClient.js
│   │   └── protocol/
│   │       ├── OpenclawProtocol.js  # 协议定义
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
- `ws` - WebSocket客户端

## 日志

关键日志：
- `Connected to Wildfire Gateway` - 野火连接成功
- `Waiting for connect challenge event` - 等待Openclaw认证
- `Openclaw Gateway connection authenticated` - Openclaw认证成功
- `Converted Wildfire message to Openclaw` - 消息转换成功
- `Message from sender=xxx is not in whitelist, ignoring` - 白名单过滤
- `Message ignored by whitelist filter` - 白名单拦截
- `Group filter blocked the message` - 群聊策略拦截
- `Successfully sent message to Wildfire` - 发送成功
- `Agent event: runId=` - 流式消息生成中
- `Chat event: state=final` - 流式消息完成

## 故障排查

### 消息无响应

1. **检查白名单配置**
   - 确认`openclaw.whitelist.enabled`设置
   - 验证用户/群组ID是否在白名单中
   - 查看日志中的白名单过滤记录

2. **检查群聊策略**
   - 确认`openclaw.group.enabled`设置
   - 检查是否被@或包含关键词
   - 查看日志中的群聊策略过滤记录

3. **检查Openclaw Gateway**
   - 确认Openclaw Gateway是否运行
   - 检查网络连接（`telnet 127.0.0.1 18789`）
   - 验证token配置

### 群聊不回复

1. 检查群聊策略是否启用
2. 检查是否被@或包含关键词
3. 查看日志中的过滤记录
4. 验证白名单配置

### 野火连接断开

- Adapter会自动重连（SDK内置）
- 检查网关地址配置
- 查看鉴权信息

### 流式消息异常

**现象**：流式消息中断或状态不正确

**处理**：
1. 检查日志中的runId匹配情况
2. 确认Openclaw Gateway的流式事件是否正常
3. 查看agent和chat事件的处理记录

## 许可证

MIT
