import { ConnectionManager } from './ConnectionManager.js';
import { IMResult } from '@wildfirechat/server-sdk';
import { RequestMessage } from './protocol/RequestMessage.js';

/**
 * RobotService 客户端
 * 提供与 Java 版 RobotService 相同的 API
 * 
 * 注意：使用 @../server-sdk.js 中的模型类（Conversation, MessagePayload 等）
 */
export class RobotServiceClient {
    /**
     * 创建客户端实例
     * @param {string} gatewayUrl - 网关地址，如 'ws://localhost:8884/robot/gateway'
     * @param {MessageHandler} messageHandler - 消息处理器
     * @param {Object} options - 配置选项
     * @param {number} options.timeout - 请求超时时间（秒），默认 30
     * @param {number} options.reconnectInterval - 重连间隔（毫秒），默认 5000
     * @param {number} options.heartbeatInterval - 心跳间隔（毫秒），默认 270000
     */
    constructor(gatewayUrl, messageHandler = null, options = {}) {
        this.gatewayUrl = gatewayUrl;
        this.messageHandler = messageHandler;
        this.options = options;
        
        this.connectionManager = new ConnectionManager(gatewayUrl, messageHandler, options);
    }

    /**
     * 连接并鉴权
     * @param {string} robotId - 机器人ID
     * @param {string} robotSecret - 机器人密钥
     * @param {number} timeoutSeconds - 超时时间（秒）
     * @returns {Promise<boolean>} - 是否成功
     */
    async connect(robotId, robotSecret, timeoutSeconds = 30) {
        return this.connectionManager.connect(robotId, robotSecret, timeoutSeconds);
    }

    /**
     * 断开连接
     */
    close() {
        this.connectionManager.disconnect();
    }

    /**
     * 是否已连接
     */
    isConnected() {
        return this.connectionManager.isConnected();
    }

    /**
     * 是否已鉴权
     */
    isAuthenticated() {
        return this.connectionManager.isAuthenticated();
    }

    /**
     * 发送请求并包装为 IMResult
     * @param {string} method - 方法名
     * @param {Array} params - 参数数组
     * @returns {Promise<IMResult>} - IMResult 对象
     */
    async invoke(method, params = []) {
        const client = this.connectionManager.getClient();
        if (!client) {
            return new IMResult(-1, 'Not connected', null);
        }

        try {
            const response = await client.sendRequest(method, params);
            return new IMResult(response.code, response.msg, response.result);
        } catch (error) {
            return new IMResult(-1, error.message, null);
        }
    }

    // ==================== 消息相关 API ====================

    /**
     * 发送消息
     * @param {string} fromUser - 发送者用户ID
     * @param {Conversation} conversation - 会话对象
     * @param {MessagePayload} payload - 消息内容
     * @returns {Promise<IMResult>}
     */
    async sendMessage(fromUser, conversation, payload) {
        return this.invoke('sendMessage', [fromUser, conversation, payload]);
    }

    /**
     * 回复消息
     * @param {string} fromUser - 发送者用户ID
     * @param {Object} message - 原消息对象
     * @param {MessagePayload} payload - 回复内容
     * @returns {Promise<IMResult>}
     */
    async replyMessage(fromUser, message, payload) {
        return this.invoke('replyMessage', [fromUser, message, payload]);
    }

    /**
     * 撤回消息
     * @param {string} fromUser - 操作者用户ID
     * @param {number} messageId - 消息ID
     * @returns {Promise<IMResult>}
     */
    async recallMessage(fromUser, messageId) {
        return this.invoke('recallMessage', [fromUser, messageId]);
    }

    /**
     * 更新消息
     * @param {string} fromUser - 操作者用户ID
     * @param {number} messageId - 消息ID
     * @param {MessagePayload} payload - 新消息内容
     * @returns {Promise<IMResult>}
     */
    async updateMessage(fromUser, messageId, payload) {
        return this.invoke('updateMessage', [fromUser, messageId, payload]);
    }

