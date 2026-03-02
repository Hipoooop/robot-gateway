import WebSocket from 'ws';
import {
    RequestMessage,
    ConnectParams,
    ChatSendParams,
    Attachment
} from './protocol/OpenclawProtocol.js';

const MESSAGE_CONTEXT_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时

/**
 * Openclaw Gateway WebSocket 客户端
 * 负责与 Openclaw Gateway 的 WebSocket 通信
 */
export class OpenclawWebSocketClient {
    constructor(config, messageHandler) {
        this.config = config;
        this.messageHandler = messageHandler;
        
        this.ws = null;
        this.isAuthenticated = false;
        this.lastHeartbeatTime = 0;
        this.pendingRequests = new Map();
        this.messageContexts = new Map();
        this.heartbeatTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // 绑定方法
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    /**
     * 连接到 Openclaw Gateway
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`Connecting to Openclaw Gateway: ${this.config.gateway.url}`);
                
                this.ws = new WebSocket(this.config.gateway.url);

                this.ws.on('open', () => {
                    console.log('Connected to Openclaw Gateway');
                    // 等待 connect.challenge 事件
                    console.log('Waiting for connect.challenge event...');
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data.toString(), resolve, reject);
                });

                this.ws.on('close', this.handleClose);
                this.ws.on('error', this.handleError);

                // 设置连接超时
                setTimeout(() => {
                    if (!this.isAuthenticated) {
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
        params.setAuth(this.config.gateway.token);

        const request = new RequestMessage(requestId, 'connect', params);

        try {
            this.send(JSON.stringify(request));
            console.log('Sent connect request to Openclaw Gateway');

            // 记录待处理的请求
            this.pendingRequests.set(requestId, {
                method: 'connect',
                resolveConnect,
                rejectConnect,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Failed to send connect request:', error.message);
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
                this.messageContexts.set(runId, {
                    senderId: pendingRequest.senderId,
                    threadId: pendingRequest.threadId,
                    isGroup: pendingRequest.isGroup,
                    timestamp: Date.now()
                });
    
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

        const payload = json.payload;
        const runId = payload.runId || '';
        const stream = payload.stream || '';

        let startCommand = false;
        if (stream === 'lifecycle' && payload.data) {
            if (payload.data.phase === 'start') {
                startCommand = true;
            }
        }

        // 只处理 assistant 流
        if (stream !== 'assistant' && !startCommand) {
            return;
        }

        const data = payload.data || {};
        const text = data.text || '';

        // 查找消息上下文
        const context = this.messageContexts.get(runId);
        if (!context) {
            return;
        }

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
                    state: startCommand ? 'start' : 'generating'
                }
            }
        };

        if (this.messageHandler) {
            this.messageHandler.onResponse(response);
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

        // 查找消息上下文
        const context = this.messageContexts.get(runId);

        if (state === 'final') {
            if (messageText) {
                const response = {
                    type: 'response',
                    channel: context ? {
                        peerId: context.senderId,
                        threadId: context.threadId
                    } : {},
                    message: {
                        text: messageText,
                        extra: {
                            streamId: runId,
                            state: 'completed'
                        }
                    }
                };

                if (this.messageHandler) {
                    this.messageHandler.onResponse(response);
                }
            }

            // 清理上下文
            this.messageContexts.delete(runId);
        } else if (state === 'error') {
            const errorMessage = payload.errorMessage || 'Unknown error';
            console.error('Chat event error:', errorMessage);
            if (this.messageHandler) {
                this.messageHandler.onError(errorMessage);
            }
            this.messageContexts.delete(runId);
        }
    }

    /**
     * 发送消息到 Openclaw Gateway
     */
    sendMessage(message, senderId) {
        if (!this.isAuthenticated) {
            console.warn('Not authenticated, cannot send message');
            return;
        }

        try {
            const requestId = generateUUID();
            const chatParams = new ChatSendParams();
            chatParams.sessionKey = 'main';
            chatParams.message = message.message.text;
            chatParams.idempotencyKey = generateUUID();

            // 添加附件（如果有媒体）
            if (message.message.mediaUrl) {
                chatParams.setAttachments([new Attachment(
                    message.message.mediaType,
                    message.message.mediaUrl
                )]);
            }

            const request = new RequestMessage(requestId, 'chat.send', chatParams);
            this.send(JSON.stringify(request));



            // 记录待处理的请求
            this.pendingRequests.set(requestId, {
                method: 'chat.send',
                senderId: senderId,
                threadId: message.channel.threadId,
                isGroup: message.channel.isGroup,
                timestamp: Date.now()
            });

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
                    console.debug('Sent ping to Openclaw Gateway');
                }
                // 清理超时的消息上下文
                this.cleanupExpiredMessageContexts();
            } catch (error) {
                console.error('Heartbeat error:', error.message);
            }
        }, this.config.gateway.heartbeatInterval);

        console.log(`Openclaw heartbeat started with interval: ${this.config.gateway.heartbeatInterval}ms`);
    }

    /**
     * 清理超时的消息上下文
     */
    cleanupExpiredMessageContexts() {
        const now = Date.now();
        for (const [runId, context] of this.messageContexts) {
            if (now - context.timestamp > MESSAGE_CONTEXT_TIMEOUT_MS) {
                this.messageContexts.delete(runId);
            }
        }
    }

    /**
     * 处理连接关闭
     */
    handleClose(code, reason) {
        console.warn(`Openclaw Gateway connection closed: code=${code}, reason=${reason}`);
        this.isAuthenticated = false;
        this.stopHeartbeat();

        if (this.messageHandler) {
            this.messageHandler.onDisconnected(code, reason);
        }
    }

    /**
     * 处理错误
     */
    handleError(error) {
        console.error('Openclaw Gateway WebSocket error:', error.message);
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
            console.log('Openclaw heartbeat stopped');
        }
    }

    /**
     * 关闭连接
     */
    closeConnection() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
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
