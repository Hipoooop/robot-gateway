import { RobotServiceClient } from '@wildfirechat/robot-gateway-client-sdk';
import { OpenclawWebSocketClient } from '../openclaw/OpenclawWebSocketClient.js';
import { MessageConverter } from '../converter/MessageConverter.js';
import { WhitelistFilter } from '../filter/WhitelistFilter.js';
import { GroupFilter } from '../filter/GroupFilter.js';
import { SessionContextManager } from '../session/SessionContextManager.js';

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
        this.sessionContextManager = new SessionContextManager();
        
        // 去重：记录已处理完成的 runId，防止重复发送（在 Bridge 级别持久化，不受客户端重连影响）
        this.completedRunIds = new Map();
        // 定期清理已完成的 runId，防止内存泄漏
        this.completedRunIdsCleanupTimer = null;
        
        // 重连统计（用于日志抑制和断路器）
        this.reconnectStats = {
            totalAttempts: 0,
            lastLogTime: 0,
            consecutiveFailures: 0,
            firstFailureTime: 0,      // 第一次失败时间（用于断路器）
            lastReconnectTime: 0,     // 上次重连时间（用于速率限制）
            circuitOpen: false        // 断路器状态
        };
        
        // 断路器配置
        this.circuitBreaker = {
            failureThreshold: 30,      // 30 次连续失败开启断路器
            timeoutMs: 5 * 60 * 1000,  // 断路器开启 5 分钟
            minIntervalMs: 1000        // 最小重连间隔 1 秒（防止burst）
        };

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
                this.openclawMessageHandler,
                this.sessionContextManager
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

        if (this.completedRunIdsCleanupTimer) {
            clearInterval(this.completedRunIdsCleanupTimer);
            this.completedRunIdsCleanupTimer = null;
        }

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

    /**
     * 启动 completedRunIds 清理定时器
     */
    startCompletedRunIdsCleanup() {
        // 每 10 分钟清理一次，保留 1 小时内的记录
        this.completedRunIdsCleanupTimer = setInterval(() => {
            const now = Date.now();
            const maxAge = 60 * 60 * 1000; // 1 小时
            let cleaned = 0;
            for (const [runId, timestamp] of this.completedRunIds) {
                if (now - timestamp > maxAge) {
                    this.completedRunIds.delete(runId);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                console.debug(`Cleaned up ${cleaned} expired runIds`);
            }
        }, 10 * 60 * 1000); // 10 分钟
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
            this.openclawClient.sendMessageWithSender(openclawMessage, senderId);

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
        // 重置重连统计
        this.reconnectStats.consecutiveFailures = 0;
        this.reconnectStats.totalAttempts = 0;
        
        // 启动清理定时器（如果未启动）
        if (!this.completedRunIdsCleanupTimer) {
            this.startCompletedRunIdsCleanup();
        }
    }

    /**
     * Openclaw 连接断开
     */
    onOpenclawDisconnected(code, reason) {
        // 抑制频繁断开日志：如果正在重连中且 60 秒内已打印过，则使用 debug 级别
        const now = Date.now();
        if (this.isReconnecting && now - this.reconnectStats.lastLogTime < 60000) {
            console.debug(`Disconnected from Openclaw Gateway: code=${code}, reason=${reason}`);
        } else {
            console.warn(`Disconnected from Openclaw Gateway: code=${code}, reason=${reason}`);
        }
        this.reconnectStats.lastLogTime = now;
        
        // 触发重连逻辑
        if (this.running) {
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

        console.log('Received response from Openclaw:', response);
        try {
            const streamId = response.message?.extra?.streamId;
            const state = response.message?.extra?.state;
            
            // 检查是否是 completed 状态的重复消息
            if (state === 'completed' && streamId) {
                if (this.completedRunIds.has(streamId)) {
                    return;
                }
                // 标记为已处理
                this.completedRunIds.set(streamId, Date.now());
            }

            // 1. 转换为野火格式
            const wfMessage = this.messageConverter.convertFromOpenclaw(response);

            if (!wfMessage) {
                console.error('Failed to convert Openclaw response to Wildfire format');
                return;
            }

            // 2. 通过野火SDK发送消息
            const result = await this.wildfireClient.sendMessage(
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
     * 
     * 重连策略：
     * 1. 使用指数退避算法，初始间隔 1 秒，最大间隔 60 秒
     * 2. 断路器保护：连续失败 30 次后暂停 5 分钟
     * 3. 速率限制：最小重连间隔 1 秒，防止 burst
     * 4. 日志抑制：同一重连周期内只打印关键日志
     * 5. 连接成功后重置退避计数
     * 
     * 防并发说明：
     * Node.js 是单线程的，但可能存在以下情况导致多次触发：
     * 1. WebSocket 的 error 和 close 事件可能相继触发
     * 2. 旧连接的事件处理器未及时清理，在创建新连接时旧事件触发
     * 3. 网络延迟导致连接超时的同时收到断开事件
     * 
     * 解决方案：
     * 1. isReconnecting 标志防止重复进入重连循环
     * 2. lastReconnectTime 实现速率限制（1秒内只重连一次）
     * 3. closeConnection() 中清理所有事件处理器
     */
    scheduleOpenclawReconnect() {
        const now = Date.now();
        
        // 速率限制：确保两次重连之间至少间隔 1 秒
        // 这是主要的防 burst 机制
        if (now - this.reconnectStats.lastReconnectTime < this.circuitBreaker.minIntervalMs) {
            console.debug('[Bridge] Reconnect rate limited, skipping');
            return;
        }
        
        // 检查断路器状态
        if (this.reconnectStats.circuitOpen) {
            if (now - this.reconnectStats.firstFailureTime < this.circuitBreaker.timeoutMs) {
                console.debug('[Bridge] Circuit breaker is open, skipping reconnect');
                return;
            }
            // 断路器超时，尝试半开状态
            console.log('[Bridge] Circuit breaker entering half-open state');
            this.reconnectStats.circuitOpen = false;
            this.reconnectStats.consecutiveFailures = 0;
        }
        
        // 检查是否已在重连中
        // 注意：Node.js 是单线程的，这里不需要多线程锁
        // 但同一个事件循环 tick 中可能多次调用此方法
        if (this.isReconnecting) {
            console.debug('[Bridge] Reconnection already in progress');
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectStats.lastReconnectTime = now;
        
        // 在后台执行重连，不阻塞
        this._doReconnect().catch(err => {
            console.error('[Bridge] Unexpected error in reconnection loop:', err);
            this.isReconnecting = false;
        });
    }

    /**
     * 执行重连逻辑（内部方法）
     * 
     * 安全特性：
     * 1. 指数退避：重连间隔从 5 秒开始，最大 60 秒
     * 2. 断路器：连续失败 30 次后暂停 5 分钟
     * 3. 优雅关闭：确保旧连接完全关闭后再创建新连接
     * 4. 连接超时：每个连接最多 15 秒
     */
    async _doReconnect() {
        const baseInterval = this.config.openclaw.gateway.reconnectInterval || 5000;
        const maxInterval = 60000; // 最大间隔 60 秒
        let attemptInThisCycle = 0;
        
        // 记录本次重连周期的开始时间
        const cycleStartTime = Date.now();
        const cycleStartAttempts = this.reconnectStats.totalAttempts;
        
        // 记录第一次失败时间（用于断路器）
        if (this.reconnectStats.consecutiveFailures === 0) {
            this.reconnectStats.firstFailureTime = Date.now();
        }
        
        try {
            while (this.running && !this.isOpenclawConnected()) {
                // 断路器检查
                if (this.reconnectStats.consecutiveFailures >= this.circuitBreaker.failureThreshold) {
                    console.error(`[Bridge] Circuit breaker opened after ${this.reconnectStats.consecutiveFailures} consecutive failures. Pausing for ${this.circuitBreaker.timeoutMs / 1000}s`);
                    this.reconnectStats.circuitOpen = true;
                    this.isReconnecting = false;
                    return;
                }
                
                this.reconnectStats.totalAttempts++;
                this.reconnectStats.consecutiveFailures++;
                attemptInThisCycle++;
                
                // 计算指数退避间隔
                const backoffMultiplier = Math.min(
                    Math.pow(2, Math.max(0, this.reconnectStats.consecutiveFailures - 1)),
                    maxInterval / baseInterval
                );
                const retryInterval = Math.min(baseInterval * backoffMultiplier, maxInterval);
                
                // 日志抑制
                const shouldLog = attemptInThisCycle <= 2 || 
                                  this.reconnectStats.consecutiveFailures % 10 === 0;
                
                if (shouldLog) {
                    console.log(`[Bridge] Reconnecting (total: ${this.reconnectStats.totalAttempts}, consecutive failures: ${this.reconnectStats.consecutiveFailures}, next retry in ${retryInterval}ms)`);
                }

                try {
                    // 优雅关闭旧连接（确保事件处理器被清理）
                    if (this.openclawClient) {
                        console.debug('[Bridge] Closing old connection before reconnect');
                        this.openclawClient.closeConnection();
                        // 等待一小段时间确保连接完全关闭
                        await sleep(100);
                        this.openclawClient = null;
                    }
                    
                    // 创建新的连接
                    this.openclawClient = new OpenclawWebSocketClient(
                        this.config.openclaw,
                        this.openclawMessageHandler
                    );
                    
                    // 使用 Promise.race 实现连接超时
                    const connectTimeout = 15000; // 15 秒连接超时
                    await Promise.race([
                        this.openclawClient.connect(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Connection timeout')), connectTimeout)
                        )
                    ]);

                    // 等待认证完成（最多 5 秒）
                    let waitCount = 0;
                    const maxWait = 50; // 5秒
                    while (!this.openclawClient.isConnected() && waitCount < maxWait) {
                        await sleep(100);
                        waitCount++;
                    }

                    if (this.openclawClient.isConnected()) {
                        const cycleAttempts = this.reconnectStats.totalAttempts - cycleStartAttempts;
                        console.log(`[Bridge] Successfully reconnected after ${cycleAttempts} attempt(s)`);
                        this.reconnectStats.consecutiveFailures = 0;
                        this.reconnectStats.firstFailureTime = 0;
                        this.isReconnecting = false;
                        break;
                    } else {
                        console.debug('[Bridge] Reconnection failed: authentication timeout');
                        // 认证超时，关闭连接
                        this.openclawClient.closeConnection();
                    }

                } catch (error) {
                    const errorMsg = error.message || 'Unknown error';
                    if (shouldLog) {
                        console.error(`[Bridge] Reconnection error:`, errorMsg);
                    }
                    // 出错时确保连接被关闭
                    if (this.openclawClient) {
                        this.openclawClient.closeConnection();
                    }
                }

                // 等待一段时间后重试（指数退避）
                if (this.running && !this.isOpenclawConnected()) {
                    await sleep(retryInterval);
                }
            }

            if (!this.running) {
                console.log('[Bridge] Bridge stopped, exiting reconnection loop');
                this.isReconnecting = false;
            }

        } catch (error) {
            console.error('[Bridge] Unexpected error in reconnection scheduler:', error.message);
            this.isReconnecting = false;
        }
    }
}

/**
 * 睡眠函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
