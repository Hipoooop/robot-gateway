# OpenClaw Wildfire Channel - 快速启动

## 前提条件

1. OpenClaw 已安装并运行
2. 野火IM服务器已部署
3. 已创建野火机器人账号

## 5分钟快速集成

### 1. 安装 Channel

```bash
# 在 OpenClaw 项目中安装
npm install @openclaw/channel-wildfire

# 或本地链接（开发模式）
cd openclaw-channel-wildfire
npm link
cd /path/to/openclaw
npm link @openclaw/channel-wildfire
```

### 2. 配置 OpenClaw

```typescript
// openclaw.config.ts
import { defineConfig } from '@openclaw/core';
import { WildfireChannel } from '@openclaw/channel-wildfire';

export default defineConfig({
  channels: {
    wildfire: {
      enabled: true,
      implementation: WildfireChannel,
      config: {
        gateway: {
          url: 'ws://localhost:8884/robot/gateway',
          robotId: process.env.WILDFIRE_ROBOT_ID!,
          robotSecret: process.env.WILDFIRE_ROBOT_SECRET!
        },
        group: {
          enabled: true,
          respondOnMention: true,
          respondOnQuestion: true,
          helpKeywords: '帮,请,分析,总结'
        }
      }
    }
  },
  
  agents: {
    'smart-assistant': {
      name: '智能助手',
      description: '基于 OpenClaw 的智能助手',
      channels: ['wildfire'],  // 绑定到野火 Channel
      model: 'gpt-4',
      systemPrompt: '你是一个 helpful 的 AI 助手。'
    }
  }
});
```

### 3. 启动服务

```bash
# 设置环境变量
export WILDFIRE_ROBOT_ID=your-robot-id
export WILDFIRE_ROBOT_SECRET=your-robot-secret

# 启动 OpenClaw
npm run dev
```

### 4. 测试

在野火IM中：
1. 添加机器人为好友
2. 发送消息 "你好"
3. 应该收到机器人的回复

## 常见问题

### Q: 连接失败
检查野火网关地址和机器人凭证是否正确。

### Q: 收不到消息
检查群聊策略配置，如果是群聊需要被@或包含关键词。

### Q: 如何支持文件发送
确保 OpenClaw Agent 返回的文件 URL 是公网可访问的。

## 开发调试

```bash
# 编译
npm run build

# 调试模式
npm run dev

# 日志级别
DEBUG=wildfire-channel npm run dev
```
