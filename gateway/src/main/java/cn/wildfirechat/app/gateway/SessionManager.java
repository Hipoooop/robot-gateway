package cn.wildfirechat.app.gateway;

import cn.wildfirechat.sdk.RobotService;
import com.google.gson.Gson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * WebSocket会话管理器
 * 管理所有连接的客户端会话，支持鉴权和多机器人实例
 */
@Component
public class SessionManager {
    private static final Logger LOG = LoggerFactory.getLogger(SessionManager.class);

    private final Gson gson = new Gson();

    /**
     * 存储所有活跃的WebSocket会话
     * key: sessionId
     * value: WebSocketSession
     */
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    /**
     * 会话信息
     * key: sessionId
     * value: SessionInfo (包含鉴权状态、机器人ID、RobotService实例)
     */
    private final Map<String, SessionInfo> sessionInfos = new ConcurrentHashMap<>();

    /**
     * 机器人ID到sessionId集合的映射（支持一个机器人多个连接）
     * key: robotId
     * value: sessionId集合
     */
    private final Map<String, Set<String>> robotSessionMap = new ConcurrentHashMap<>();

    // 心跳超时时间（毫秒）- 5分钟
    private static final long HEARTBEAT_TIMEOUT = 5 * 60 * 1000;

    @PostConstruct
    public void init() {
        LOG.info("SessionManager initialized");
    }

    /**
     * 添加会话（未鉴权状态）
     */
    public void addSession(WebSocketSession session) {
        String sessionId = session.getId();
        sessions.put(sessionId, session);
        sessionInfos.put(sessionId, new SessionInfo(sessionId));
        LOG.info("Session added: {}, total sessions: {}", sessionId, sessions.size());
    }

    /**
     * 移除会话
     */
    public void removeSession(WebSocketSession session) {
        removeSessionById(session.getId());
    }

    /**
     * 通过sessionId移除会话（内部使用）
     */
    private void removeSessionById(String sessionId) {
        SessionInfo info = sessionInfos.remove(sessionId);
        WebSocketSession session = sessions.remove(sessionId);

        if (info != null) {
            // 从robotSessionMap中移除
            if (info.getRobotId() != null) {
                Set<String> robotSessions = robotSessionMap.get(info.getRobotId());
                if (robotSessions != null) {
                    robotSessions.remove(sessionId);
                    if (robotSessions.isEmpty()) {
                        robotSessionMap.remove(info.getRobotId());
                    }
                }
            }

            // 关闭RobotService实例
            if (info.getRobotService() != null) {
                try {
                    info.getRobotService().close();
                } catch (Exception e) {
                    LOG.error("Failed to close robot service: {}", e.getMessage());
                }
            }
        }

        // 关闭WebSocket连接（如果还在打开状态）
        if (session != null && session.isOpen()) {
            try {
                session.close();
            } catch (IOException e) {
                LOG.error("Failed to close session {}: {}", sessionId, e.getMessage());
            }
        }

        LOG.info("Session removed: {}, total sessions: {}", sessionId, sessions.size());
    }

    /**
     * 鉴权会话
     * @return 鉴权是否成功
     */
    public boolean authenticateSession(String sessionId, String robotId, RobotService robotService) {
        SessionInfo info = sessionInfos.get(sessionId);
        if (info == null) {
            LOG.warn("Session {} not found for authentication", sessionId);
            return false;
        }

        info.setAuthenticated(true);
        info.setRobotId(robotId);
        info.setRobotService(robotService);

        // 更新robotSessionMap
        robotSessionMap.computeIfAbsent(robotId, k -> new CopyOnWriteArraySet<>()).add(sessionId);

        LOG.info("Session {} authenticated as robot {}, total connections for this robot: {}", 
                sessionId, robotId, robotSessionMap.get(robotId).size());
        return true;
    }

    /**
     * 检查会话是否已鉴权
     */
    public boolean isAuthenticated(String sessionId) {
        SessionInfo info = sessionInfos.get(sessionId);
        return info != null && info.isAuthenticated();
    }

    /**
     * 获取会话的机器人ID
     */
    public String getRobotId(String sessionId) {
        SessionInfo info = sessionInfos.get(sessionId);
        return info != null ? info.getRobotId() : null;
    }

    /**
     * 获取会话的RobotService实例
     */
    public RobotService getRobotService(String sessionId) {
        SessionInfo info = sessionInfos.get(sessionId);
        return info != null ? info.getRobotService() : null;
    }

