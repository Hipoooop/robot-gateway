/**
 * Redis user session cache — stores user profile (Hash), message count (Hash field),
 * last active time (Hash field), and notification events (List).
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
    const lastKey = path.split(".").pop()!;
    if (typeof value === "string") {
      try { result[lastKey] = JSON.parse(value); continue; } catch {}
    }
    result[lastKey] = value;
  }
  return result;
}

export async function pushUserSession(
  config: WildfireConfig,
  data: any,
): Promise<void> {
  const uc: UserCacheConfig | undefined = config.userCache;
  if (!uc?.enabled) return;
  if (!data) return;

  const fields = uc.fields;
  if (!fields || fields.length === 0) return;

  const userId: string | undefined = data?.senderUserInfo?.userId || data?.sender;
  if (!userId) return;

  const tenantId = resolveTenant(data);
  const record = pickFields(data, fields);
  if (!record.userId) record.userId = userId;

  const notifyKey = uc.notifyKey || "wildfire:new-message";
  const userHashKey = `wildfire:tenant-users:${tenantId}:${userId}`;
  const notifyValue = JSON.stringify(record);

  try {
    const client = await ensureClient(uc.redisUrl || "redis://localhost:6379");

    const pipeline = client.pipeline();
    pipeline.hset(userHashKey, flattenRecord(record));
    pipeline.hset(userHashKey, "lastActiveAt", String(data.timestamp ?? Date.now()));
    pipeline.hincrby(userHashKey, "msgCount", 1);
    pipeline.expire(userHashKey, 86400);
    pipeline.lpush(notifyKey, notifyValue);

    await Promise.race([
      pipeline.exec(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis pipeline timeout")), 5000),
      ),
    ]);
  } catch (err: any) {
    console.warn(`[wildfire-cache] redis error: ${err.message}`);
  }
}

function flattenRecord(record: Record<string, any>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      flat[key] = JSON.stringify(value);
    } else {
      flat[key] = String(value);
    }
  }
  return flat;
}
