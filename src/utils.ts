/**
 * Utility functions
 */

/**
 * Check if should respond to a group message
 *
 * @param text        The message text
 * @param messageData Raw message data with mention info
 * @param robotId     The robot ID to check mentions against
 * @param requireMention Whether @-mention is required (default true)
 * @param helpKeywords Comma-separated trigger keywords (default "帮,请,分析,总结")
 */
export function shouldRespondToGroupMessage(
  text: string,
  messageData: any,
  robotId?: string,
  requireMention: boolean = true,
  helpKeywords: string = "帮,请,分析,总结",
): boolean {
  // Strategy 1: Check if mentioned
  if (requireMention !== false) {
    if (isMentioned(messageData, robotId)) {
      return true;
    }
  }

  // Strategy 2: Check question mark
  if (/.*[？?]$/.test(text)) {
    return true;
  }

  // Strategy 3: Check help keywords
  const keywords = helpKeywords.split(",").map((k: string) => k.trim()).filter(Boolean);
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return true;
    }
  }

  // If requireMention is true and not met, don't respond
  if (requireMention !== false) {
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
