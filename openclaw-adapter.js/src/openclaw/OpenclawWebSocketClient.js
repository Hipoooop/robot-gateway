import WebSocket from 'ws';
import {
    RequestMessage,
    ConnectParams,
    ChatSendParams,
    Attachment
} from './protocol/OpenclawProtocol.js';
import { SessionContextManager } from '../session/SessionContextManager.js';

const MESSAGE_CONTEXT_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时

// 类级别的静态变量，与 Java 版本的 static ConcurrentHashMap 对齐
// 用于在多个客户端实例之间共享消息上下文
const messageContexts = new Map();

/**
 * Openclaw Gateway WebSocket 客户端
 * 负责与 Openclaw Gateway 的 WebSocket 通信
 */
export class OpenclawWebSocketClient {
    constructor(config, messageHandler, sessionContextManager = null) {
        this.config = config;
        this.messageHandler = messageHandler;
        this.sessionContextManager = sessionContextManager;
        
        this.ws = null;
        this.isAuthenticated = false;
        this.lastHeartbeatTime = 0;
        this.pendingRequests = new Map();
        this.heartbeatTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // 连接状态追踪
        this._connectionStartTime = 0;
        this._connectTimeout = null;
        this._connectResolve = null;
        this._connectReject = null;
        
        // 绑定方法
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    /**
     * 连接到 Openclaw Gateway
     */
    async connect() {
        // 如果已有连接，先关闭
        if (this.ws) {
            this.closeConnection();
        }
        
        return new Promise((resolve, reject) => {
            try {
                console.log(`[Openclaw] Connecting to: ${this.config.gateway.url}`);
                
                this.ws = new WebSocket(this.config.gateway.url);
                this._connectionStartTime = Date.now();
                this._connectResolve = resolve;
                this._connectReject = reject;

                this.ws.on('open', () => {
                    console.debug('[Openclaw] WebSocket opened, waiting for authentication challenge...');
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data.toString(), resolve, reject);
                });

                this.ws.on('close', (code, reason) => {
                    this.handleClose(code, reason);
                });
                
                this.ws.on('error', (error) => {
                    this.handleError(error);
                });

                // 设置连接超时（10秒）
                this._connectTimeout = setTimeout(() => {
                    if (!this.isAuthenticated) {
                        console.warn('[Openclaw] Connection timeout (10s), closing socket');
                        this.closeConnection();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 处理收到的消息
     */
    handleMessage(messageStr, resolveConnect, rejectConnect) {
        try {
            const json = JSON.parse(messageStr);
            const msgType = json.type;

            if (msgType === 'event') {
                this.handleEvent(json, resolveConnect, rejectConnect);
            } else if (msgType === 'res') {
                this.handleResponse(json);
            } else {
                // 其他类型（如AI响应）
                const inMessage = {
                    type: json.type,
                    channel: json.channel,
                    message: json.message,
                    meta: json.meta,
                    error: json.error
                };
                this.handleOpenclawMessage(inMessage);
            }
        } catch (error) {
            console.error('Failed to parse message from Openclaw:', error.message);
        }
    }

    /**
     * 处理事件消息
     */
    handleEvent(json, resolveConnect, rejectConnect) {
        const eventType = json.event;

        switch (eventType) {
            case 'connect.challenge':
                this.handleChallenge(resolveConnect, rejectConnect);
                break;
            case 'agent':
                this.handleAgentEvent(json);
                break;
            case 'chat':
                this.handleChatEvent(json);
                break;
            case 'health':
            case 'tick':
                // 系统事件，忽略
                break;
            default:
                console.debug('Unhandled event type:', eventType);
        }
    }

    /**
     * 处理连接挑战
     */
    handleChallenge(resolveConnect, rejectConnect) {
        this.sendConnectRequest(resolveConnect, rejectConnect);
    }

    /**
     * 发送 connect 请求
     */
    sendConnectRequest(resolveConnect, rejectConnect) {
        const requestId = generateUUID();
        const params = new ConnectParams();
        
        // 设置认证token
        if (this.config.gateway.token) {
            params.setAuth(this.config.gateway.token);
        }
        
        // 设置 scopes（与 Java 版本对齐）
        params.scopes = ['operator.read', 'operator.write'];

        const request = new RequestMessage(requestId, 'connect', params);

        try {
            this.send(JSON.stringify(request));
            console.debug('[Openclaw] Sent authentication request');

            // 记录待处理的请求
            this.pendingRequests.set(requestId, {
                method: 'connect',
                resolveConnect,
                rejectConnect,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('[Openclaw] Failed to send connect request:', error.message);
            if (rejectConnect) rejectConnect(error);
        }
    }

    /**
     * 处理响应消息
     */
    handleResponse(json) {
        const requestId = json.id;
        const ok = json.ok;

        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
            return;
        }

        if (pendingRequest.method === 'connect') {
            this.pendingRequests.delete(requestId);

            if (ok) {
                this.isAuthenticated = true;
                this.reconnectAttempts = 0;
                console.log('Openclaw Gateway connection authenticated successfully');
                
                if (this.messageHandler) {
                    this.messageHandler.onConnected();
                }
                
                this.startHeartbeat();
                
                if (pendingRequest.resolveConnect) {
                    pendingRequest.resolveConnect();
                }
            } else {
                console.error('Connect request failed:', json);
                if (pendingRequest.rejectConnect) {
                    pendingRequest.rejectConnect(new Error('Authentication failed'));
                }
                if (this.messageHandler) {
                    this.messageHandler.onError('Connect request failed');
                }
            }
        } else if (pendingRequest.method === 'chat.send') {
            this.pendingRequests.delete(requestId);

            if (!ok) {
                console.error('Chat send failed:', json);
                if (this.messageHandler) {
                    this.messageHandler.onError('Chat send failed');
                }
                return;
            }

            // 从响应中提取 runId 并保存上下文
            if (json.payload && json.payload.runId) {
                const runId = json.payload.runId;
                
                // 保存或更新消息上下文
                const existingContext = messageContexts.get(runId);
                if (existingContext) {
                    existingContext.refreshTimestamp();
                } else {
                    messageContexts.set(runId, {
                        senderId: pendingRequest.senderId,
                        threadId: pendingRequest.threadId,
                        isGroup: pendingRequest.isGroup,
                        timestamp: Date.now(),
                        lastText: '',
                        refreshTimestamp() {
                            this.timestamp = Date.now();
                        }
                    });
                }
                
                // 同时注册到 session 上下文管理器（用于 cron 任务等异步消息）
                if (this.sessionContextManager && pendingRequest.senderId) {
                    this.sessionContextManager.associateRunId(runId, SessionContextManager.DEFAULT_SESSION_KEY);
                    this.sessionContextManager.registerSession(
                        SessionContextManager.DEFAULT_SESSION_KEY,
                        pendingRequest.senderId,
                        pendingRequest.threadId,
                        pendingRequest.isGroup
                    );
                }
                
                console.debug(`Saved message context for runId=${runId}, sender=${pendingRequest.senderId}`);
            }
        }
    }

    /**
     * 处理 Openclaw 消息（AI 响应等）
     */
    handleOpenclawMessage(msg) {
        if (!msg.type) {
            console.warn('Received message without type');
            return;
        }

        console.debug('Received Openclaw message:', msg);
        switch (msg.type) {
            case 'response':
                if (this.messageHandler) {
                    this.messageHandler.onResponse(msg);
                }
                break;
            case 'typing':
                if (this.messageHandler && this.messageHandler.onTyping) {
                    this.messageHandler.onTyping(msg);
                }
                break;
            case 'error':
                console.error('Openclaw Gateway error:', msg.error);
                if (this.messageHandler) {
                    this.messageHandler.onError(msg.error);
                }
                break;
            default:
                console.warn('Unknown message type from Openclaw:', msg.type);
        }
    }

    /**
     * 处理 agent 事件（流式文本）
     */
    handleAgentEvent(json) {
        if (!json.payload) return;

        console.debug('Received agent event:', json);
        const payload = json.payload;
        const runId = payload.runId || '';
        const stream = payload.stream || '';

        let startCommand = false;
        let endCommand = false;
        if (stream === 'lifecycle' && payload.data) {
            if (payload.data.phase === 'start') {
                startCommand = true;
            } else if (payload.data.phase === 'end') {
                endCommand = true;
            }
        }

        // 只处理 assistant 流 或 lifecycle 的 start/end
        if (stream !== 'assistant' && !startCommand && !endCommand) {
            return;
        }

        const data = payload.data || {};
        let text = data.text || '';

        // 查找消息上下文（优先从 runId 映射，其次从 session 上下文管理器）
        let context = messageContexts.get(runId);
        
        // 如果没有找到上下文，尝试从 session 上下文管理器获取（用于 cron 任务等异步消息）
        if (!context && this.sessionContextManager) {
            let sessionContext = this.sessionContextManager.getContextByRunId(runId);
            if (!sessionContext) {
                // 尝试获取默认 session 上下文
                sessionContext = this.sessionContextManager.getDefaultSessionContext();
            }
            
            if (sessionContext) {
                context = {
                    senderId: sessionContext.getSenderId(),
                    threadId: sessionContext.getThreadId(),
                    isGroup: sessionContext.isGroup(),
                    timestamp: Date.now(),
                    lastText: '',
                    refreshTimestamp() {
                        this.timestamp = Date.now();
                    }
                };
                messageContexts.set(runId, context);
                console.debug(`Resolved context from session manager for runId=${runId}, sender=${sessionContext.getSenderId()}`);
            }
        }

        if (!context) {
            console.debug(`No context found for runId=${runId}, skipping agent event`);
            // 清理可能存在的孤立 pendingRequests
            for (const [requestId, pending] of this.pendingRequests) {
                if (pending.method === 'chat.send' && pending.threadId === runId) {
                    console.debug(`Removing orphaned pending request for runId=${runId}`);
                    this.pendingRequests.delete(requestId);
                }
            }
            return;
        }

        // 在 end 命令时使用缓存的文本（对齐 Java 版本的 StringUtils.isEmpty 检查）
        if ((!text || text === '') && endCommand) {
            text = context.lastText || '';
        }

        // 缓存非空文本（用于 end 时恢复）
        if (text && !endCommand) {
            context.lastText = text;
        }

        console.debug(`Agent event: runId=${runId}, text=${text.substring(0, Math.min(50, text.length))}, sender=${context.senderId}`);

        // 构建流式消息
        const response = {
            type: 'streaming',
            channel: {
                peerId: context.senderId,
                threadId: context.threadId
            },
            message: {
                text: text,
                extra: {
                    streamId: runId,
                    state: startCommand ? 'start' : (endCommand ? 'completed' : 'generating')
                }
            }
        };

        if (this.messageHandler) {
            this.messageHandler.onResponse(response);
        }

        // end 命令时清理上下文
        if (endCommand) {
            messageContexts.delete(runId);
        }
    }

    /**
     * 处理 chat 事件（AI 响应）
     */
    handleChatEvent(json) {
        if (!json.payload) return;

        const payload = json.payload;
        const runId = payload.runId || '';
        const state = payload.state || '';

        // 提取消息内容
        let messageText = null;
        if (payload.message) {
            const message = payload.message;
            if (typeof message === 'string') {
                messageText = message;
            } else if (message.content && Array.isArray(message.content)) {
                const firstContent = message.content[0];
                if (firstContent && firstContent.text) {
                    messageText = firstContent.text;
                }
            }
        }

        console.debug(`Chat event: state=${state}, runId=${runId}, text=${messageText ? messageText.substring(0, Math.min(50, messageText.length)) : 'null'}`);

        // 查找消息上下文（优先从 runId 映射，其次从 session 上下文管理器）
        let context = messageContexts.get(runId);
        
        // 如果没有找到上下文，尝试从 session 上下文管理器获取（用于 cron 任务等异步消息）
        if (!context && this.sessionContextManager) {
            let sessionContext = this.sessionContextManager.getContextByRunId(runId);
            if (!sessionContext) {
                // 尝试获取默认 session 上下文
                sessionContext = this.sessionContextManager.getDefaultSessionContext();
            }
            
            if (sessionContext) {
                context = {
                    senderId: sessionContext.getSenderId(),
                    threadId: sessionContext.getThreadId(),
                    isGroup: sessionContext.isGroup(),
                    timestamp: Date.now(),
                    lastText: '',
                    refreshTimestamp() {
                        this.timestamp = Date.now();
                    }
                };
                messageContexts.set(runId, context);
                console.debug(`Resolved context from session manager for runId=${runId}, sender=${sessionContext.getSenderId()}`);
            }
        }

        // 根据状态处理
        if (state === 'final') {
            // final状态不再处理，放到lifecycle的end处理
            
            // 清理上下文
            messageContexts.delete(runId);
        } else if (state === 'error') {
            const errorMessage = payload.errorMessage || 'Unknown error';
            console.error('Chat event error:', errorMessage);
            if (this.messageHandler) {
                this.messageHandler.onError(errorMessage);
            }
            messageContexts.delete(runId);
        }
    }

    /**
     * 发送消息到 Openclaw Gateway（无 senderId 版本）
     */
    sendMessage(message) {
        this.sendMessageWithSender(message, null);
    }

    /**
     * 发送消息到 Openclaw Gateway（带 senderId 版本）
     * @param {Object} message - 消息对象
     * @param {string} senderId - 原始发送者ID（可选）
     */
    sendMessageWithSender(message, senderId) {
        if (!this.isAuthenticated) {
            console.warn('Not authenticated, cannot send message');
            return;
        }

        try {
            // 注册 session 上下文（用于 cron 任务等异步消息的回复）
            if (this.sessionContextManager && senderId) {
                const threadId = message.channel ? message.channel.threadId : senderId;
                const isGroup = message.channel && message.channel.isGroup;
                this.sessionContextManager.registerSession(
                    SessionContextManager.DEFAULT_SESSION_KEY,
                    senderId,
                    threadId,
                    isGroup
                );
            }

            const requestId = generateUUID();
            const chatParams = new ChatSendParams();
            chatParams.sessionKey = 'main';
            chatParams.message = message.message.text;
            chatParams.idempotencyKey = generateUUID();

            // 添加附件（如果有媒体）
            if (message.message && message.message.mediaUrl) {
                chatParams.setAttachments([new Attachment(
                    message.message.mediaType,
                    message.message.mediaUrl
                )]);
                console.debug(`Adding attachment to message: type=${message.message.mediaType}, url=${message.message.mediaUrl}`);
            }

            const request = new RequestMessage(requestId, 'chat.send', chatParams);
            this.send(JSON.stringify(request));
            
            console.info(`Sent chat.send request: text=${message.message.text ? message.message.text.substring(0, Math.min(50, message.message.text.length)) : 'null'}, sender=${senderId}`);

            // 记录待处理的请求
            const pendingReq = {
                method: 'chat.send',
                senderId: senderId,
                threadId: message.channel ? message.channel.threadId : '',
                isGroup: message.channel ? message.channel.isGroup : false,
                timestamp: Date.now()
            };
            this.pendingRequests.set(requestId, pendingReq);

        } catch (error) {
            console.error('Failed to send message to Openclaw:', error.message);
        }
    }

    /**
     * 发送原始消息
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            throw new Error('WebSocket not open');
        }
    }

    /**
     * 启动心跳
     */
    startHeartbeat() {
        this.lastHeartbeatTime = Date.now();

        this.heartbeatTimer = setInterval(() => {
            try {
                if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated) {
                    this.ws.ping();
                    this.lastHeartbeatTime = Date.now();
                    console.debug('[Openclaw] Ping sent');
                }
                // 清理超时的消息上下文
                this.cleanupExpiredMessageContexts();
                // 清理过期的session上下文
                if (this.sessionContextManager) {
                    this.sessionContextManager.cleanupExpiredSessions(MESSAGE_CONTEXT_TIMEOUT_MS);
                }
            } catch (error) {
                console.error('[Openclaw] Heartbeat error:', error.message);
            }
        }, this.config.gateway.heartbeatInterval);

        console.debug(`[Openclaw] Heartbeat started (${this.config.gateway.heartbeatInterval}ms)`);
    }

    /**
     * 清理超时的消息上下文
     */
    cleanupExpiredMessageContexts() {
        const now = Date.now();
        let removedCount = 0;
        for (const [runId, context] of messageContexts) {
            if (now - context.timestamp > MESSAGE_CONTEXT_TIMEOUT_MS) {
                messageContexts.delete(runId);
                removedCount++;
            }
        }
        if (removedCount > 0) {
            console.debug(`Cleaned up ${removedCount} expired message contexts`);
        }
    }

    /**
     * 处理连接关闭
     */
    handleClose(code, reason) {
        const reasonStr = reason || 'No reason';
        const wasAuthenticated = this.isAuthenticated;
        
        // 清理超时定时器
        if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
        
        // 清理 Promise 回调
        this._connectResolve = null;
        this._connectReject = null;
        
        // 只在非预期关闭时打印警告
        if (code !== 1000 && code !== 1001) {
            // 抑制频繁断开日志：如果连接从未成功认证且不是第一次连接，使用 debug 级别
            if (!wasAuthenticated && this._connectionStartTime && 
                Date.now() - this._connectionStartTime < 5000) {
                console.debug(`[Openclaw] Connection closed (unauthenticated): code=${code}`);
            } else {
                console.warn(`[Openclaw] Connection closed: code=${code}, reason=${reasonStr}`);
            }
        } else {
            console.debug(`[Openclaw] Connection closed normally: code=${code}`);
        }
        
        this.isAuthenticated = false;
        this.stopHeartbeat();

        // 通知上层断开（但确保不会重复通知）
        if (this.messageHandler && wasAuthenticated) {
            this.messageHandler.onDisconnected(code, reason);
        }
    }

    /**
     * 处理错误
     */
    handleError(error) {
        // 抑制常见的连接错误日志，这些通常会在 handleClose 中处理
        const errorMsg = error.message || 'Unknown error';
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ENOTFOUND')) {
            console.debug('[Openclaw] Connection error (will retry):', errorMsg);
        } else {
            console.error('[Openclaw] WebSocket error:', errorMsg);
        }
        if (this.messageHandler) {
            this.messageHandler.onError(error.message);
        }
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            console.debug('[Openclaw] Heartbeat stopped');
        }
    }

    /**
     * 关闭连接
     */
    closeConnection() {
        this.stopHeartbeat();
        this.isAuthenticated = false;
        
        // 清理超时定时器
        if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
        
        if (this.ws) {
            try {
                // 先移除事件处理器，防止 close 事件触发重连
                this.ws.removeAllListeners('open');
                this.ws.removeAllListeners('message');
                this.ws.removeAllListeners('close');
                this.ws.removeAllListeners('error');
                this.ws.removeAllListeners('ping');
                this.ws.removeAllListeners('pong');
                
                // 只有在 OPEN 或 CONNECTING 状态才关闭
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close(1000, 'Client closing');
                } else if (this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.terminate(); // 强制终止正在连接的 socket
                }
            } catch (e) {
                // 忽略关闭时的错误
                console.debug('[Openclaw] Error during connection close:', e.message);
            } finally {
                this.ws = null;
            }
        }
        
        // 清理 Promise 引用
        this._connectResolve = null;
        this._connectReject = null;
    }

    /**
     * 检查是否已认证
     */
    isConnected() {
        return this.isAuthenticated && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

/**
 * 生成 UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
