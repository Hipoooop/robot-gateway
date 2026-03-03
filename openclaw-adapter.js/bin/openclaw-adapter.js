#!/usr/bin/env node

/**
 * Openclaw Adapter 启动脚本
 * 
 * 用法:
 *   openclaw-adapter                          # 前台运行，使用默认配置
 *   openclaw-adapter -d|--daemon              # 后台守护进程模式运行
 *   openclaw-adapter start                    # 启动守护进程
 *   openclaw-adapter stop                     # 停止守护进程
 *   openclaw-adapter restart                  # 重启守护进程
 *   openclaw-adapter status                   # 查看守护进程状态
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

import { fileURLToPath } from 'url';
import { dirname, join, resolve, isAbsolute } from 'path';
import { spawn, exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync, closeSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 守护进程相关配置
const DAEMON_DIR = join(homedir(), '.wf-openclaw-adapter');
const PID_FILE = join(DAEMON_DIR, 'openclaw-adapter.pid');
const LOG_FILE = join(DAEMON_DIR, 'openclaw-adapter.log');
const ERROR_LOG_FILE = join(DAEMON_DIR, 'openclaw-adapter.error.log');

// 确保守护进程目录存在
function ensureDaemonDir() {
    if (!existsSync(DAEMON_DIR)) {
        mkdirSync(DAEMON_DIR, { recursive: true });
    }
}

// 根据环境选择导入方式
let Config, OpenclawBridge, HealthServer;

try {
    // 首先尝试从已安装的包导入（生产环境）
    const pkg = await import('@wildfirechat/openclaw-adapter');
    Config = pkg.Config;
    OpenclawBridge = pkg.OpenclawBridge;
    HealthServer = pkg.HealthServer;
} catch {
    // 回退到相对路径（开发环境）
    const configModule = await import(join(__dirname, '../src/config/Config.js'));
    const bridgeModule = await import(join(__dirname, '../src/core/OpenclawBridge.js'));
    const serverModule = await import(join(__dirname, '../src/server/HealthServer.js'));
    Config = configModule.Config;
    OpenclawBridge = bridgeModule.OpenclawBridge;
    HealthServer = serverModule.HealthServer;
}

// 读取 PID 文件（支持新的 JSON 格式和旧的纯数字格式）
function readPidFile() {
    try {
        if (existsSync(PID_FILE)) {
            const content = readFileSync(PID_FILE, 'utf8').trim();
            // 尝试解析 JSON 格式
            try {
                const data = JSON.parse(content);
                return { pid: data.pid, configPath: data.configPath };
            } catch {
                // 兼容旧格式：纯数字 PID
                return { pid: parseInt(content), configPath: null };
            }
        }
    } catch (e) {
        // ignore
    }
    return { pid: null, configPath: null };
}

// 写入 PID 文件
function writePidFile(pid, configPath) {
    ensureDaemonDir();
    const data = JSON.stringify({ pid, configPath }, null, 2);
    writeFileSync(PID_FILE, data);
}

// 删除 PID 文件
function removePidFile() {
    try {
        if (existsSync(PID_FILE)) {
            unlinkSync(PID_FILE);
        }
    } catch (e) {
        // ignore
    }
}

// 检查进程是否运行
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

// 获取守护进程状态
function getDaemonStatus() {
    const { pid, configPath } = readPidFile();
    if (!pid) {
        return { running: false, pid: null, configPath: null };
    }
    if (isProcessRunning(pid)) {
        return { running: true, pid, configPath };
    } else {
        removePidFile();
        return { running: false, pid: null, configPath: null };
    }
}

// 将相对路径转换为绝对路径
function resolveConfigPath(configPath) {
    if (!configPath) {
        return null;
    }
    if (isAbsolute(configPath)) {
        return configPath;
    }
    return resolve(process.cwd(), configPath);
}

// 启动守护进程
function startDaemon(configPath) {
    const status = getDaemonStatus();
    if (status.running) {
        console.log(`Daemon is already running (PID: ${status.pid})`);
        return;
    }

    ensureDaemonDir();

    // 将相对路径转换为绝对路径
    const absoluteConfigPath = resolveConfigPath(configPath);

    const args = [__filename, '--child'];
    if (absoluteConfigPath) {
        args.push('-config', absoluteConfigPath);
    }

    const out = openSync(LOG_FILE, 'a');
    const err = openSync(ERROR_LOG_FILE, 'a');

    const child = spawn(process.execPath, args, {
        detached: true,
        stdio: ['ignore', out, err]
    });

    closeSync(out);
    closeSync(err);

    writePidFile(child.pid, absoluteConfigPath);
    child.unref();

    console.log(`Daemon started (PID: ${child.pid})`);
    if (absoluteConfigPath) {
        console.log(`Config file: ${absoluteConfigPath}`);
    }
    console.log(`Log file: ${LOG_FILE}`);
}

// 停止守护进程
function stopDaemon() {
    const status = getDaemonStatus();
    if (!status.running) {
        console.log('Daemon is not running');
        return;
    }

    try {
        process.kill(status.pid, 'SIGTERM');
        // 等待进程结束
        let attempts = 0;
        const maxAttempts = 10;
        const interval = setInterval(() => {
            if (!isProcessRunning(status.pid) || attempts >= maxAttempts) {
                clearInterval(interval);
                if (!isProcessRunning(status.pid)) {
                    removePidFile();
                    console.log(`Daemon stopped (PID: ${status.pid})`);
                } else {
                    console.log(`Daemon did not stop gracefully, sending SIGKILL...`);
                    try {
                        process.kill(status.pid, 'SIGKILL');
                        removePidFile();
                        console.log(`Daemon killed (PID: ${status.pid})`);
                    } catch (e) {
                        console.error('Failed to kill daemon:', e.message);
                    }
                }
            }
            attempts++;
        }, 500);
    } catch (e) {
        console.error('Failed to stop daemon:', e.message);
        removePidFile();
    }
}

// 重启守护进程
function restartDaemon(configPath) {
    stopDaemon();
    // 等待一小会儿确保进程已停止
    setTimeout(() => {
        startDaemon(configPath);
    }, 1000);
}

// 查看守护进程状态
function showDaemonStatus() {
    const status = getDaemonStatus();
    if (status.running) {
        console.log(`Daemon is running (PID: ${status.pid})`);
        if (status.configPath) {
            console.log(`Config file: ${status.configPath}`);
        } else {
            console.log(`Config file: ${join(DAEMON_DIR, 'config.json')} (default)`);
        }
        console.log(`Log file: ${LOG_FILE}`);
        console.log(`Error log: ${ERROR_LOG_FILE}`);
    } else {
        console.log('Daemon is not running');
    }
}

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    // 检查是否是子进程模式（内部使用）
    if (args.includes('--child')) {
        options.isChild = true;
        // 继续解析其他参数，不要直接返回
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === 'start') {
            options.command = 'start';
        } else if (arg === 'stop') {
            options.command = 'stop';
        } else if (arg === 'restart') {
            options.command = 'restart';
        } else if (arg === 'status') {
            options.command = 'status';
        } else if (arg === '-d' || arg === '--daemon') {
            options.daemon = true;
        } else if (arg === '-config' || arg === '--config') {
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
  openclaw-adapter [命令] [选项]

命令:
  start             启动守护进程
  stop              停止守护进程
  restart           重启守护进程
  status            查看守护进程状态

选项:
  -d, --daemon      以后台守护进程模式运行
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
  # 前台运行（默认）
  openclaw-adapter

  # 后台守护进程模式运行
  openclaw-adapter -d
  openclaw-adapter start

  # 管理守护进程
  openclaw-adapter status
  openclaw-adapter stop
  openclaw-adapter restart

  # 使用指定配置
  openclaw-adapter -config ./my-config.json
  openclaw-adapter start -config ./my-config.json

  # 使用环境变量
  WILDFIRE_ROBOT_ID=mybot WILDFIRE_ROBOT_SECRET=secret openclaw-adapter
`);
}

// 显示版本
function showVersion() {
    console.log('Openclaw Adapter v1.0.2');
}

// 主函数
async function main() {
    const options = parseArgs();

    // 处理守护进程命令
    if (options.command === 'start') {
        startDaemon(options.configPath);
        return;
    }
    if (options.command === 'stop') {
        stopDaemon();
        return;
    }
    if (options.command === 'restart') {
        restartDaemon(options.configPath);
        return;
    }
    if (options.command === 'status') {
        showDaemonStatus();
        return;
    }

    // 如果是子进程模式（守护进程内部），不需要显示横幅
    if (!options.isChild) {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║        Openclaw Adapter - 野火IM/Openclaw桥接器         ║');
        console.log('║                     Version 1.0.2                      ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log();
    }

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

    // 如果是子进程模式，写入 PID 文件
    if (options.isChild) {
        writePidFile(process.pid, options.configPath || null);
    }

    // 保持运行
    if (!options.isChild) {
        console.log('\nAdapter is running. Press Ctrl+C to stop.');
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
