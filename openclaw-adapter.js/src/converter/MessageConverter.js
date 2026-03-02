import { Conversation, MessagePayload } from '@wildfirechat/robot-gateway-client-sdk';
import { Channel, Message, Session, OpenclawOutMessage } from '../openclaw/protocol/OpenclawOutMessage.js';

/**
 * 消息格式转换器
 * 负责野火IM格式与Openclaw格式的双向转换
 */
export class MessageConverter {
    constructor() {
        // 初始化 server-sdk 模型（只需要初始化，不需要真实连接）
        // 实际使用时会从 robot-gateway-client-sdk 导入
    }

    /**
     * 野火IM PushMessage → Openclaw OutMessage
     */
    convertToOpenclaw(wildfireMessage) {
        if (!wildfireMessage || !wildfireMessage.data) {
            console.warn('Empty message data');
            return null;
        }

        try {
            const data = wildfireMessage.data;
            
            // 提取消息内容
            const text = this.extractTextContent(data);
            if (text === null) {
                console.debug(`Unknown or unsupported message type: type=${data.payload ? data.payload.type : 'null'}`);
                return null;
            }

            // 判断会话类型
            const conv = data.conv;
            const isGroup = conv && (conv.type === 1 || conv.type === 2);

            // 构建 Openclaw 消息
            const openclawMessage = new OpenclawOutMessage();

            // 设置通道信息
            const channel = new Channel();
            channel.id = 'wildfire-im';
            channel.threadId = conv ? (conv.type === 0 ? data.sender : conv.target) : '';
            channel.peerId = data.sender;
            channel.peerName = data.sender;
            channel.isGroup = isGroup;
            openclawMessage.channel = channel;

            // 提取@提及信息
            const mentions = this.extractMentions(data);

            // 检测媒体信息
            const mediaInfo = this.detectMediaInfo(data);

            // 设置消息内容
            const message = new Message();
            message.id = generateUUID();
            message.text = text;
            message.timestamp = Date.now();
            message.mentions = mentions;

            if (mediaInfo) {
                message.mediaUrl = mediaInfo.url;
                message.mediaType = mediaInfo.type;
            }

            openclawMessage.message = message;

            // 会话ID
            const sessionId = this.generateSessionId(
                conv ? conv.target : '',
                data.sender
            );
            openclawMessage.session = new Session(sessionId);

            console.debug(`Converted Wildfire message: threadId=${channel.threadId}, peerId=${channel.peerId}, isGroup=${channel.isGroup}`);

            return openclawMessage;

        } catch (error) {
            console.error('Failed to convert Wildfire message to Openclaw:', error.message);
            return null;
        }
    }

    /**
     * Openclaw InMessage → 野火IM发送参数
     */
    convertFromOpenclaw(openclawMessage) {
        if (!openclawMessage || !openclawMessage.channel) {
            console.warn('Invalid Openclaw message');
            return null;
        }

        try {
            const channel = openclawMessage.channel;
            const message = openclawMessage.message || {};

            // 构建会话对象
            const isGroup = channel.threadId && channel.peerId && channel.threadId !== channel.peerId;

            const conversation = {
                type: isGroup ? 1 : 0,  // 0=单聊, 1=群聊
                target: channel.threadId || channel.peerId || '',
                line: 0
            };

            // 构建消息内容
            let payload;

            // 提取流式消息元数据
            if (message.extra) {
                const streamId = message.extra.streamId;
                const state = message.extra.state;
                
                // 流式消息：使用特定的消息内容类型
                if (state === 'generating' || state === 'start') {
                    // StreamTextGeneratingMessageContent
                    // type = 14, searchableContent = text, content = streamId
                    payload = {
                        type: 14,  // StreamingText_Generationg
                        searchableContent: message.text || '',
                        content: streamId
                    };
                } else if (state === 'completed') {
                    // StreamTextGeneratedMessageContent
                    // type = 15, searchableContent = text, content = streamId
                    payload = {
                        type: 15,  // StreamingText_Generated
                        searchableContent: message.text || '',
                        content: streamId
                    };
                } else {
                    // 普通文本消息
                    payload = {
                        type: 1,  // 文本消息
                        searchableContent: message.text || ''
                    };
                }
            } else {
                // 普通文本消息
                payload = {
                    type: 1,  // 文本消息
                    searchableContent: message.text || ''
                };
            }

            const result = {
                conversation: conversation,
                payload: payload,
                targetUserId: channel.peerId || '',
                isGroup: isGroup,
                text: message.text || '',
                streamId: message.extra ? message.extra.streamId : null,
                streamState: message.extra ? message.extra.state : null
            };

            console.debug(`Converted Openclaw message: target=${result.targetUserId}, isGroup=${result.isGroup}, text=${result.text ? result.text.substring(0, 50) : 'null'}...`);

            return result;

        } catch (error) {
            console.error('Failed to convert Openclaw message to Wildfire:', error.message);
            return null;
        }
    }

