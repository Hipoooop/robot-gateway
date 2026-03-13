import WebSocket from 'ws';
import { RequestMessage } from './protocol/RequestMessage.js';
import { ConnectMessage } from './protocol/ConnectMessage.js';
import { ResponseMessage } from './protocol/ResponseMessage.js';
import { PushMessage } from './protocol/PushMessage.js';
import { ResponseHandler } from './handler/ResponseHandler.js';

/**
 * WebSocket 客户端
 * 处理底层的 WebSocket 连接和消息收发
 */
export class RobotGatewayClient {
    constructor(gatewayUrl, messageHandler = null, options = {}) {
        this.gatewayUrl = gatewayUrl;
        this.messageHandler = messageHandler;
        this.ws = null;
        this.connected = false;
        this.authenticated = false;
        this.responseHandler = new ResponseHandler(options.timeout || 30);
        
        // 重连配置
        this.reconnectInterval = options.reconnectInterval || 5000;
        this.heartbeatInterval = options.heartbeatInterval || 270000; // 4.5分钟
        this.heartbeatTimer = null;
        this.shouldReconnect = false;
        
        // 鉴权信息
        this.robotId = null;
        this.robotSecret = null;
        
        // 事件回调
        this.onConnected = null;
        this.onDisconnected = null;
        this.onAuthenticated = null;
        this.onAuthFailed = null;
        this.onError = null;
    }

    /**
     * 连接到网关
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.gatewayUrl);

                this.ws.on('open', () => {
                    this.connected = true;
                    console.log('WebSocket connected');
                    if (this.onConnected) {
                        this.onConnected();
                    }
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data.toString());
                });

                this.ws.on('close', () => {
                    this.handleDisconnect();
                });

                this.ws.on('error', (error) => {
                    console.error('WebSocket error:', error.message);
                    if (this.onError) {
                        this.onError(error.message);
                    }
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 发送鉴权请求
     */
    sendConnect(robotId, robotSecret) {
        this.robotId = robotId;
        this.robotSecret = robotSecret;
        
        const connectMsg = ConnectMessage.authRequest(robotId, robotSecret);
        this.send(JSON.stringify(connectMsg));
        this.shouldReconnect = true;
    }

    /**
     * 发送请求并等待响应
     */
    async sendRequest(method, params = []) {
        if (!this.connected) {
            throw new Error('WebSocket not connected');
        }
        if (!this.authenticated && method !== 'connect') {
            throw new Error('Not authenticated');
        }

        const requestId = this.generateRequestId();
        const request = new RequestMessage(requestId, method, params);

        // 注册请求等待响应
        const responsePromise = this.responseHandler.registerRequest(requestId);

        // 发送请求
        this.send(JSON.stringify(request));

        return responsePromise;
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
     * 处理收到的消息
     */
    handleMessage(data) {
        try {
            const json = JSON.parse(data);

            // 鉴权响应
            if (json.type === 'connect') {
                this.handleConnectResponse(json);
                return;
            }

            // 心跳响应
            if (json.type === 'heartbeat') {
                console.log('Heartbeat response received');
                return;
            }

            // 推送消息
            if (json.type === 'message') {
                if (this.messageHandler && this.messageHandler.onMessage) {
                    this.messageHandler.onMessage(PushMessage.fromJSON(json));
                }
                return;
            }

            // 请求响应
            if (json.requestId) {
                const response = ResponseMessage.fromJSON(json);
                const handled = this.responseHandler.handleResponse(response);
                if (!handled) {
                    console.warn('Unhandled response:', json.requestId);
                }
                return;
            }

            console.warn('Unknown message type:', json);

        } catch (error) {
            console.error('Failed to handle message:', error.message);
            if (this.onError) {
                this.onError(error.message);
            }
        }
    }

    /**
     * 处理鉴权响应
     */
    handleConnectResponse(json) {
        if (json.code === 0) {
            this.authenticated = true;
            console.log('Authentication successful');
            this.startHeartbeat();
            if (this.onAuthenticated) {
                this.onAuthenticated();
            }
            if (this.messageHandler && this.messageHandler.onConnectionChanged) {
                this.messageHandler.onConnectionChanged(true);
            }
        } else {
            this.authenticated = false;
            console.error('Authentication failed:', json.msg);
            this.shouldReconnect = false; // 鉴权失败不重连
            if (this.onAuthFailed) {
                this.onAuthFailed(json.code, json.msg);
            }
        }
    }

    /**
     * 处理断开连接
     */
    handleDisconnect() {
        const wasAuthenticated = this.authenticated;
        
        this.connected = false;
        this.authenticated = false;
        this.stopHeartbeat();

        // 清理所有待处理的请求
        this.responseHandler.clearAll('Connection closed');

        if (wasAuthenticated && this.messageHandler && this.messageHandler.onConnectionChanged) {
            this.messageHandler.onConnectionChanged(false);
        }

        console.log('WebSocket disconnected');
        if (this.onDisconnected) {
            this.onDisconnected();
        }

        // 自动重连
        if (this.shouldReconnect && this.robotId && this.robotSecret) {
            setTimeout(() => {
                this.reconnect();
            }, this.reconnectInterval);
        }
    }

    /**
     * 重新连接
     */
    async reconnect() {
        console.log('Attempting to reconnect...');
        try {
            await this.connect();
            this.sendConnect(this.robotId, this.robotSecret);
        } catch (error) {
            console.error('Reconnect failed:', error.message);
            // 重连失败，继续尝试
            setTimeout(() => {
                this.reconnect();
            }, this.reconnectInterval);
        }
    }

    /**
     * 启动心跳
     */
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.authenticated) {
                try {
                    this.sendRequest('heartbeat');
                } catch (error) {
                    console.error('Failed to send heartbeat:', error.message);
                }
            }
        }, this.heartbeatInterval);
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * 关闭连接
     */
    close() {
        this.shouldReconnect = false;
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * 生成唯一请求ID
     */
    generateRequestId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 是否已连接
     */
    isConnected() {
        return this.connected;
    }

    /**
     * 是否已鉴权
     */
    isAuthenticated() {
        return this.authenticated;
    }
}
