import { RobotServiceClient } from '@wildfirechat/robot-gateway-client-sdk';
import { OpenclawWebSocketClient } from '../openclaw/OpenclawWebSocketClient.js';
import { MessageConverter } from '../converter/MessageConverter.js';
import { WhitelistFilter } from '../filter/WhitelistFilter.js';
import { GroupFilter } from '../filter/GroupFilter.js';

/**
 * Openclaw 桥接器
 * 负责野火IM与Openclaw Gateway之间的双向消息转发
 */
export class OpenclawBridge {
    constructor(config) {
        this.config = config;
        this.wildfireClient = null;
        this.openclawClient = null;
        this.running = false;
        this.isReconnecting = false;

        // 组件
        this.messageConverter = new MessageConverter();
        this.whitelistFilter = new WhitelistFilter(config.openclaw);
        this.groupFilter = new GroupFilter(config.openclaw);

        // 消息处理器（实现 MessageHandler 接口）
        this.messageHandler = {
            onMessage: this.onWildfireMessage.bind(this),
            onConnectionChanged: this.onWildfireConnectionChanged.bind(this),
            onError: this.onWildfireError.bind(this)
        };

        // Openclaw 消息处理器
        this.openclawMessageHandler = {
            onConnected: this.onOpenclawConnected.bind(this),
            onDisconnected: this.onOpenclawDisconnected.bind(this),
            onResponse: this.onOpenclawResponse.bind(this),
            onTyping: this.onOpenclawTyping.bind(this),
            onError: this.onOpenclawError.bind(this)
        };
    }

    /**
     * 启动桥接器
     */
    async start() {
        if (this.running) {
            console.warn('Bridge already running');
            return;
        }

        this.running = true;

        try {
            // 1. 创建并连接到野火网关
            console.log(`Connecting to Wildfire Gateway: ${this.config.wildfire.gateway.url}`);
            this.wildfireClient = new RobotServiceClient(
                this.config.wildfire.gateway.url,
                this.messageHandler
            );

            const connected = await this.wildfireClient.connect(
                this.config.wildfire.gateway.robotId,
                this.config.wildfire.gateway.robotSecret
            );

            if (!connected) {
                console.error('Failed to connect to Wildfire Gateway, exiting...');
                await this.stop();
                process.exit(1);
            }

            console.log(`Connected to Wildfire Gateway as robot: ${this.config.wildfire.gateway.robotId}`);

            // 2. 连接到 Openclaw Gateway
            console.log(`Connecting to Openclaw Gateway: ${this.config.openclaw.gateway.url}`);
            this.openclawClient = new OpenclawWebSocketClient(
                this.config.openclaw,
                this.openclawMessageHandler
            );

            await this.openclawClient.connect();

            // 等待认证完成
            let waitCount = 0;
            const maxWait = 100; // 10秒
            while (!this.openclawClient.isConnected() && waitCount < maxWait) {
                await sleep(100);
                waitCount++;
            }

            if (!this.openclawClient.isConnected()) {
                console.error('Failed to authenticate with Openclaw Gateway within timeout, exiting...');
                await this.stop();
                process.exit(1);
            }

            console.log('Openclaw Bridge started successfully');

        } catch (error) {
            console.error('Failed to start bridge:', error.message);
            await this.stop();
            process.exit(1);
        }
    }

    /**
     * 停止桥接器
     */
    async stop() {
        this.running = false;

        if (this.wildfireClient) {
            this.wildfireClient.close();
            this.wildfireClient = null;
        }

        if (this.openclawClient) {
            this.openclawClient.closeConnection();
            this.openclawClient = null;
        }

        console.log('Openclaw Bridge stopped');
    }

    // ==================== Wildfire Message Handler ====================

    /**
     * 收到野火消息
     */
    onWildfireMessage(message) {
        if (!this.running) {
            console.warn('Bridge is not running, ignoring message');
            return;
        }

        // 过滤不支持的消息类型
        const payloadType = message.data?.payload?.type;
        if (payloadType <= 0 || (payloadType > 15 && payloadType < 100) || payloadType > 200) {
            console.log(`Ignore message type ${payloadType}`);
            return;
        }

        try {
            console.log(`Received message from Wildfire: sender=${message.data?.sender}, type=${message.data?.conv?.type}`);

            // 0. 白名单过滤
            const senderId = message.data?.sender;
            const targetId = message.data?.conv?.target;
            const isGroup = message.data?.conv?.type === 1 || message.data?.conv?.type === 2;

            if (!this.whitelistFilter.shouldProcess(senderId, targetId, isGroup)) {
                console.log(`Message ignored by whitelist filter: sender=${senderId}, target=${targetId}, isGroup=${isGroup}`);
                return;
            }

            // 1. 转换为 Openclaw 格式
            const openclawMessage = this.messageConverter.convertToOpenclaw(message);
            if (!openclawMessage) {
                console.debug('Failed to convert message, skipping');
                return;
            }

            // 2. 群聊过滤
            if (!this.groupFilter.shouldRespond(openclawMessage, this.config.wildfire.gateway.robotId)) {
                console.debug('Group filter blocked the message');
                return;
            }

            // 3. 发送到 Openclaw Gateway
            if (!senderId || !senderId.trim()) {
                console.warn('Sender ID is null or empty, skipping message');
                return;
            }
            this.openclawClient.sendMessage(openclawMessage, senderId);

        } catch (error) {
            console.error('Error processing Wildfire message:', error.message);
        }
    }

