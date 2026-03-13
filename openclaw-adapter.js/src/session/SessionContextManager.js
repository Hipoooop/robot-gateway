/**
 * 会话上下文管理器
 * 管理 sessionKey 到用户/群组信息的映射，用于处理 cron 等异步任务的消息回复
 */
export class SessionContextManager {
    // 默认 session key
    static DEFAULT_SESSION_KEY = 'main';

    constructor() {
        // sessionKey -> 会话上下文
        this.sessionContexts = new Map();
        // runId -> sessionKey 的反向映射（用于清理）
        this.runIdToSessionKey = new Map();
    }

    /**
     * 注册会话上下文
     * @param {string} sessionKey - 会话键（如 "main"）
     * @param {string} senderId - 发送者ID
     * @param {string} threadId - 会话ID（群组ID或用户ID）
     * @param {boolean} isGroup - 是否群聊
     */
    registerSession(sessionKey, senderId, threadId, isGroup) {
        if (!sessionKey || sessionKey.trim() === '') {
            sessionKey = SessionContextManager.DEFAULT_SESSION_KEY;
        }

        const context = new SessionContext(senderId, threadId, isGroup);
        this.sessionContexts.set(sessionKey, context);

        console.debug(`Registered session context: sessionKey=${sessionKey}, senderId=${senderId}, threadId=${threadId}, isGroup=${isGroup}`);
    }

    /**
     * 关联 runId 到 sessionKey（用于后续清理）
     * @param {string} runId - 运行ID
     * @param {string} sessionKey - 会话键
     */
    associateRunId(runId, sessionKey) {
        if (runId && sessionKey) {
            this.runIdToSessionKey.set(runId, sessionKey);
            console.debug(`Associated runId ${runId} with sessionKey ${sessionKey}`);
        }
    }

    /**
     * 获取会话上下文
     * @param {string} sessionKey - 会话键
     * @returns {SessionContext|null} - 会话上下文，如果不存在返回 null
     */
    getSessionContext(sessionKey) {
        if (!sessionKey || sessionKey.trim() === '') {
            sessionKey = SessionContextManager.DEFAULT_SESSION_KEY;
        }
        return this.sessionContexts.get(sessionKey) || null;
    }

    /**
     * 通过 runId 获取会话上下文
     * @param {string} runId - 运行ID
     * @returns {SessionContext|null} - 会话上下文，如果不存在返回 null
     */
    getContextByRunId(runId) {
        const sessionKey = this.runIdToSessionKey.get(runId);
        if (sessionKey) {
            return this.sessionContexts.get(sessionKey) || null;
        }
        return null;
    }

    /**
     * 清理指定 runId 的关联
     * @param {string} runId - 运行ID
     */
    cleanupRunId(runId) {
        const sessionKey = this.runIdToSessionKey.delete(runId);
        if (sessionKey) {
            console.debug(`Cleaned up runId ${runId} association`);
        }
    }

    /**
     * 清理过期的会话上下文
     * @param {number} maxAgeMs - 最大存活时间（毫秒）
     * @returns {number} - 清理的数量
     */
    cleanupExpiredSessions(maxAgeMs) {
        const now = Date.now();
        let count = 0;

        for (const [key, context] of this.sessionContexts) {
            if (key === SessionContextManager.DEFAULT_SESSION_KEY) {
                continue;
            }
            if (now - context.lastActivityTime > maxAgeMs) {
                this.sessionContexts.delete(key);
                count++;
            }
        }

        // 同时清理孤儿化的 runId 映射
        for (const [runId, sessionKey] of this.runIdToSessionKey) {
            if (!this.sessionContexts.has(sessionKey)) {
                this.runIdToSessionKey.delete(runId);
            }
        }

        if (count > 0) {
            console.debug(`Cleaned up ${count} expired session contexts`);
        }
        return count;
    }

    /**
     * 获取默认会话上下文
     * @returns {SessionContext|null} - 默认会话上下文，如果不存在返回 null
     */
    getDefaultSessionContext() {
        return this.sessionContexts.get(SessionContextManager.DEFAULT_SESSION_KEY) || null;
    }
}

/**
 * 会话上下文
 */
export class SessionContext {
    constructor(senderId, threadId, isGroup) {
        this.senderId = senderId;
        this.threadId = threadId;
        this._isGroup = isGroup;
        this.lastActivityTime = Date.now();
    }

    getSenderId() {
        return this.senderId;
    }

    getThreadId() {
        return this.threadId;
    }

    isGroup() {
        return this._isGroup;
    }

    getLastActivityTime() {
        return this.lastActivityTime;
    }
}
