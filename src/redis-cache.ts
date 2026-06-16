/**
 * Redis user session cache — stores user profile (Hash), message count (Hash field),
 * last active time (Hash field), and notification events (List).
 */

import type { WildfireConfig, UserCacheConfig } from "./config.js";

let Redis: any;
let activeUrl = "";
let redisClient: any = null;

async function ensureClient(redisUrl: string, redisPassword?: string): Promise<any> {
  const url = redisUrl || "redis://localhost:6379";
  const key = `${url}:${redisPassword || ""}`;
  if (redisClient && activeUrl === key) return redisClient;
  if (redisClient) {
    try { redisClient.disconnect(); } catch {}
    redisClient = null;
  }
  activeUrl = key;
  if (!Redis) {
    try {
      Redis = (await import("ioredis")).default;
    } catch {
      throw new Error("ioredis is required for userCache. Run: npm install ioredis");
    }
  }
  const redisOpts: any = {
    connectTimeout: 3000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  };
  if (redisPassword) redisOpts.password = redisPassword;
  redisClient = new Redis(url, redisOpts);
  await redisClient.connect();
  return redisClient;
}

function resolveTenant(data: any, path?: string): string {
  const fullPath = path || "payload.extra.tenantId";
  const segments = fullPath.split(".");
  const field = segments.pop()!;
  const jsonStr = segments.reduce((obj: any, key) => obj?.[key], data);
  if (!jsonStr || typeof jsonStr !== "string") return "default";
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed?.[field] || "default";
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

function pickField(data: any, path: string): any {
  try {
    const segments = path.split(".");
    const field = segments.pop()!;
    const jsonStr = segments.reduce((obj: any, key) => obj?.[key], data);
    if (!jsonStr || typeof jsonStr !== "string") return null;
    const parsed = JSON.parse(jsonStr);
    return parsed?.[field] || null;
  } catch {
    return null;
  }
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

  const tenantId = resolveTenant(data, config.tenantIdPath);
  const record = pickFields(data, fields);
  if (!record.userId) record.userId = userId;

  const notifyKey = uc.notifyKey || "wildfire:new-message";
  const prefix = uc.keyPrefix || "wildfire:tenant-users";
  const userHashKey = `${prefix}:${tenantId}:${userId}`;
  const notifyValue = JSON.stringify(record);

  try {
    const client = await ensureClient(uc.redisUrl || "redis://localhost:6379", uc.redisPassword);

    const pipeline = client.pipeline();
    const flat = flattenRecord(record);
    flat["robotId"] = config.robotId || "";
    const tenantName = pickField(data, config.tenantNamePath || "payload.extra.tenantName");
    if (tenantName) flat["tenantName"] = String(tenantName);

    pipeline.hset(userHashKey, flat);
    pipeline.hset(userHashKey, "lastActiveAt", String(data.timestamp ?? Date.now()));
    pipeline.hincrby(userHashKey, "msgCount", 1);
    pipeline.expire(userHashKey, 31536000);
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