    // ==================== 用户相关 API ====================

    /**
     * 获取用户信息
     * @param {string} userId - 用户ID
     * @returns {Promise<IMResult>}
     */
    async getUserInfo(userId) {
        return this.invoke('getUserInfo', [userId]);
    }

    /**
     * 通过手机号获取用户
     * @param {string} mobile - 手机号
     * @param {string} areaCode - 区号
     * @returns {Promise<IMResult>}
     */
    async getUserInfoByMobile(mobile, areaCode = '86') {
        return this.invoke('getUserInfoByMobile', [mobile, areaCode]);
    }

    /**
     * 通过用户名获取用户
     * @param {string} name - 用户名
     * @returns {Promise<IMResult>}
     */
    async getUserInfoByName(name) {
        return this.invoke('getUserInfoByName', [name]);
    }

    /**
     * 应用获取用户信息
     * @param {string} applicationId - 应用ID
     * @param {string} userId - 用户ID
     * @returns {Promise<IMResult>}
     */
    async applicationGetUserInfo(applicationId, userId) {
        return this.invoke('applicationGetUserInfo', [applicationId, userId]);
    }

    // ==================== 群组相关 API ====================

    /**
     * 创建群组
     * @param {Object} groupInfo - 群组信息
     * @param {Array} members - 成员列表
     * @param {Array} lines - 会话线路
     * @param {MessagePayload} notifyMessage - 通知消息
     * @returns {Promise<IMResult>}
     */
    async createGroup(groupInfo, members, lines = [0], notifyMessage = null) {
        return this.invoke('createGroup', [groupInfo, members, lines, notifyMessage]);
    }

    /**
     * 获取群组信息
     * @param {string} groupId - 群组ID
     * @param {number} updateDt - 更新时间
     * @returns {Promise<IMResult>}
     */
    async getGroupInfo(groupId, updateDt = 0) {
        return this.invoke('getGroupInfo', [groupId, updateDt]);
    }

    /**
     * 解散群组
     * @param {string} groupId - 群组ID
     * @returns {Promise<IMResult>}
     */
    async dismissGroup(groupId) {
        return this.invoke('dismissGroup', [groupId]);
    }

    /**
     * 转让群组
     * @param {string} groupId - 群组ID
     * @param {string} newOwner - 新群主用户ID
     * @returns {Promise<IMResult>}
     */
    async transferGroup(groupId, newOwner) {
        return this.invoke('transferGroup', [groupId, newOwner]);
    }

    /**
     * 修改群组信息
     * @param {string} groupId - 群组ID
     * @param {number} modifyType - 修改类型
     * @param {string} value - 新值
     * @returns {Promise<IMResult>}
     */
    async modifyGroupInfo(groupId, modifyType, value) {
        return this.invoke('modifyGroupInfo', [groupId, modifyType, value]);
    }

    /**
     * 获取群组成员
     * @param {string} groupId - 群组ID
     * @param {number} updateDt - 更新时间
     * @returns {Promise<IMResult>}
     */
    async getGroupMembers(groupId, updateDt = 0) {
        return this.invoke('getGroupMembers', [groupId, updateDt]);
    }

    /**
     * 获取指定群成员信息
     * @param {string} groupId - 群组ID
     * @param {string} userId - 用户ID
     * @returns {Promise<IMResult>}
     */
    async getGroupMember(groupId, userId) {
        return this.invoke('getGroupMember', [groupId, userId]);
    }

    /**
     * 添加群成员
     * @param {string} groupId - 群组ID
     * @param {Array} members - 成员列表
     * @param {Array} lines - 会话线路
     * @param {MessagePayload} notifyMessage - 通知消息
     * @returns {Promise<IMResult>}
     */
    async addGroupMembers(groupId, members, lines = [0], notifyMessage = null) {
        return this.invoke('addGroupMembers', [groupId, members, lines, notifyMessage]);
    }

