#!/usr/bin/env node

/**
 * 安装后设置脚本
 * 创建默认配置目录和示例配置文件
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.wf-openclaw-adapter');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const EXAMPLE_FILE = join(CONFIG_DIR, 'config.example.json');

const EXAMPLE_CONFIG = {
  "wildfire": {
    "gateway": {
      "url": "ws://localhost:8884/robot/gateway",
      "robotId": "",
      "robotSecret": ""
    }
  },
  "openclaw": {
    "gateway": {
      "url": "ws://127.0.0.1:18789",
      "token": "",
      "scope": "wildfire-im",
      "reconnectInterval": 5000,
      "heartbeatInterval": 30000
    },
    "whitelist": {
      "enabled": true,
      "allowedUsers": [],
      "allowedGroups": []
    },
    "group": {
      "enabled": true,
      "respondOnMention": true,
      "respondOnQuestion": true,
      "helpKeywords": "帮,请,分析,总结,怎么,如何",
      "allowedIds": []
    }
  },
  "server": {
    "port": 8080
  }
};

function setup() {
  try {
    // 创建配置目录
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      console.log(`Created config directory: ${CONFIG_DIR}`);
    }

    // 创建示例配置文件
    if (!existsSync(EXAMPLE_FILE)) {
      writeFileSync(EXAMPLE_FILE, JSON.stringify(EXAMPLE_CONFIG, null, 2), 'utf-8');
    }

    // 如果配置文件不存在，提示用户创建
    if (!existsSync(CONFIG_FILE)) {
      console.log('\n========================================');
      console.log('  Openclaw Adapter 安装完成');
      console.log('========================================');
      console.log(`\n配置文件目录: ${CONFIG_DIR}`);
      console.log('\n请编辑配置文件: ~/.wf-openclaw-adapter/config.json');
      console.log('\n示例配置已创建: ~/.wf-openclaw-adapter/config.example.json');
      console.log('\n或者通过环境变量配置:');
      console.log('  - WILDFIRE_ROBOT_ID');
      console.log('  - WILDFIRE_ROBOT_SECRET');
      console.log('  - OPENCLAW_GATEWAY_TOKEN');
      console.log('\n启动命令: openclaw-adapter');
      console.log('========================================\n');
    }
  } catch (error) {
    console.error('Setup error:', error.message);
  }
}

setup();
