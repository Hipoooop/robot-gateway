/**
 * Wildfire IM client management (Multi-Account)
 */

import { RobotServiceClient } from "@wildfirechat/robot-gateway-client-sdk";
import type { WildfireConfig } from "./config.js";
import { handleIncomingMessage } from "./inbound.js";

type ClientEntry = {
  client: RobotServiceClient;
  connected: boolean;
  config: WildfireConfig;
};

// Multi-account client map: accountId → ClientEntry
const clients = new Map<string, ClientEntry>();

/**
 * Check if any client is connected, or if a specific account is connected
 */
export function isClientConnected(accountId?: string): boolean {
  if (accountId) {
    const entry = clients.get(accountId);
    return entry?.connected === true;
  }
  for (const entry of clients.values()) {
    if (entry.connected) return true;
  }
  return false;
}

/**
 * Start a client for a given account
 */
export async function startClient(
  api: any,
  config: WildfireConfig,
  accountId: string,
): Promise<void> {
  if (clients.has(accountId)) {
    api.logger?.warn?.(`[wildfire:${accountId}] client already exists`);
    return;
  }

  const entry: ClientEntry = {
    client: undefined as unknown as RobotServiceClient,
    connected: false,
    config,
  };

  entry.client = new RobotServiceClient(
    config.gatewayUrl!,
    {
      onMessage: (message: any) => {
        api.logger?.debug?.(
          `[wildfire:${accountId}] raw ws message: ${JSON.stringify(message)}`,
        );
        handleIncomingMessage(api, message, config, accountId);
      },
      onConnectionChanged: (isConnected: boolean) => {
        entry.connected = isConnected;
        api.logger?.info?.(
          `[wildfire:${accountId}] connection changed: ${isConnected}`,
        );
      },
      onError: (error: Error) => {
        api.logger?.error?.(`[wildfire:${accountId}] error:`, error);
      },
    },
    {
      timeout: 30,
      reconnectInterval: 5000,
      heartbeatInterval: 270000,
    },
  );

  clients.set(accountId, entry);

  const isConn = await entry.client.connect(
    config.robotId!,
    config.robotSecret!,
  );

  if (isConn) {
    entry.connected = true;
    api.logger?.info?.(
      `[wildfire:${accountId}] connected as ${config.robotId}`,
    );
  } else {
    clients.delete(accountId);
    api.logger?.error?.(`[wildfire:${accountId}] failed to connect`);
    throw new Error(`Failed to connect Wildfire IM account "${accountId}"`);
  }
}

/**
 * Get the client for a specific account (or first available)
 */
export function getClient(accountId?: string): RobotServiceClient | null {
  if (accountId) {
    return clients.get(accountId)?.client ?? null;
  }
  // Fallback: return first client in map (backward compat)
  for (const entry of clients.values()) {
    return entry.client;
  }
  return null;
}

/**
 * Get connected client for a specific account (or first connected)
 */
export function getConnectedClient(accountId?: string): RobotServiceClient | null {
  if (accountId) {
    const entry = clients.get(accountId);
    return entry?.connected ? entry.client : null;
  }
  // Fallback: return first connected client (backward compat)
  for (const entry of clients.values()) {
    if (entry.connected) return entry.client;
  }
  return null;
}

/**
 * Get the config for a specific account
 */
export function getClientConfig(accountId: string): WildfireConfig | undefined {
  return clients.get(accountId)?.config;
}

/**
 * List all active account IDs
 */
export function listActiveAccountIds(): string[] {
  return [...clients.keys()];
}

/**
 * Stop a specific account's client, or all if no accountId given
 */
export async function stopClient(api?: any, accountId?: string): Promise<void> {
  const idsToStop = accountId
    ? [accountId]
    : [...clients.keys()];

  for (const id of idsToStop) {
    const entry = clients.get(id);
    if (!entry) continue;
    try {
      entry.client.close();
      api?.logger?.info?.(`[wildfire:${id}] disconnected`);
    } catch (err) {
      api?.logger?.error?.(`[wildfire:${id}] error stopping:`, err);
    }
    clients.delete(id);
  }
}

