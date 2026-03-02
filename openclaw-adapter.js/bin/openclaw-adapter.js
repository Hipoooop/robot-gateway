#!/usr/bin/env node

/**
 * Openclaw Adapter 启动脚本
 * 
 * 用法:
 *   openclaw-adapter                          # 使用默认配置路径 ~/.wf-openclaw-adapter/config.json
 *   openclaw-adapter -config <path>           # 使用指定的配置文件
 * 
 * 环境变量:
 *   WILDFIRE_GATEWAY_URL       - 野火网关地址
 *   WILDFIRE_ROBOT_ID          - 机器人ID
 *   WILDFIRE_ROBOT_SECRET      - 机器人密钥
 *   OPENCLAW_GATEWAY_URL       - Openclaw网关地址
 *   OPENCLAW_GATEWAY_TOKEN     - Openclaw认证令牌
 *   SERVER_PORT                - HTTP健康检查端口
 */

import { Config } from '../src/config/Config.js';
import { OpenclawBridge } from '../src/core/OpenclawBridge.js';
import { HealthServer } from '../src/server/HealthServer.js';

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-config' || arg === '--config') {
            options.configPath = args[i + 1];
            i++;
        } else if (arg === '-h' || arg === '--help') {
            showHelp();
            process.exit(0);
        } else if (arg === '-v' || arg === '--version') {
            showVersion();
            process.exit(0);
        }
    }

    return options;
}

// 显示帮助
function showHelp() {
    console.log(`
Openclaw Adapter - 野火IM与Openclaw Gateway的桥接适配器

用法:
  openclaw-adapter [选项]

选项:
  -config <path>    指定配置文件路径
  -h, --help        显示帮助信息
  -v, --version     显示版本信息

配置文件:
  默认配置文件路径: ~/.wf-openclaw-adapter/config.json
  
  示例配置:
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
        "reconnectInterval": 5000,
        "heartbeatInterval": 30000
      },
      "whitelist": {
        "enabled": true,
        "allowedUsers": ["user1"],
        "allowedGroups": ["group1"]
      },
      "group": {
        "enabled": true,
        "respondOnMention": true,
        "respondOnQuestion": true,
        "helpKeywords": "帮,请,分析,总结,怎么,如何",
        "allowedIds": ["group1"]
      }
    },
    "server": {
      "port": 8080
    }
  }

环境变量:
  WILDFIRE_GATEWAY_URL       - 野火网关地址
  WILDFIRE_ROBOT_ID          - 机器人ID
  WILDFIRE_ROBOT_SECRET      - 机器人密钥
  OPENCLAW_GATEWAY_URL       - Openclaw网关地址
  OPENCLAW_GATEWAY_TOKEN     - Openclaw认证令牌
  SERVER_PORT                - HTTP健康检查端口

健康检查接口:
  GET /health          - 健康检查
  GET /status          - 详细状态
  GET /test            - 测试接口

示例:
  # 使用默认配置
  openclaw-adapter

  # 使用指定配置
  openclaw-adapter -config ./my-config.json

  # 使用环境变量
  WILDFIRE_ROBOT_ID=mybot WILDFIRE_ROBOT_SECRET=secret openclaw-adapter
`);
}

// 显示版本
function showVersion() {
    console.log('Openclaw Adapter v1.0.0');
}

// 主函数
async function main() {
    const options = parseArgs();

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║        Openclaw Adapter - 野火IM/Openclaw桥接器         ║');
    console.log('║                     Version 1.0.0                      ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log();

    // 加载配置
    let config;
    try {
        config = new Config(options.configPath).get();
    } catch (error) {
        console.error('Failed to load config:', error.message);
        process.exit(1);
    }

    // 创建桥接器
    const bridge = new OpenclawBridge(config);

    // 创建健康检查服务器
    const healthServer = new HealthServer(config.server.port, bridge);

    // 启动健康检查服务器
    try {
        await healthServer.start();
    } catch (error) {
        console.error('Failed to start health server:', error.message);
        process.exit(1);
    }

    // 启动桥接器
    await bridge.start();

    // 处理退出信号
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down...');
        await bridge.stop();
        await healthServer.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down...');
        await bridge.stop();
        await healthServer.stop();
        process.exit(0);
    });

    // 保持运行
    console.log('\nAdapter is running. Press Ctrl+C to stop.');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
