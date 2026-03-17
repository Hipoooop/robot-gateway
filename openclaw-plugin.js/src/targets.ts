/**
 * Target parsing utilities
 */

export interface ParsedTarget {
  id: string;
  isGroup: boolean;
}

/**
 * Parse a target string into id and type
 * 
 * 支持的格式：
 * - wildfire:user:<id> 或 wf:user:<id> → 单聊
 * - wildfire:group:<id> 或 wf:group:<id> → 群聊
 * - user:<id> → 单聊
 * - group:<id> → 群聊
 * - 纯 ID（无前缀）→ 默认为单聊
 */
export function parseTarget(to: string): ParsedTarget | null {
  if (!to) return null;

  // Remove optional provider prefix (wildfire: or wf:)
  let cleanTarget = to.replace(/^(wildfire|wf):/i, "");

  // Check explicit type prefix
  if (cleanTarget.startsWith("group:")) {
    return { id: cleanTarget.slice(6), isGroup: true };
  }
  if (cleanTarget.startsWith("user:")) {
    return { id: cleanTarget.slice(5), isGroup: false };
  }

  // No explicit prefix - default to direct (user) chat
  // This matches OpenIM's behavior where bare IDs are treated as user IDs
  return { id: cleanTarget, isGroup: false };
}

/**
 * Format a target string
 */
export function formatTarget(id: string, isGroup: boolean): string {
  return isGroup ? `group:${id}` : `user:${id}`;
}
