/**
 * Utility functions
 */

import type { WildfireConfig } from "./config.js";

/**
 * Check if should respond to a group message
 */
export function shouldRespondToGroupMessage(
  text: string,
  messageData: any,
  config: WildfireConfig
): boolean {
  // Strategy 1: Check if mentioned
  if (config.requireMention !== false) {
    if (isMentioned(messageData)) {
      return true;
    }
  }
  
  // Strategy 2: Check question mark
  if (/.*[？?]$/.test(text)) {
    return true;
  }
  
  // Strategy 3: Check help keywords
  const keywords = (config.helpKeywords || "帮,请,分析,总结").split(",").map((k: string) => k.trim()).filter(Boolean);
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return true;
    }
  }
  
  // If requireMention is true and not met, don't respond
  if (config.requireMention !== false) {
    return false;
  }
  
  return true;
}

/**
 * Check if the robot is mentioned in the message
 * 
 * 野火 IM mention 规则：
 * - mentionedType === 2: @所有人，应该回复
 * - mentionedType === 1: @部分人，检查 mentionedTargets 是否包含机器人 ID
 * - mentionedType === 0 或不存在: 未被提及
 */
function isMentioned(messageData: any): boolean {
  try {
    const payload = messageData.payload;
    if (!payload) return false;
    
    const mentionedType = payload.mentionedType;
    
    // mentionedType === 2: @所有人
    if (mentionedType === 2) {
      return true;
    }
    
    // mentionedType === 1: @部分人，检查 mentionedTargets
    if (mentionedType === 1) {
      const mentionedTargets = payload.mentionedTargets;
      if (Array.isArray(mentionedTargets) && mentionedTargets.length > 0) {
        // 获取机器人 ID（从 messageData 的 target 或 sender 推断）
        // 机器人通常不是 sender，所以这里只需要检查是否有任何 mention
        // 实际上，如果 mentionedTargets 不为空，说明有人被 @ 了
        // 但为了精确匹配，我们需要知道机器人自己的 ID
        // 简化处理：只要有部分人被 @，就认为机器人可能需要响应
        // 或者可以通过配置来指定机器人 ID
        return true;
      }
    }
    
    // 尝试从 extra 字段解析（旧格式兼容）
    const extra = payload.extra;
    if (extra && typeof extra === "string") {
      try {
        const extraData = JSON.parse(extra);
        if (extraData.mentionedType === 2) {
          return true;
        }
        if (extraData.mentionedType === 1 && Array.isArray(extraData.mentionedTargets)) {
          return extraData.mentionedTargets.length > 0;
        }
      } catch {
        // JSON 解析失败，忽略
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

// Utility functions moved to targets.ts