    /**
     * 踢出群成员
     * @param {string} groupId - 群组ID
     * @param {Array} memberIds - 成员ID列表
     * @param {Array} lines - 会话线路
     * @param {MessagePayload} notifyMessage - 通知消息
     * @returns {Promise<IMResult>}
     */
    async kickoffGroupMembers(groupId, memberIds, lines = [0], notifyMessage = null) {
        return this.invoke('kickoffGroupMembers', [groupId, memberIds, lines, notifyMessage]);
    }

    /**
     * 退出群组
     * @param {string} groupId - 群组ID
     * @param {Array} lines - 会话线路
     * @param {MessagePayload} notifyMessage - 通知消息
     * @returns {Promise<IMResult>}
     */
    async quitGroup(groupId, lines = [0], notifyMessage = null) {
        return this.invoke('quitGroup', [groupId, lines, notifyMessage]);
    }

    /**
     * 设置群管理员
     * @param {string} groupId - 群组ID
     * @param {Array} managers - 管理员ID列表
     * @param {number} type - 操作类型：0 取消，1 设置
     * @returns {Promise<IMResult>}
     */
    async setGroupManager(groupId, managers, type) {
        return this.invoke('setGroupManager', [groupId, managers, type]);
    }

    /**
     * 禁言群成员
     * @param {string} groupId - 群组ID
     * @param {Array} members - 成员ID列表
     * @param {number} type - 操作类型：0 取消禁言，1 禁言
     * @param {number} time - 禁言时长（毫秒）
     * @returns {Promise<IMResult>}
     */
    async muteGroupMember(groupId, members, type, time = 0) {
        return this.invoke('muteGroupMember', [groupId, members, type, time]);
    }

    /**
     * 允许群成员发言
     * @param {string} groupId - 群组ID
     * @param {Array} members - 成员ID列表
     * @param {number} type - 操作类型
     * @returns {Promise<IMResult>}
     */
    async allowGroupMember(groupId, members, type) {
        return this.invoke('allowGroupMember', [groupId, members, type]);
    }

    /**
     * 设置群成员别名
     * @param {string} groupId - 群组ID
     * @param {string} userId - 用户ID
     * @param {string} alias - 别名
     * @returns {Promise<IMResult>}
     */
    async setGroupMemberAlias(groupId, userId, alias) {
        return this.invoke('setGroupMemberAlias', [groupId, userId, alias]);
    }

    // ==================== 机器人资料 API ====================

    /**
     * 获取机器人资料
     * @returns {Promise<IMResult>}
     */
    async getProfile() {
        return this.invoke('getProfile', []);
    }

    /**
     * 更新机器人资料
     * @param {Object} profile - 机器人资料
     * @returns {Promise<IMResult>}
     */
    async updateProfile(profile) {
        return this.invoke('updateProfile', [profile]);
    }

    /**
     * 设置回调地址
     * @param {string} url - 回调地址
     * @returns {Promise<IMResult>}
     */
    async setCallback(url) {
        return this.invoke('setCallback', [url]);
    }

    /**
     * 获取回调地址
     * @returns {Promise<IMResult>}
     */
    async getCallback() {
        return this.invoke('getCallback', []);
    }

    // ==================== 会话相关 API ====================

    /**
     * 获取会话信息
     * @param {Conversation} conversation - 会话对象
     * @returns {Promise<IMResult>}
     */
    async getConversationInfo(conversation) {
        return this.invoke('getConversationInfo', [conversation]);
    }

    /**
     * 获取会话列表
     * @param {string} userId - 用户ID
     * @param {number} line - 会话线路
     * @returns {Promise<IMResult>}
     */
    async getUserConversations(userId, line = 0) {
        return this.invoke('getUserConversations', [userId, line]);
    }

    // ==================== 文件上传相关 API ====================

