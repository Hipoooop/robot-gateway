/**
 * 群聊过滤器
 * 实现群聊防刷屏策略，避免机器人在群聊中过度响应
 */
export class GroupFilter {
    constructor(config) {
        this.config = config;
    }

    /**
     * 判断是否应该响应群聊消息
     * @param {OpenclawOutMessage} message - 消息
     * @param {string} robotId - 机器人ID（用于检测是否被@）
     * @returns {boolean} true=应该响应, false=不响应
     */
    shouldRespond(message, robotId) {
        // 如果不是群聊，直接返回true（私聊总是响应）
        if (!message.channel.isGroup) {
            return true;
        }

        // 如果群聊策略未启用，不响应群聊
        if (!this.config.group.enabled) {
            console.debug('Group strategy is disabled, ignoring group message');
            return false;
        }

        // 策略1：被@时回复
        if (this.config.group.respondOnMention && this.isMentioned(message, robotId)) {
            console.debug('Bot is mentioned in group, will respond');
            return true;
        }

        // 策略2：消息以问号结尾
        if (this.config.group.respondOnQuestion) {
            const text = message.message.text || '';
            if (/.*[？?]$/.test(text)) {
                console.debug('Message ends with question mark, will respond');
                return true;
            }
        }

        // 策略3：包含求助关键词
        const text = message.message.text || '';
        const keywords = this.getHelpKeywords();
        for (const keyword of keywords) {
            if (text.includes(keyword.trim())) {
                console.debug(`Message contains help keyword '${keyword}', will respond`);
                return true;
            }
        }

        // 策略4：群聊白名单
        const allowedGroups = this.config.group.allowedIds || [];
        if (allowedGroups.length > 0 && allowedGroups.includes(message.channel.threadId)) {
            console.debug('Group is in whitelist, will respond');
            return true;
        }

        // 默认不响应群聊
        console.debug('Group message does not match any response criteria, ignoring');
        return false;
    }

    /**
     * 检测消息是否提及了机器人
     */
    isMentioned(message, robotId) {
        if (!robotId || !message.message.mentions || message.message.mentions.length === 0) {
            return false;
        }

        for (const mention of message.message.mentions) {
            if (robotId === mention.id) {
                return true;
            }
        }

        return false;
    }

    /**
     * 获取帮助关键词列表
     */
    getHelpKeywords() {
        const keywordsStr = this.config.group.helpKeywords || '';
        if (!keywordsStr) {
            return [];
        }
        return keywordsStr.split(',').map(k => k.trim()).filter(k => k);
    }
}
