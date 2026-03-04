/**
 * OpenClaw Gateway 协议消息类
 * 对应 Java 版本的 OpenClawProtocol
 */

/**
 * 客户端信息
 */
export class ClientInfo {
    constructor() {
        this.id = 'cli';  // 标准客户端ID
        this.version = '1.0.0';
        this.platform = 'nodejs';
        this.mode = 'cli';  // 客户端模式
    }
}

/**
 * 认证信息
 */
export class AuthInfo {
    constructor(token = null) {
        this.token = token;
    }
}

/**
 * Connect请求参数
 */
export class ConnectParams {
    constructor() {
        this.minProtocol = 3;
        this.maxProtocol = 3;
        this.client = new ClientInfo();
        this.role = 'operator';
        this.scopes = ['operator.read', 'operator.write'];
        this.auth = null;
        this.userAgent = 'openclaw-adapter/1.0.0';
    }

    setAuth(token) {
        if (token) {
            this.auth = new AuthInfo(token);
        }
    }
}

/**
 * ChatSend参数
 */
export class ChatSendParams {
    constructor() {
        this.sessionKey = 'main';  // 会话键
        this.message = '';          // 消息文本
        // attachments 只在有附件时设置，不要默认为 null
        this.idempotencyKey = '';   // 幂等键
    }

    /**
     * 添加附件
     * @param {Attachment[]} attachments - 附件列表
     */
    setAttachments(attachments) {
        if (attachments && attachments.length > 0) {
            this.attachments = attachments;
        }
    }
}

/**
 * 附件信息
 */
export class Attachment {
    constructor(type, url, name = null) {
        this.type = type;  // image, audio, video, file
        this.url = url;
        if (name) {
            this.name = name;
        }
    }
}

/**
 * 请求消息（通用）
 */
export class RequestMessage {
    constructor(requestId = null, method = null, params = null) {
        this.type = 'req';
        this.id = requestId || generateUUID();
        this.method = method;
        this.params = params;
    }
}

/**
 * 响应消息
 */
export class ResponseMessage {
    constructor(data = {}) {
        this.type = data.type;
        this.id = data.id;
        this.ok = data.ok;
        this.payload = data.payload;
        this.error = data.error;
    }
}

/**
 * 响应载荷
 */
export class ResponsePayload {
    constructor(data = {}) {
        this.type = data.type;
        this.protocol = data.protocol;
        this.policy = data.policy ? new Policy(data.policy) : null;
    }
}

/**
 * 策略信息
 */
export class Policy {
    constructor(data = {}) {
        this.tickIntervalMs = data.tickIntervalMs || 30000;
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