    /**
     * 获取预签名上传URL
     * @param {string} fileName - 文件名
     * @param {number} size - 文件大小
     * @param {string} mediaType - 媒体类型
     * @returns {Promise<IMResult<OutputPresignedUploadUrl>>}
     */
    async getPresignedUploadUrl(fileName, size, mediaType) {
        return this.invoke('getPresignedUploadUrl', [fileName, size, mediaType]);
    }

    /**
     * 上传文件（支持七牛云和其他对象存储）
     * @param {Buffer|Blob|File} fileData - 文件数据
     * @param {string} fileName - 文件名
     * @param {number} type - 文件类型，默认4
     * @param {string} mediaType - 媒体类型，自动根据文件名推断
     * @returns {Promise<IMResult<string>>} - 上传后的下载URL
     */
    async uploadFile(fileData, fileName, type = 4, mediaType = null) {
        // 如果mediaType为空，根据文件名推断
        if (!mediaType) {
            mediaType = this.getContentTypeByFileName(fileName);
        }

        // 获取文件大小
        let fileSize;
        if (fileData instanceof Buffer) {
            fileSize = fileData.length;
        } else if (fileData instanceof Blob || fileData instanceof File) {
            fileSize = fileData.size;
        } else if (typeof fileData === 'string') {
            fileSize = Buffer.byteLength(fileData, 'utf8');
        } else {
            return new IMResult(-1, '不支持的文件数据类型', null);
        }

        // 1. 获取预签名上传URL
        const presignedResult = await this.getPresignedUploadUrl(fileName, fileSize, mediaType);
        if (!presignedResult.isSuccess()) {
            return new IMResult(presignedResult.code, presignedResult.msg, null);
        }

        const presignedUrl = presignedResult.result;
        if (!presignedUrl || !presignedUrl.uploadUrl) {
            return new IMResult(-1, '获取上传URL失败', null);
        }

        // 2. 根据存储类型选择上传方式
        if (presignedUrl.type === 1) {
            // 七牛云上传
            return this.uploadToQiniu(presignedUrl, fileData, fileName, mediaType);
        } else {
            // 其他存储（S3/OSS等）
            return this.uploadToOther(presignedUrl, fileData, mediaType);
        }
    }

    /**
     * 上传到七牛云
     * 使用multipart/form-data格式
     * @param {OutputPresignedUploadUrl} presignedUrl - 预签名URL信息
     * @param {Buffer|Blob|File} fileData - 文件数据
     * @param {string} fileName - 文件名
     * @param {string} mediaType - 媒体类型
     * @returns {Promise<IMResult<string>>}
     */
    async uploadToQiniu(presignedUrl, fileData, fileName, mediaType) {
        const uploadUrl = presignedUrl.uploadUrl;

        // 解析URL：格式为 "http://host?token?key"
        const firstQuestion = uploadUrl.indexOf('?');
        const secondQuestion = uploadUrl.indexOf('?', firstQuestion + 1);

        if (firstQuestion === -1 || secondQuestion === -1) {
            return new IMResult(-1, '七牛云上传地址格式错误', null);
        }

        const serverUrl = uploadUrl.substring(0, firstQuestion);
        const token = uploadUrl.substring(firstQuestion + 1, secondQuestion);
        const key = uploadUrl.substring(secondQuestion + 1);

        try {
            // 构建FormData
            const formData = new FormData();
            formData.append('token', token);
            formData.append('key', key);
            
            // 处理文件数据
            let blob;
            if (fileData instanceof Buffer) {
                blob = new Blob([fileData], { type: mediaType });
            } else if (fileData instanceof Blob || fileData instanceof File) {
                blob = fileData;
            } else {
                blob = new Blob([fileData], { type: mediaType });
            }
            formData.append('file', blob, fileName);

            // Node.js 环境使用 node-fetch 或 axios
            let response;
            if (typeof fetch !== 'undefined') {
                // 浏览器环境
                response = await fetch(serverUrl, {
                    method: 'POST',
                    body: formData
                });
            } else {
                // Node.js 环境，需要动态导入 node-fetch
                const { default: fetch } = await import('node-fetch');
                const FormData = (await import('form-data')).default;
                const nodeFormData = new FormData();
                nodeFormData.append('token', token);
                nodeFormData.append('key', key);
                nodeFormData.append('file', fileData, { filename: fileName, contentType: mediaType });
                
                response = await fetch(serverUrl, {
                    method: 'POST',
                    body: nodeFormData
                });
            }

            if (response.ok || response.status === 200) {
                return new IMResult(0, 'success', presignedUrl.downloadUrl);
            } else {
                return new IMResult(-1, `文件上传到七牛云失败，HTTP状态码: ${response.status}`, null);
            }
        } catch (error) {
            return new IMResult(-1, `上传文件失败: ${error.message}`, null);
        }
    }

