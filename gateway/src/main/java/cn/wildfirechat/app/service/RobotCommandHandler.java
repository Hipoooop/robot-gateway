package cn.wildfirechat.app.service;

import cn.wildfirechat.app.config.BotFatherConfig;
import cn.wildfirechat.common.ErrorCode;
import cn.wildfirechat.pojos.InputOutputUserInfo;
import cn.wildfirechat.pojos.OutputRobot;
import cn.wildfirechat.pojos.OutputStringList;
import cn.wildfirechat.sdk.UserAdmin;
import cn.wildfirechat.sdk.model.IMResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * RobotFather 命令处理器
 * 处理用户发送的机器人管理命令
 */
@Component
public class RobotCommandHandler {
    private static final Logger LOG = LoggerFactory.getLogger(RobotCommandHandler.class);

    @Autowired
    private RobotFatherService robotFatherService;

    @Autowired
    private BotFatherConfig botFatherConfig;

    /**
     * 处理机器人管理命令
     * @param userId 用户ID
     * @param command 命令内容
     * @return 处理结果消息
     */
    public String handleCommand(String userId, String command) {
        try {
            command = command.trim();
            LOG.info("Handling robot command for user: {}, command: {}", userId, command);

            // Help命令
            if (command.equals("/help")) {
                return getHelpMessage();
            }

            // Create命令
            if (command.equals("/create")) {
                return handleCreate(userId);
            }

            // ========== 移除了 /create <callback_url> 命令支持 ==========
            // 用户无法自定义回调地址，回调地址由系统配置统一管理
            // ==========================================================

            // Info命令
            if (command.equals("/info") || command.equals("/my")) {
                return handleInfo(userId);
            }

            // List命令
            if (command.equals("/list")) {
                return handleList(userId);
            }

            // Delete命令
            if (command.equals("/delete")) {
                return handleDelete(userId);
            }

            // Reset命令 - 重置机器人密钥
            if (command.equals("/reset")) {
                return handleReset(userId);
            }

            // Update命令
            if (command.startsWith("/update ")) {
                return handleUpdate(userId, command.substring(7).trim());
            }

            // 未知命令
            return "❌ 未知命令：\n" + command + "\n\n发送 /help 查看所有可用命令";

        } catch (Exception e) {
            LOG.error("Error handling command: {} for user: {}", command, userId, e);
            return "❌ 处理命令时发生错误：" + e.getMessage();
        }
    }

    /**
     * 获取帮助信息
     */
    private String getHelpMessage() {
        return "🤖 机器人管理命令帮助\n" +
                "━━━━━━━━━━━━━━━━━━━\n" +
                "📋 命令列表：\n\n" +
                "📌 /create - 创建机器人\n" +
                "   创建新机器人或获取已有机器人信息\n\n" +
                "📌 /info - 查看机器人信息\n" +
                "   查看当前机器人的详细信息\n\n" +
                "📌 /list - 列出所有机器人\n" +
                "   显示您拥有的所有机器人\n\n" +
                "📌 /delete - 删除机器人\n" +
                "   删除当前机器人\n\n" +
                "📌 /reset - 重置密钥\n" +
                "   重置机器人的密钥（重置后旧密钥将失效）\n\n" +
                "📌 /update name <名称> - 更新名称\n" +
                "   修改机器人的显示名称\n\n" +
                "📌 /update portrait <URL> - 更新头像\n" +
                "   修改机器人的头像URL\n\n" +
                "📌 /help - 显示帮助信息\n" +
                "   显示本帮助内容\n\n" +
                "💡 提示：回调地址由系统统一配置，创建后不可修改";
    }

    /**
     * 创建或获取机器人
     */
    private String handleCreate(String userId) {
        RobotFatherService.RobotInfo robotInfo = robotFatherService.getOrCreateRobot(userId);
        if (robotInfo == null) {
            return "❌ 创建机器人失败，请稍后重试";
        }

        String publicAddr = botFatherConfig.getPublicAddr();
        if (publicAddr == null || publicAddr.isEmpty()) {
            LOG.error("BotFather public address is not configured");
            return "❌ 系统配置错误，请联系管理员";
        }

        return "🤖 您的机器人信息：\n" +
                "━━━━━━━━━━━━━━━\n" +
                "🆔 机器人ID: " + robotInfo.getRobotId() + "\n" +
                "🔑 密钥: " + robotInfo.getRobotSecret() + "\n" +
                "🌐 网关地址: " + publicAddr + "\n\n" +
                "📌 使用机器人ID和密钥连接到网关地址";
    }

    /**
     * 查看机器人信息
     */
    private String handleInfo(String userId) {
        RobotFatherService.RobotInfo robotInfo = robotFatherService.getUserCurrentRobot(userId);
        if (robotInfo == null) {
            return "💡 您还没有机器人\n\n发送 /create 创建一个";
        }

        // 获取详细信息
        try {
            IMResult<OutputRobot> result = UserAdmin.getRobotInfo(robotInfo.getRobotId());
            if (result != null && result.getErrorCode() == ErrorCode.ERROR_CODE_SUCCESS) {
                OutputRobot robot = result.getResult();
                if (robot != null) {
                    return "🤖 机器人详细信息：\n" +
                            "━━━━━━━━━━━━━━━\n" +
                            "🆔 ID: " + robot.getUserId() + "\n" +
                            "🔑 密钥: " + robotInfo.getRobotSecret() + "\n" +
                            "👤 名称: " + (robot.getDisplayName() != null ? robot.getDisplayName() : "未设置") + "\n" +
                            "🖼️ 头像: " + (robot.getPortrait() != null ? robot.getPortrait() : "未设置") + "\n" +
                            "👤 拥有者: " + robot.getOwner() + "\n" +
                            "📝 备注: " + (robot.getRobotExtra() != null ? robot.getRobotExtra() : "无");
                }
            }
        } catch (Exception e) {
            LOG.error("Failed to get robot info", e);
        }

        return "🤖 机器人基本信息：\n" +
                "━━━━━━━━━━━━━━━\n" +
                "🆔 ID: " + robotInfo.getRobotId() + "\n" +
                "🔑 密钥: " + robotInfo.getRobotSecret();
    }

