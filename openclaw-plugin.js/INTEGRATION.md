# OpenClaw Wildfire Channel 集成指南

## 概述

这是一个标准的 OpenClaw Channel 实现，让 OpenClaw 原生支持野火IM，就像支持 Telegram、飞书一样。

## 集成方式

### 方式1：作为官方 Channel 集成到 OpenClaw 核心

如果 OpenClaw 官方接受这个 Channel，可以直接合并到 OpenClaw 核心代码库。

**目录结构**:
```
openclaw/
├── src/
│   └── channels/
│       ├── telegram/
│       ├── feishu/
│       └── wildfire/          # 新增
│           ├── index.ts
│           ├── WildfireChannel.ts
│           └── README.md
```

### 方式2：作为独立 npm 包安装

```bash
npm install @openclaw/channel-wildfire
```

然后在 OpenClaw 配置中启用：

```typescript
// openclaw.config.ts
import { WildfireChannel } from '@openclaw/channel-wildfire';

export default {
  channels: {
    wildfire: {
      enabled: true,
      implementation: WildfireChannel,
      config: {
        gateway: {
          url: 'ws://localhost:8884/robot/gateway',
          robotId: 'your-robot-id',
          robotSecret: 'your-robot-secret'
        },
        group: {
          enabled: true,
          respondOnMention: true,
          respondOnQuestion: true,
          helpKeywords: '帮,请,分析,总结,怎么,如何'
        }
      }
    }
  }
};
```

### 方式3：动态注册（运行时）

```typescript
import { OpenClaw } from '@openclaw/core';
import { WildfireChannel } from '@openclaw/channel-wildfire';

const openclaw = new OpenClaw();

// 创建并配置 Channel
const wildfireChannel = new WildfireChannel();

// 注册到 OpenClaw
await openclaw.registerChannel('wildfire', wildfireChannel, {
  gateway: {
    url: 'ws://localhost:8884/robot/gateway',
    robotId: 'your-robot-id',
    robotSecret: 'your-robot-secret'
  }
});

// 启动 OpenClaw
await openclaw.start();
```

## OpenClaw 需要提供的接口

为了让这个 Channel 正常工作，OpenClaw 需要提供以下标准接口：

### Channel 接口

```typescript
interface Channel {
  name: string;
  initialize(config: any): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => void): void;
}

interface IncomingMessage {
  id: string;
  user: { id: string; name?: string };
  conversation: { id: string; type: 'PRIVATE' | 'GROUP' };
  message: {
    type: 'text' | 'image' | 'video' | 'file' | 'audio';
    text?: string;
    mediaUrl?: string;
    fileName?: string;
    fileSize?: number;
  };
  timestamp: number;
  raw: any;
}

interface OutgoingMessage {
  conversationId: string;
  conversationType: 'PRIVATE' | 'GROUP';
  message: {
    type: 'text' | 'image' | 'video' | 'file';
    content: string;
    mediaUrl?: string;
    fileName?: string;
  };
}
```

### OpenClaw 核心接口

```typescript
interface OpenClawCore {
  // 注册 Channel
  registerChannel(name: string, channel: Channel, config?: any): Promise<void>;
  
  // 启动
  start(): Promise<void>;
  
  // 停止
  stop(): Promise<void>;
}
```

## 消息流转

### 接收消息（野火 → OpenClaw）

```
野火用户发送消息
    ↓
野火网关 (WebSocket)
    ↓
WildfireChannel.handleWildfireMessage()
    ↓
格式转换为 IncomingMessage
    ↓
调用 this.messageHandler(message) → 传递给 OpenClaw Core
    ↓
OpenClaw Core 分发给 Agent 处理
```

### 发送消息（OpenClaw → 野火）

```
Agent 生成回复
    ↓
OpenClaw Core 调用 channel.sendMessage()
    ↓
WildfireChannel 转换为野火消息格式
    ↓
调用野火 SDK 发送
    ↓
野火用户收到消息
```

## 配置说明

### 基础配置

```yaml
channels:
  wildfire:
    enabled: true
    gateway:
      url: ws://localhost:8884/robot/gateway
      robotId: your-robot-id
      robotSecret: your-robot-secret
```

### 群聊策略配置

```yaml
channels:
  wildfire:
    enabled: true
    gateway:
      url: ws://localhost:8884/robot/gateway
      robotId: your-robot-id
      robotSecret: your-robot-secret
    group:
      enabled: true                    # 是否启用群聊
      respondOnMention: true           # 被@时回复
      respondOnQuestion: true          # 问号结尾时回复
      helpKeywords: "帮,请,分析"       # 包含这些关键词时回复
      allowedIds: []                   # 白名单群组ID
```

## 测试

### 单元测试

```bash
npm test
```

### 集成测试

```typescript
// test/integration.spec.ts
import { OpenClaw } from '@openclaw/core';
import { WildfireChannel } from '@openclaw/channel-wildfire';

describe('Wildfire Channel Integration', () => {
  it('should receive and send messages', async () => {
    const openclaw = new OpenClaw();
    const channel = new WildfireChannel();
    
    await openclaw.registerChannel('wildfire', channel, {
      gateway: { url: 'ws://localhost:8884', robotId: 'test', robotSecret: 'test' }
    });
    
    // 模拟收到消息
    const receivedMessages: any[] = [];
    channel.onMessage((msg) => receivedMessages.push(msg));
    
    // 验证消息格式
    expect(receivedMessages[0]).toHaveProperty('user.id');
    expect(receivedMessages[0]).toHaveProperty('conversation.id');
  });
});
```

## 部署

### 单机部署

```bash
# 1. 安装依赖
npm install

# 2. 编译
npm run build

# 3. 在 OpenClaw 项目中引入
npm link @openclaw/channel-wildfire
```

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# 假设 OpenClaw 项目结构
COPY --from=openclaw:latest /app/openclaw /app/openclaw

EXPOSE 18080

CMD ["node", "dist/index.js"]
```

## 贡献

如果你发现 bug 或有新功能建议，欢迎提交 Issue 或 PR。

## License

MIT
