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
    if (isMentioned(messageData, config.robotId)) {
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
function isMentioned(messageData: any, robotId?: string): boolean {
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
      const mentionedTargets = payload.mentionedTarget;
      if (Array.isArray(mentionedTargets) && mentionedTargets.length > 0) {
        // Only respond if the bot itself is mentioned; ignore @-mentions of other users
        if (robotId) {
          return mentionedTargets.includes(robotId);
        }
        // robotId unknown: fall back to responding to any @-mention
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

// Utility functions moved to targets.ts