    /**
     * 提取消息内容
     */
    extractTextContent(data) {
        if (!data.payload) {
            return null;
        }

        const type = data.payload.type;
        const payload = data.payload;
        const extraJson = this.parseExtraJson(payload.extra);

        switch (type) {
            case 1:
                // 文本消息
                return payload.searchableContent;

            case 2: {
                // 语音消息
                const voiceUrl = this.extractMediaUrl(payload);
                const duration = this.getIntFromExtra(extraJson, 'duration', 0);
                return `[语音消息] 时长:${duration}秒 URL:${voiceUrl || '未知'}`;
            }

            case 3: {
                // 图片消息
                const imageUrl = this.extractMediaUrl(payload);
                const imageDesc = payload.searchableContent || '图片';
                return `[图片消息] ${imageDesc} URL:${imageUrl || '未知'}`;
            }

            case 4: {
                // 视频消息
                const videoUrl = this.extractMediaUrl(payload);
                const hasThumbnail = this.hasExtraField(extraJson, 'thumbnail');
                const videoDuration = this.getIntFromExtra(extraJson, 'duration', 0);
                return `[视频消息] 时长:${videoDuration}秒 ${hasThumbnail ? '有缩略图' : '无缩略图'} URL:${videoUrl || '未知'}`;
            }

            case 5: {
                // 文件消息
                const fileUrl = this.extractMediaUrl(payload);
                const fileName = payload.searchableContent || '未知文件';
                const fileSize = this.getLongFromExtra(extraJson, 'size', 0);
                return `[文件消息] ${fileName} 大小:${this.formatFileSize(fileSize)} URL:${fileUrl || '未知'}`;
            }

            case 0:
                // 未知类型
                return null;

            default:
                console.debug('Unknown message type:', type);
                return `[消息类型:${type}] ${payload.searchableContent || ''}`;
        }
    }

    /**
     * 解析 extra 字段为 JSON 对象
     */
    parseExtraJson(extra) {
        if (!extra) {
            return null;
        }
        try {
            return JSON.parse(extra);
        } catch (e) {
            return null;
        }
    }

    /**
     * 从 extra JSON 中获取 int 值
     */
    getIntFromExtra(extraJson, field, defaultValue) {
        if (extraJson && extraJson[field] !== undefined) {
            try {
                return parseInt(extraJson[field], 10);
            } catch (e) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    /**
     * 从 extra JSON 中获取 long 值
     */
    getLongFromExtra(extraJson, field, defaultValue) {
        return this.getIntFromExtra(extraJson, field, defaultValue);
    }

    /**
     * 检查 extra JSON 中是否存在字段
     */
    hasExtraField(extraJson, field) {
        return extraJson && extraJson[field] !== undefined;
    }

    /**
     * 从 payload 中提取媒体 URL
     */
    extractMediaUrl(payload) {
        // 首先尝试使用 remoteMediaUrl 字段
        if (payload.remoteMediaUrl) {
            return payload.remoteMediaUrl;
        }

        // 回退：尝试从 extra JSON 中获取 url 字段
        const extraJson = this.parseExtraJson(payload.extra);
        if (extraJson && extraJson.url) {
            return extraJson.url;
        }

        // 回退：尝试从 extra 字符串中获取
        if (payload.extra && (payload.extra.startsWith('http://') || payload.extra.startsWith('https://'))) {
            return payload.extra;
        }

        return null;
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(size) {
        if (size <= 0) return '未知';
        if (size < 1024) return size + 'B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(2) + 'KB';
        if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + 'MB';
        return (size / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
    }

    /**
     * 检测消息中的媒体信息
     */
    detectMediaInfo(data) {
        if (!data.payload) {
            return null;
        }

        const type = data.payload.type;
        const mediaUrl = this.extractMediaUrl(data.payload);

        if (!mediaUrl) {
            return null;
        }

        switch (type) {
            case 2: // 语音
                return { url: mediaUrl, type: 'audio' };
            case 3: // 图片
                return { url: mediaUrl, type: 'image' };
            case 4: // 视频
                return { url: mediaUrl, type: 'video' };
            case 5: // 文件
                return { url: mediaUrl, type: 'file' };
            default:
                return null;
        }
    }

    /**
     * 提取@提及信息
     */
    extractMentions(data) {
        const mentions = [];
        // 暂时不实现提及检测
        return mentions;
    }

    /**
     * 生成会话ID
     */
    generateSessionId(threadId, peerId) {
        return `${threadId}:${peerId}`;
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
