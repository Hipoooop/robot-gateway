/**
 * 发送到 Openclaw Gateway 的消息
 * 对应 Java 版本的 OpenclawOutMessage
 */

export class OpenclawOutMessage {
    constructor() {
        this.type = 'message';
        this.channel = null;
        this.message = null;
        this.session = null;
    }
}

/**
 * 通道信息
 */
export class Channel {
    constructor() {
        this.id = 'wildfire-im';
        this.threadId = '';
        this.peerId = '';
        this.peerName = '';
        this.isGroup = false;
    }
}

/**
 * 消息内容
 */
export class Message {
    constructor() {
        this.id = '';
        this.text = '';
        this.timestamp = 0;
        this.mentions = [];
        this.mediaUrl = null;
        this.mediaType = null;
    }
}

/**
 * @提及信息
 */
export class Mention {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }
}

/**
 * 会话信息
 */
export class Session {
    constructor(id) {
        this.id = id;
    }
}
