import { readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

/**
 * 配置管理器
 * 配置文件优先级：
 * 1. 命令行 -config 参数指定的文件
 * 2. ~/.wf-openclaw-adapter/config.json
 * 3. 环境变量
 * 4. 默认值
 */
export class Config {
    constructor(configPath = null) {
        this.config = this.loadConfig(configPath);
    }

    /**
     * 加载配置
     */
    loadConfig(configPath) {
        // 默认配置
        const defaultConfig = {
            wildfire: {
                gateway: {
                    url: 'ws://localhost:8884/robot/gateway',
                    robotId: '',
                    robotSecret: ''
                }
            },
            openclaw: {
                gateway: {
                    url: 'ws://127.0.0.1:18789',
                    token: '',
                    scope: 'wildfire-im',
                    reconnectInterval: 5000,
                    heartbeatInterval: 30000
                },
                whitelist: {
                    enabled: true,
                    allowedUsers: [],
                    allowedGroups: []
                },
                group: {
                    enabled: true,
                    allowedIds: [],
                    respondOnMention: true,
                    respondOnQuestion: true,
                    helpKeywords: '帮,请,分析,总结,怎么,如何'
                }
            },
            server: {
                port: 8080
            }
        };

        let fileConfig = {};

        // 确定配置文件路径
        let filePath = configPath;
        
        if (!filePath) {
            // 尝试默认路径
            const defaultPath = join(homedir(), '.wf-openclaw-adapter', 'config.json');
            if (existsSync(defaultPath)) {
                filePath = defaultPath;
            }
        } else {
            // 解析相对路径
            filePath = resolve(filePath);
        }

        // 从文件加载配置
        if (filePath && existsSync(filePath)) {
            try {
                const content = readFileSync(filePath, 'utf-8');
                fileConfig = JSON.parse(content);
                console.log(`Loaded config from: ${filePath}`);
            } catch (error) {
                console.error(`Failed to load config from ${filePath}:`, error.message);
                process.exit(1);
            }
        } else if (configPath) {
            // 用户明确指定了配置文件但文件不存在
            console.error(`Config file not found: ${configPath}`);
            process.exit(1);
        } else {
            console.log('No config file found, using default config and environment variables');
        }

        // 合并配置
        const config = this.mergeDeep(defaultConfig, fileConfig);

        // 从环境变量覆盖配置
        this.applyEnvironmentVariables(config);

        // 验证必要配置
        this.validateConfig(config);

        return config;
    }

    /**
     * 深度合并对象
     */
    mergeDeep(target, source) {
        const output = Object.assign({}, target);
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    /**
     * 应用环境变量
     */
    applyEnvironmentVariables(config) {
        // 野火配置
        if (process.env.WILDFIRE_GATEWAY_URL) {
            config.wildfire.gateway.url = process.env.WILDFIRE_GATEWAY_URL;
        }
        if (process.env.WILDFIRE_ROBOT_ID) {
            config.wildfire.gateway.robotId = process.env.WILDFIRE_ROBOT_ID;
        }
        if (process.env.WILDFIRE_ROBOT_SECRET) {
            config.wildfire.gateway.robotSecret = process.env.WILDFIRE_ROBOT_SECRET;
        }

        // Openclaw配置
        if (process.env.OPENCLAW_GATEWAY_URL) {
            config.openclaw.gateway.url = process.env.OPENCLAW_GATEWAY_URL;
        }
        if (process.env.OPENCLAW_GATEWAY_TOKEN) {
            config.openclaw.gateway.token = process.env.OPENCLAW_GATEWAY_TOKEN;
        }
        if (process.env.OPENCLAW_SCOPE) {
            config.openclaw.gateway.scope = process.env.OPENCLAW_SCOPE;
        }

        // 白名单配置
        if (process.env.OPENCLAW_WHITELIST_ENABLED) {
            config.openclaw.whitelist.enabled = process.env.OPENCLAW_WHITELIST_ENABLED === 'true';
        }
        if (process.env.OPENCLAW_WHITELIST_USERS) {
            config.openclaw.whitelist.allowedUsers = process.env.OPENCLAW_WHITELIST_USERS.split(',');
        }
        if (process.env.OPENCLAW_WHITELIST_GROUPS) {
            config.openclaw.whitelist.allowedGroups = process.env.OPENCLAW_WHITELIST_GROUPS.split(',');
        }

        // 服务器端口
        if (process.env.SERVER_PORT) {
            config.server.port = parseInt(process.env.SERVER_PORT, 10);
        }
    }

    /**
     * 验证配置
     */
    validateConfig(config) {
        const errors = [];

        if (!config.wildfire.gateway.robotId) {
            errors.push('Missing wildfire.gateway.robotId');
        }
        if (!config.wildfire.gateway.robotSecret) {
            errors.push('Missing wildfire.gateway.robotSecret');
        }

        if (errors.length > 0) {
            console.error('Configuration errors:');
            errors.forEach(err => console.error(`  - ${err}`));
            console.error('\nPlease provide config via:');
            console.error('  1. Config file: ~/.wf-openclaw-adapter/config.json or -config <path>');
            console.error('  2. Environment variables: WILDFIRE_ROBOT_ID, WILDFIRE_ROBOT_SECRET');
            process.exit(1);
        }
    }

    /**
     * 获取完整配置
     */
    get() {
        return this.config;
    }

    /**
     * 获取野火配置
     */
    getWildfireConfig() {
        return this.config.wildfire;
    }

    /**
     * 获取 Openclaw 配置
     */
    getOpenclawConfig() {
        return this.config.openclaw;
    }

    /**
     * 获取服务器配置
     */
    getServerConfig() {
        return this.config.server;
    }

    /**
     * 初始化配置目录
     */
    static initConfigDir() {
        const configDir = join(homedir(), '.wf-openclaw-adapter');
        if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true });
            console.log(`Created config directory: ${configDir}`);
        }
        return configDir;
    }
}

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}
