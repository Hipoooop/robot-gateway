/**
 * Configuration for Wildfire IM channel
 */

export interface UserCacheConfig {
  enabled?: boolean;
  redisUrl?: string;
  fields?: string[];
  notifyKey?: string;
  keyPrefix?: string;
}

export interface WildfireConfig {
  enabled?: boolean;
  gatewayUrl?: string;
  robotId?: string;
  robotSecret?: string;
  asrServer?: string;
  requireMention?: boolean;
  helpKeywords?: string;
  accounts?: Record<string, WildfireConfig>;
  whiteList?: {
    enabled?: boolean;
    allowedUsers?: string[];
    allowedGroups?: string[];
    deniedMessage?: string;
  };
  tenantIdPath?: string;
  userCache?: UserCacheConfig;
}

/**
 * Get the effective configuration for an account
 */
export function getAccountConfig(api: any, accountId: string = "default"): WildfireConfig | null {
  const cfg: WildfireConfig = api.config.channels.wildfire || {};
  
  if (cfg.accounts?.[accountId]) {
    const account = cfg.accounts[accountId];
    if (account.enabled === false) return null;
    return {
      gatewayUrl: account.gatewayUrl ?? cfg.gatewayUrl,
      robotId: account.robotId ?? cfg.robotId,
      robotSecret: account.robotSecret ?? cfg.robotSecret,
      asrServer: account.asrServer ?? cfg.asrServer,
      requireMention: account.requireMention ?? cfg.requireMention ?? true,
      helpKeywords: account.helpKeywords ?? cfg.helpKeywords ?? "帮,请,分析,总结",
      whiteList: {
        enabled: account.whiteList?.enabled ?? cfg.whiteList?.enabled ?? false,
        allowedUsers: account.whiteList?.allowedUsers ?? cfg.whiteList?.allowedUsers ?? [],
        allowedGroups: account.whiteList?.allowedGroups ?? cfg.whiteList?.allowedGroups ?? [],
        deniedMessage: account.whiteList?.deniedMessage ?? cfg.whiteList?.deniedMessage ?? "不允许使用",
      },
      userCache: account.userCache ?? cfg.userCache,
    };
  }
  
  if (accountId === "default") {
    if (cfg.enabled === false) return null;
    return {
      gatewayUrl: cfg.gatewayUrl,
      robotId: cfg.robotId,
      robotSecret: cfg.robotSecret,
      asrServer: cfg.asrServer,
      requireMention: cfg.requireMention ?? true,
      helpKeywords: cfg.helpKeywords ?? "帮,请,分析,总结",
      whiteList: {
        enabled: cfg.whiteList?.enabled ?? false,
        allowedUsers: cfg.whiteList?.allowedUsers ?? [],
        allowedGroups: cfg.whiteList?.allowedGroups ?? [],
        deniedMessage: cfg.whiteList?.deniedMessage ?? "不允许使用",
      },
      userCache: cfg.userCache,
    };
  }
  
  return null;
}

export function listEnabledAccountConfigs(api: any): Array<{ id: string; config: WildfireConfig }> {
  const cfg: WildfireConfig = api.config.channels.wildfire || {};
  const accounts: Array<{ id: string; config: WildfireConfig }> = [];
  
  if (cfg.accounts) {
    for (const [id, account] of Object.entries(cfg.accounts)) {
      if (account.enabled !== false) {
        const effective = getAccountConfig(api, id);
        if (effective) accounts.push({ id, config: effective });
      }
    }
  }
  
  if (accounts.length === 0 && cfg.enabled !== false) {
    const defaultConfig = getAccountConfig(api, "default");
    if (defaultConfig) accounts.push({ id: "default", config: defaultConfig });
  }
  
  return accounts;
}

export function validateConfig(config: WildfireConfig): string | null {
  if (!config.gatewayUrl) return "gatewayUrl is required";
  if (!config.robotId) return "robotId is required";
  if (!config.robotSecret) return "robotSecret is required";
  return null;
}
