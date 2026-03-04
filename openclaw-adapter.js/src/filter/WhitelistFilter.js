/**
 * 白名单过滤器
 * 只处理白名单中的用户或群组的消息
 */
export class WhitelistFilter {
    constructor(config) {
        this.config = config;
    }

    /**
     * 检查消息是否应该被处理
     * @param {string} senderId - 发送者用户ID
     * @param {string} targetId - 目标ID（群组ID或用户ID）
     * @param {boolean} isGroup - 是否为群聊
     * @returns {boolean} true=应该处理, false=忽略
     */
    shouldProcess(senderId, targetId, isGroup) {
        // 如果白名单未启用，处理所有消息
        if (!this.config.whitelist.enabled) {
            return true;
        }

        // 检查用户白名单
        const allowedUsers = this.config.whitelist.allowedUsers || [];
        if (allowedUsers.length > 0) {
            if (allowedUsers.includes(senderId)) {
                console.debug(`User ${senderId} is in whitelist, will process message`);
                return true;
            }
        }

        // 检查群组白名单
        if (isGroup) {
            const allowedGroups = this.config.whitelist.allowedGroups || [];
            if (allowedGroups.length > 0) {
                if (allowedGroups.includes(targetId)) {
                    console.debug(`Group ${targetId} is in whitelist, will process message`);
                    return true;
                }
            }
        }

        // 不在白名单中，记录日志并忽略
        console.log(`Message from sender=${senderId} (target=${targetId}, isGroup=${isGroup}) is not in whitelist, ignoring`);
        return false;
    }
}