    /**
     * 通过机器人ID获取会话（获取第一个可用会话）
     * 兼容旧代码，但建议优先使用 getSessionsByRobotId 获取所有会话
     */
    public WebSocketSession getSessionByRobotId(String robotId) {
        Set<String> sessionIds = robotSessionMap.get(robotId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            return null;
        }

        // 返回第一个有效的会话
        for (String sessionId : sessionIds) {
            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                return session;
            }
        }
        return null;
    }

    /**
     * 通过机器人ID获取所有会话（支持一个机器人多个连接）
     * @return 该机器人所有活跃的session集合
     */
    public Set<WebSocketSession> getSessionsByRobotId(String robotId) {
        Set<WebSocketSession> result = new java.util.HashSet<>();
        Set<String> sessionIds = robotSessionMap.get(robotId);
        if (sessionIds == null || sessionIds.isEmpty()) {
            return result;
        }

        for (String sessionId : sessionIds) {
            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                result.add(session);
            }
        }
        return result;
    }

    /**
     * 发送消息到指定会话
     */
    public boolean sendMessage(WebSocketSession session, Object message) {
        if (session != null && session.isOpen()) {
            try {
                String json = gson.toJson(message);
                session.sendMessage(new TextMessage(json));
                return true;
            } catch (IOException e) {
                LOG.error("Failed to send message to session {}: {}", session.getId(), e.getMessage());
                return false;
            }
        } else {
            LOG.error("Session is not opened");
        }
        return false;
    }

    /**
     * 发送消息到指定会话（通过sessionId）
     */
    public boolean sendMessage(String sessionId, Object message) {
        WebSocketSession session = sessions.get(sessionId);
        if (session != null) {
            return sendMessage(session, message);
        }
        LOG.warn("Session {} not found", sessionId);
        return false;
    }

    /**
     * 发送消息到指定机器人
     * 如果机器人有多个连接，消息会广播到所有连接
     */
    public boolean sendMessageToRobot(String robotId, Object message) {
        Set<WebSocketSession> sessions = getSessionsByRobotId(robotId);
        if (sessions.isEmpty()) {
            LOG.warn("Robot {} has no active sessions", robotId);
            return false;
        }

        boolean allSuccess = true;
        for (WebSocketSession session : sessions) {
            if (!sendMessage(session, message)) {
                allSuccess = false;
                // 发送失败，检查是否需要清理session
                if (!session.isOpen()) {
                    LOG.warn("Session {} is closed, scheduling cleanup", session.getId());
                    // 异步清理避免阻塞
                    new Thread(() -> removeSessionById(session.getId())).start();
                }
            }
        }
        return allSuccess;
    }

    /**
     * 获取当前会话数量
     */
    public int getSessionCount() {
        return sessions.size();
    }

    /**
     * 获取所有会话ID
     */
    public java.util.Set<String> getSessionIds() {
        return sessions.keySet();
    }

    /**
     * 检查会话是否存在
     */
    public boolean hasSession(String sessionId) {
        WebSocketSession session = sessions.get(sessionId);
        return session != null && session.isOpen();
    }

    /**
     * 关闭所有会话
     */
    public void closeAll() {
        for (WebSocketSession session : sessions.values()) {
            try {
                if (session.isOpen()) {
                    session.close();
                }
            } catch (IOException e) {
                LOG.error("Failed to close session {}: {}", session.getId(), e.getMessage());
            }
        }
        // 关闭所有RobotService实例
        for (SessionInfo info : sessionInfos.values()) {
            if (info.getRobotService() != null) {
                try {
                    info.getRobotService().close();
                } catch (Exception e) {
                    LOG.error("Failed to close robot service: {}", e.getMessage());
                }
            }
        }
        sessions.clear();
        sessionInfos.clear();
        LOG.info("All sessions closed");
    }

    /**
     * 会话信息
     */
    public static class SessionInfo {
        private final String sessionId;
        private boolean authenticated;
        private String robotId;
        private RobotService robotService;
        private volatile long lastHeartbeatTime;

        public SessionInfo(String sessionId) {
            this.sessionId = sessionId;
            this.authenticated = false;
            this.lastHeartbeatTime = System.currentTimeMillis();
        }

        public String getSessionId() {
            return sessionId;
        }

        public boolean isAuthenticated() {
            return authenticated;
        }

        public void setAuthenticated(boolean authenticated) {
            this.authenticated = authenticated;
        }

        public String getRobotId() {
            return robotId;
        }

        public void setRobotId(String robotId) {
            this.robotId = robotId;
        }

        public RobotService getRobotService() {
            return robotService;
        }

        public void setRobotService(RobotService robotService) {
            this.robotService = robotService;
        }

        public long getLastHeartbeatTime() {
            return lastHeartbeatTime;
        }

        public void updateHeartbeatTime() {
            this.lastHeartbeatTime = System.currentTimeMillis();
        }
    }

    /**
     * 通过会话ID获取机器人ID
     */
    public String getRobotIdBySession(String sessionId) {
        return getRobotId(sessionId);
    }

    /**
     * 更新心跳时间
     */
    public void updateHeartbeatTime(String sessionId) {
        SessionInfo info = sessionInfos.get(sessionId);
        if (info != null) {
            info.updateHeartbeatTime();
        }
    }

    /**
     * 获取会话的最后心跳时间
     */
    public long getLastHeartbeatTime(String sessionId) {
        SessionInfo info = sessionInfos.get(sessionId);
        return info != null ? info.getLastHeartbeatTime() : 0;
    }

    /**
     * 定时清理超时的心跳会话
     * 每30秒执行一次
     */
    @Scheduled(fixedRate = 30000)
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        int count = 0;

        for (Map.Entry<String, SessionInfo> entry : sessionInfos.entrySet()) {
            String sessionId = entry.getKey();
            SessionInfo info = entry.getValue();

            // 只检查已鉴权的会话
            if (info.isAuthenticated()) {
                long lastHeartbeat = info.getLastHeartbeatTime();
                if (now - lastHeartbeat > HEARTBEAT_TIMEOUT) {
                    LOG.warn("Session {} heartbeat timeout (last: {}s ago), removing", 
                            sessionId, (now - lastHeartbeat) / 1000);
                    removeSessionById(sessionId);
                    count++;
                }
            }
        }

        if (count > 0) {
            LOG.info("Cleaned up {} expired sessions, remaining: {}", count, sessions.size());
        }
    }

    /**
     * 获取指定机器人的连接数
     */
    public int getConnectionCount(String robotId) {
        Set<String> sessionIds = robotSessionMap.get(robotId);
        if (sessionIds == null) {
            return 0;
        }
        return (int) sessionIds.stream()
                .filter(sid -> {
                    WebSocketSession s = sessions.get(sid);
                    return s != null && s.isOpen();
                })
                .count();
    }
}
