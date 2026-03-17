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
 */
function isMentioned(messageData: any): boolean {
  try {
    const extra = messageData.payload?.extra;
    if (!extra) return false;
    
    const extraData = JSON.parse(extra);
    if (extraData.mentions && Array.isArray(extraData.mentions)) {
      // Check if robot is mentioned
      // The robot ID would need to be compared here
      return extraData.mentions.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

// Utility functions moved to targets.ts
