/**
 * Whitelist filter for Wildfire IM channel
 * Only processes messages from whitelisted users or groups
 */

import type { WildfireConfig } from "./config.js";

export class WhitelistFilter {
  private config: WildfireConfig;

  constructor(config: WildfireConfig) {
    this.config = config;
  }

  /**
   * Check if message should be processed
   * @param senderId - Sender user ID
   * @param targetId - Target ID (group ID or user ID)
   * @param isGroup - Whether it's a group chat
   * @returns true=should process, false=ignore
   */
  shouldProcess(senderId: string, targetId: string, isGroup: boolean): boolean {
    // If whitelist is not enabled, process all messages
    if (!this.config.whiteList?.enabled) {
      return true;
    }

    // Check user whitelist
    const allowedUsers = this.config.whiteList.allowedUsers || [];
    if (allowedUsers.length > 0) {
      if (allowedUsers.includes(senderId)) {
        console.debug(`[whitelist] User ${senderId} is in whitelist, will process message`);
        return true;
      }
    }

    // Check group whitelist
    if (isGroup) {
      const allowedGroups = this.config.whiteList.allowedGroups || [];
      if (allowedGroups.length > 0) {
        if (allowedGroups.includes(targetId)) {
          console.debug(`[whitelist] Group ${targetId} is in whitelist, will process message`);
          return true;
        }
      }
    }

    // Not in whitelist, log and return false
    console.log(
      `[whitelist] Message from sender=${senderId} (target=${targetId}, isGroup=${isGroup}) is not in whitelist, ignoring`
    );
    return false;
  }
}
