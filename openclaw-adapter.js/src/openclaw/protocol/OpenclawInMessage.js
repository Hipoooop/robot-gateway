/**
 * 从 Openclaw Gateway 接收的消息
 * 对应 Java 版本的 OpenclawInMessage
 */

export class OpenclawInMessage {
    constructor(data = {}) {
        this.type = data.type;           // response, typing, error, event
        this.event = data.event;         // 事件类型（type=event时有值）
        this.payload = data.payload;     // 事件负载
        this.channel = data.channel ? new Channel(data.channel) : null;
        this.message = data.message ? new Message(data.message) : null;
        this.meta = data.meta;
        this.error = data.error;
    }
}

/**
 * 通道信息
 */
export class Channel {
    constructor(data = {}) {
        this.threadId = data.threadId;
        this.peerId = data.peerId;
    }
}

/**
 * 消息内容
 */
export class Message {
    constructor(data = {}) {
        this.text = data.text;
        this.blocks = data.blocks;
        this.extra = data.extra || {};
    }

    /**
     * 设置额外的元数据
     */
    setExtra(key, value) {
        this.extra[key] = value;
    }

    /**
     * 获取额外的元数据
     */
    getExtra(key) {
        return this.extra[key];
    }
}

/**
 * 流式消息事件 payload
 */
export class StreamEventPayload {
    constructor(data = {}) {
        this.runId = data.runId;
        this.stream = data.stream;       // assistant
        this.data = data.data || {};
    }
}

/**
 * Chat 事件 payload
 */
export class ChatEventPayload {
    constructor(data = {}) {
        this.runId = data.runId;
        this.state = data.state;         // final, error
        this.message = data.message;
        this.errorMessage = data.errorMessage;
    }
}
