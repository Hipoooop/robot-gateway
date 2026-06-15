/**
 * Redis user session cache — extracts configured fields from incoming messages
 * and pushes them to a Redis List keyed by userId.
 */

import type { WildfireConfig, UserCacheConfig } from "./config.js";

let Redis: any;
let redisClient: any = null;

async function ensureClient(redisUrl: string): Promise<any> {
  if (redisClient) return redisClient;
  if (!Redis) {
    try {
      Redis = (await import("ioredis")).default;
    } catch {
      throw new Error("ioredis is required for userCache. Run: npm install ioredis");
    }
  }
  redisClient = new Redis(redisUrl || "redis://localhost:6379", {
    connectTimeout: 3000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  await redisClient.connect();
  return redisClient;
}

/**
 * Extract values from `data` using dot-path field specs.
 * e.g. "senderUserInfo.displayName" → data.senderUserInfo.displayName
 */
function resolveTenant(data: any): string {
  try {
    const raw = data?.senderUserInfo?.extra;
    if (!raw) return "default";
    const parsed = JSON.parse(raw);
    return parsed?.tenantId || "default";
  } catch {
    return "default";
  }
}

function pickFields(data: any, fields: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const path of fields) {
    const value = path.split(".").reduce((obj, key) => obj?.[key], data);
    if (value === undefined || value === null) continue;
    // Use the last segment as the key name
    const lastKey = path.split(".").pop()!;
    // Try to parse JSON strings (e.g. payload.extra)
    if (typeof value === "string") {
      try { result[lastKey] = JSON.parse(value); continue; } catch {}
    }
    result[lastKey] = value;
  }
  return result;
}

/**
 * Push extracted session data to Redis List.
 * Key: session:wildfire:user:{userId}
 */
export async function pushUserSession(
  config: WildfireConfig,
  data: any,
): Promise<void> {
  const uc: UserCacheConfig | undefined = config.userCache;
  if (!uc?.enabled) return;
  if (!data) return;

  const fields = uc.fields;
  if (!fields || fields.length === 0) return;

  // Ensure userId is always part of the cached data
  const userId: string | undefined =
    data?.senderUserInfo?.userId || data?.sender;
  if (!userId) return;

  const record = pickFields(data, fields);

  // Always include userId in the stored record
  if (!record.userId) {
    record.userId = userId;
  }

  const tenantId = resolveTenant(data);
  const userIdKey = `session:wildfire:tenant:${tenantId}:user:${userId}`;
  const notifyKey = uc.notifyKey || "wildfire:new-message";
  const value = JSON.stringify(record);

  const keys = [userIdKey];
  if (notifyKey !== userIdKey) keys.push(notifyKey);

  try {
    const client = await ensureClient(uc.redisUrl || "redis://localhost:6379");
    for (const k of keys) {
      await Promise.race([
        client.lpush(k, value),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`redis lpush timeout: ${k}`)), 5000),
        ),
      ]);
    }
  } catch (err: any) {
    console.warn(`[wildfire-cache] redis error: ${err.message}`);
  }
}