    /**
     * 上传到通用存储（S3/OSS等）
     * 使用HTTP PUT直接上传
     * @param {OutputPresignedUploadUrl} presignedUrl - 预签名URL信息
     * @param {Buffer|Blob|File} fileData - 文件数据
     * @param {string} mediaType - 媒体类型
     * @returns {Promise<IMResult<string>>}
     */
    async uploadToOther(presignedUrl, fileData, mediaType) {
        try {
            // 准备请求体
            let body;
            if (fileData instanceof Buffer) {
                body = fileData;
            } else if (fileData instanceof Blob || fileData instanceof File) {
                body = fileData;
            } else {
                body = Buffer.from(fileData);
            }

            // 使用主上传URL
            let response;
            if (typeof fetch !== 'undefined') {
                response = await fetch(presignedUrl.uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': mediaType
                    },
                    body: body
                });
            } else {
                const { default: fetch } = await import('node-fetch');
                response = await fetch(presignedUrl.uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': mediaType
                    },
                    body: body
                });
            }

            if (response.ok || (response.status >= 200 && response.status < 300)) {
                return new IMResult(0, 'success', presignedUrl.downloadUrl);
            }

            // 主URL失败，尝试备用URL
            if (presignedUrl.backupUploadUrl) {
                if (typeof fetch !== 'undefined') {
                    response = await fetch(presignedUrl.backupUploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': mediaType
                        },
                        body: body
                    });
                } else {
                    const { default: fetch } = await import('node-fetch');
                    response = await fetch(presignedUrl.backupUploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': mediaType
                        },
                        body: body
                    });
                }

                if (response.ok || (response.status >= 200 && response.status < 300)) {
                    return new IMResult(0, 'success', presignedUrl.downloadUrl);
                }
            }

            return new IMResult(-1, `上传文件失败，HTTP状态码: ${response.status}`, null);
        } catch (error) {
            return new IMResult(-1, `上传文件失败: ${error.message}`, null);
        }
    }

    /**
     * 根据文件名获取Content-Type
     * @param {string} fileName - 文件名
     * @returns {string} - Content-Type
     */
    getContentTypeByFileName(fileName) {
        if (!fileName) {
            return 'application/octet-stream';
        }

        const lowerCaseName = fileName.toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.txt': 'text/plain',
            '.zip': 'application/zip',
            '.tar': 'application/x-tar',
            '.gz': 'application/gzip'
        };

        for (const [ext, mimeType] of Object.entries(mimeTypes)) {
            if (lowerCaseName.endsWith(ext)) {
                return mimeType;
            }
        }

        return 'application/octet-stream';
    }
}

/**
 * OutputPresignedUploadUrl 预签名上传URL结果
 */
export class OutputPresignedUploadUrl {
    constructor(data = {}) {
        /** 存储类型：1=七牛云，其他=通用S3/OSS */
        this.type = data.type || 0;
        /** 上传URL */
        this.uploadUrl = data.uploadUrl || '';
        /** 备用上传URL */
        this.backupUploadUrl = data.backupUploadUrl || '';
        /** 下载URL */
        this.downloadUrl = data.downloadUrl || '';
    }
}
