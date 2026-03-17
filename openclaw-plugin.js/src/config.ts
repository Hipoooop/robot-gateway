/**
 * Configuration for Wildfire IM channel (Single Account)
 */

export interface WildfireConfig {
  enabled?: boolean;
  gatewayUrl?: string;
  robotId?: string;
  robotSecret?: string;
  requireMention?: boolean;
  helpKeywords?: string;
  accounts?: Record<string, WildfireConfig>;
}

/**
 * Get the effective configuration for an account
 */
export function getAccountConfig(api: any, accountId: string = "default"): WildfireConfig | null {
  const cfg: WildfireConfig = api.config.channels.wildfire || {};
  
  // If using multi-account config
  if (cfg.accounts?.[accountId]) {
    const account = cfg.accounts[accountId];
    if (account.enabled === false) return null;
    return {
      gatewayUrl: account.gatewayUrl ?? cfg.gatewayUrl,
      robotId: account.robotId ?? cfg.robotId,
      robotSecret: account.robotSecret ?? cfg.robotSecret,
      requireMention: account.requireMention ?? cfg.requireMention ?? true,
      helpKeywords: account.helpKeywords ?? cfg.helpKeywords ?? "帮,请,分析,总结",
    };
  }
  
  // Single account (legacy) config
  if (accountId === "default") {
    if (cfg.enabled === false) return null;
    return {
      gatewayUrl: cfg.gatewayUrl,
      robotId: cfg.robotId,
      robotSecret: cfg.robotSecret,
      requireMention: cfg.requireMention ?? true,
      helpKeywords: cfg.helpKeywords ?? "帮,请,分析,总结",
    };
  }
  
  return null;
}

/**
 * List all enabled account configurations
 */
export function listEnabledAccountConfigs(api: any): Array<{ id: string; config: WildfireConfig }> {
  const cfg: WildfireConfig = api.config.channels.wildfire || {};
  const accounts: Array<{ id: string; config: WildfireConfig }> = [];
  
  // Check multi-account config
  if (cfg.accounts) {
    for (const [id, account] of Object.entries(cfg.accounts)) {
      if (account.enabled !== false) {
        const effective = getAccountConfig(api, id);
        if (effective) {
          accounts.push({ id, config: effective });
        }
      }
    }
  }
  
  // Check single account config
  if (accounts.length === 0 && cfg.enabled !== false) {
    const defaultConfig = getAccountConfig(api, "default");
    if (defaultConfig) {
      accounts.push({ id: "default", config: defaultConfig });
    }
  }
  
  return accounts;
}

/**
 * Validate account configuration
 */
export function validateConfig(config: WildfireConfig): string | null {
  if (!config.gatewayUrl) {
    return "gatewayUrl is required";
  }
  if (!config.robotId) {
    return "robotId is required";
  }
  if (!config.robotSecret) {
    return "robotSecret is required";
  }
  return null;
}