    /**
     * 列出所有机器人
     */
    private String handleList(String userId) {
        try {
            IMResult<OutputStringList> result = UserAdmin.getUserRobots(userId);
            if (result != null && result.getErrorCode() == ErrorCode.ERROR_CODE_SUCCESS) {
                OutputStringList robotList = result.getResult();
                if (robotList != null && robotList.getList() != null && !robotList.getList().isEmpty()) {
                    StringBuilder sb = new StringBuilder("🤖 您的机器人列表：\n");
                    sb.append("━━━━━━━━━━━━━━━\n");
                    java.util.List<String> robots = robotList.getList();
                    for (int i = 0; i < robots.size(); i++) {
                        sb.append((i + 1)).append(". ").append(robots.get(i)).append("\n");
                    }
                    sb.append("\n💡 共 ").append(robots.size()).append(" 个机器人");
                    return sb.toString();
                }
            }

            return "💡 您还没有机器人\n\n发送 /create 创建一个";

        } catch (Exception e) {
            LOG.error("Failed to list robots for user: {}", userId, e);
            return "❌ 获取机器人列表失败：" + e.getMessage();
        }
    }

    /**
     * 删除机器人
     */
    private String handleDelete(String userId) {
        RobotFatherService.RobotInfo robotInfo = robotFatherService.getUserCurrentRobot(userId);
        if (robotInfo == null) {
            return "💡 您还没有机器人";
        }

        try {
            IMResult<Void> result = UserAdmin.destroyRobot(robotInfo.getRobotId());
            if (result != null && result.getErrorCode() == ErrorCode.ERROR_CODE_SUCCESS) {
                // 清除缓存
                robotFatherService.clearUserCache(userId);
                return "✅ 机器人已删除\n\n机器人ID: " + robotInfo.getRobotId();
            } else {
                return "❌ 删除失败\n错误码: " + (result != null ? result.getCode() : "未知");
            }
        } catch (Exception e) {
            LOG.error("Failed to delete robot for user: {}", userId, e);
            return "❌ 删除机器人失败：" + e.getMessage();
        }
    }

    /**
     * 更新机器人信息
     */
    private String handleUpdate(String userId, String params) {
        RobotFatherService.RobotInfo robotInfo = robotFatherService.getUserCurrentRobot(userId);
        if (robotInfo == null) {
            return "💡 您还没有机器人\n\n发送 /create 创建一个";
        }

        String[] parts = params.split("\\s+", 2);
        if (parts.length < 2) {
            return "❌ 命令格式错误\n\n" +
                    "正确格式：\n" +
                    "/update name <名称>\n" +
                    "/update portrait <URL>";
        }

        String type = parts[0];
        String value = parts[1];

        try {
            // 构建用户信息对象
            InputOutputUserInfo userInfo = new InputOutputUserInfo();
            userInfo.setUserId(robotInfo.getRobotId());

            int updateType;
            switch (type) {
                case "name":
                    userInfo.setDisplayName(value);
                    updateType = 1; // 更新类型：1=修改昵称
                    break;
                case "portrait":
                    userInfo.setPortrait(value);
                    updateType = 2; // 更新类型：2=修改头像
                    break;
                case "extra":
                    userInfo.setExtra(value);
                    updateType = 4; // 更新类型：4=修改额外信息
                    break;
                default:
                    return "❌ 不支持的更新类型: " + type + "\n\n支持的类型：name, portrait, extra";
            }

            IMResult<Void> result = UserAdmin.updateUserInfo(userInfo, updateType);
            if (result != null && result.getErrorCode() == ErrorCode.ERROR_CODE_SUCCESS) {
                String typeName = type.equals("name") ? "名称" : (type.equals("portrait") ? "头像" : "备注");
                return "✅ 更新成功\n\n" + typeName + ": " + value;
            } else {
                return "❌ 更新失败\n错误码: " + (result != null ? result.getCode() : "未知");
            }
        } catch (Exception e) {
            LOG.error("Failed to update robot for user: {}", userId, e);
            return "❌ 更新失败：" + e.getMessage();
        }
    }

    /**
     * 重置机器人密钥
     */
    private String handleReset(String userId) {
        RobotFatherService.RobotInfo robotInfo = robotFatherService.getUserCurrentRobot(userId);
        if (robotInfo == null) {
            return "💡 您还没有机器人\n\n发送 /create 创建一个";
        }

        RobotFatherService.RobotInfo newInfo = robotFatherService.resetRobotSecret(userId);
        if (newInfo == null) {
            return "❌ 重置密钥失败，请稍后重试";
        }

        return "✅ 密钥已重置\n" +
                "━━━━━━━━━━━━━━━\n" +
                "🆔 机器人ID: " + newInfo.getRobotId() + "\n" +
                "🔑 新密钥: " + newInfo.getRobotSecret() + "\n\n" +
                "⚠️ 注意：旧密钥已失效，请使用新密钥连接机器人";
    }
}
