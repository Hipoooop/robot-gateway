# OpenClaw Wildfire IM 插件

OpenClaw 的野火 IM (Wildfire IM) 频道插件，支持收发消息、流式回复和文件传输。

## 安装

```bash
# 构建并打包
cd openclaw-plugin.js
npm install
npm run build
npm pack

# 安装到 OpenClaw
// for dev
//openclaw plugins install ./openclaw-wildfire-1.0.0.tgz
// for prd
openclaw plugins install @wildfirechat/openclaw-plugin
openclaw restart
```

## 配置

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
      "wildfire": {
          "enabled": true,
          "accounts": {
            "default": {
              "enabled": true,
              "gatewayUrl": "ws://your_gateway_host:8884/robot/gateway",
              "robotId": "your robot id",
              "robotSecret": "your robot secret",
              "requireMention": true,
              "helpKeywords": "帮,请,分析,总结"
            }
          }
      },
  }
}
```

### 配置项说明

| 配置项 | 必填 | 说明 |
|--------|------|------|
| `enabled` | 否 | 是否启用，默认 `true` |
| `gatewayUrl` | 是 | 野火网关 WebSocket 地址 |
| `robotId` | 是 | 机器人 ID |
| `robotSecret` | 是 | 机器人密钥 |
| `requireMention` | 否 | 群聊是否需要@机器人才回复，默认 `true` |
| `helpKeywords` | 否 | 触发回复的关键词，逗号分隔 |

## 特性

- **消息接收**: 支持私聊和群聊消息
- **流式回复**: AI 回复实时更新到同一条消息
- **文件传输**: 支持图片、视频、文件上传和发送
- **群聊过滤**: 支持@提及检测和关键词触发

## 目录结构

```
openclaw-plugin.js/
├── src/
│   ├── channel.ts      # 频道插件主实现
│   ├── clients.ts      # Wildfire 客户端管理
│   ├── config.ts       # 配置类型和验证
│   ├── inbound.ts      # 入站消息处理
│   ├── targets.ts      # 目标 ID 解析
│   └── utils.ts        # 工具函数
├── package.json
├── tsconfig.json
└── README.md
```

## 消息格式

### Target 格式

- 单聊: `user:用户ID` 或 `用户ID`
- 群聊: `group:群组ID`

### Mention 检测

- `mentionedType === 2`: @所有人，始终回复
- `mentionedType === 1`: @部分人，检查 `mentionedTargets`

## 调试

启用详细日志：

```bash
openclaw config set logLevel debug
openclaw restart
```

日志前缀 `[wildfire]` 即为插件输出。

## 依赖

- `@wildfirechat/robot-gateway-client-sdk`: 野火机器人网关客户端
- `@wildfirechat/server-sdk`: 消息内容模型

## License

MIT