    /**
     * 野火连接状态变化
     */
    onWildfireConnectionChanged(connected) {
        console.log(`Wildfire connection changed: ${connected}`);
        if (!connected) {
            console.warn('Wildfire connection lost, SDK will auto-reconnect');
        } else {
            console.log('Wildfire connection re-established');
        }
    }

    /**
     * 野火错误
     */
    onWildfireError(error) {
        console.error('Wildfire error:', error);
    }

    // ==================== Openclaw Message Handler ====================

    /**
     * Openclaw 连接成功
     */
    onOpenclawConnected() {
        console.log('Connected to Openclaw Gateway');
    }

    /**
     * Openclaw 连接断开
     */
    onOpenclawDisconnected(code, reason) {
        console.warn(`Disconnected from Openclaw Gateway: code=${code}, reason=${reason}`);
        // 触发重连逻辑
        if (this.running) {
            console.log('Attempting to reconnect to Openclaw Gateway...');
            this.scheduleOpenclawReconnect();
        }
    }

    /**
     * 收到 Openclaw 响应
     */
    async onOpenclawResponse(response) {
        if (!this.running) {
            console.warn('Bridge is not running, ignoring response');
            return;
        }

        try {
            console.log(`Received response from Openclaw: text=${response.message?.text ? response.message.text.substring(0, 50) : 'null'}...`);

            // 1. 转换为野火格式
            const wfMessage = this.messageConverter.convertFromOpenclaw(response);

            if (!wfMessage) {
                console.error('Failed to convert Openclaw response to Wildfire format');
                return;
            }

            // 2. 通过野火SDK发送消息
            const result = await this.wildfireClient.sendMessage(
                this.config.wildfire.gateway.robotId,
                wfMessage.conversation,
                wfMessage.payload
            );

            if (result.isSuccess()) {
                console.log(`Successfully sent message to Wildfire: target=${wfMessage.targetUserId}`);
            } else {
                console.error(`Failed to send message to Wildfire: code=${result.getCode()}, msg=${result.getMsg()}`);
            }

        } catch (error) {
            console.error('Error processing Openclaw response:', error.message);
        }
    }

    /**
     * Openclaw 正在输入
     */
    onOpenclawTyping(typing) {
        console.debug('Openclaw is typing...');
    }

    /**
     * Openclaw 错误
     */
    onOpenclawError(error) {
        console.error('Openclaw error:', error);
    }

    // ==================== Public Methods ====================

    /**
     * 获取运行状态
     */
    isRunning() {
        return this.running;
    }

    /**
     * 获取野火连接状态
     */
    isWildfireConnected() {
        return this.wildfireClient && this.wildfireClient.isConnected();
    }

    /**
     * 获取 Openclaw 连接状态
     */
    isOpenclawConnected() {
        return this.openclawClient && this.openclawClient.isConnected();
    }

    /**
     * 获取状态信息
     */
    getStatus() {
        return {
            wildfire: {
                connected: this.isWildfireConnected(),
                status: this.isWildfireConnected() ? 'UP' : 'DOWN'
            },
            openclaw: {
                connected: this.isOpenclawConnected(),
                status: this.isOpenclawConnected() ? 'UP' : 'DOWN'
            },
            bridge: this.running ? 'RUNNING' : 'STOPPED'
        };
    }

    // ==================== Private Methods ====================

    /**
     * 调度 Openclaw 重连
     */
    scheduleOpenclawReconnect() {
        if (this.isReconnecting) {
            console.debug('Already reconnecting to Openclaw, skipping');
            return;
        }

        this.isReconnecting = true;

        setTimeout(async () => {
            try {
                let retryCount = 0;
                const maxRetries = 10;
                const retryInterval = this.config.openclaw.gateway.reconnectInterval;

                while (this.running && retryCount < maxRetries && !this.isOpenclawConnected()) {
                    retryCount++;
                    console.log(`Reconnecting to Openclaw Gateway (attempt ${retryCount}/${maxRetries}): ${this.config.openclaw.gateway.url}`);

                    try {
                        // 创建新的连接
                        this.openclawClient = new OpenclawWebSocketClient(
                            this.config.openclaw,
                            this.openclawMessageHandler
                        );
                        await this.openclawClient.connect();

                        // 等待认证完成
                        let waitCount = 0;
                        const maxWait = 50; // 5秒
                        while (!this.openclawClient.isConnected() && waitCount < maxWait) {
                            await sleep(100);
                            waitCount++;
                        }

                        if (this.openclawClient.isConnected()) {
                            console.log('Successfully reconnected to Openclaw Gateway');
                            break;
                        } else {
                            console.warn(`Openclaw Gateway reconnection attempt ${retryCount} failed`);
                        }

                    } catch (error) {
                        console.error(`Error reconnecting to Openclaw Gateway (attempt ${retryCount}):`, error.message);
                    }

                    // 等待一段时间后重试
                    if (retryCount < maxRetries && !this.isOpenclawConnected()) {
                        await sleep(retryInterval);
                    }
                }

                if (!this.isOpenclawConnected()) {
                    console.error(`Failed to reconnect to Openclaw Gateway after ${maxRetries} attempts`);
                }

            } catch (error) {
                console.error('Error in Openclaw reconnection scheduler:', error.message);
            } finally {
                this.isReconnecting = false;
            }
        }, 0);
    }
}

/**
 * 睡眠函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
