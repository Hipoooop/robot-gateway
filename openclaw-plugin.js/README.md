# @openclaw/wildfire

Wildfire IM channel plugin for OpenClaw Gateway.

## Overview

This plugin integrates Wildfire IM into OpenClaw Gateway using `@wildfirechat/robot-gateway-client-sdk`.

## Installation

```bash
openclaw plugins install @openclaw/wildfire
```

## Configuration

Add to your OpenClaw config:

```yaml
plugins:
  wildfire:
    enabled: true
    gatewayUrl: ws://localhost:8884/robot/gateway
    robotId: your-robot-id
    robotSecret: your-robot-secret
    requireMention: true
    helpKeywords: "帮,请,分析,总结"
```

### Multi-Account Configuration

```yaml
plugins:
  wildfire:
    enabled: true
    accounts:
      main:
        enabled: true
        gatewayUrl: ws://localhost:8884/robot/gateway
        robotId: robot1
        robotSecret: secret1
      secondary:
        enabled: true
        gatewayUrl: ws://other-gateway:8884/robot/gateway
        robotId: robot2
        robotSecret: secret2
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Pack for testing
npm pack
```

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Wildfire  │ ◄──────────────► │  OpenClaw       │
│   IM        │                   │   Plugin        │
└─────────────┘                   └─────────────────┘
                                         │
                                         ▼
                                   ┌─────────────┐
                                   │  OpenClaw   │
                                   │  Gateway    │
                                   └─────────────┘
```

The plugin registers:
- A channel for sending/receiving messages
- A service for managing WebSocket connections

## License

MIT
