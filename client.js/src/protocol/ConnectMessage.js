/**
 * 鉴权消息类
 * 对应 Java 版本的 ConnectMessage
 */
export class ConnectMessage {
    constructor(type, robotId = null, secret = null, code = null, msg = null) {
        this.type = type;
        this.robotId = robotId;
        this.secret = secret;
        this.code = code;
        this.msg = msg;
    }

    /**
     * 创建鉴权请求消息
     */
    static authRequest(robotId, secret) {
        return new ConnectMessage('connect', robotId, secret);
    }

    /**
     * 创建鉴权成功响应
     */
    static authSuccess() {
        return new ConnectMessage('connect', null, null, 0, 'success');
    }

    /**
     * 创建鉴权失败响应
     */
    static authFailed(code, msg) {
        return new ConnectMessage('connect', null, null, code, msg);
    }

    /**
     * 创建错误响应
     */
    static error(code, msg) {
        return new ConnectMessage('error', null, null, code, msg);
    }

    toJSON() {
        const obj = { type: this.type };
        if (this.robotId !== null) obj.robotId = this.robotId;
        if (this.secret !== null) obj.secret = this.secret;
        if (this.code !== null) obj.code = this.code;
        if (this.msg !== null) obj.msg = this.msg;
        return obj;
    }

    static fromJSON(json) {
        return new ConnectMessage(
            json.type,
            json.robotId,
            json.secret,
            json.code,
            json.msg
        );
    }
}
