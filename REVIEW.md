---
status: issues_found
depth: deep
files_reviewed: 3
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
reviewed_files:
  - src/config.ts
  - src/redis-cache.ts
  - src/inbound.ts
reviewed_at: 2026-06-12
---

# Code Review: tenant-aware session + Redis cache

## Summary

3 files reviewed at **deep** depth. 6 findings: 1 critical, 3 warning, 2 info.

The tenant injection and Redis caching implementation is structurally sound. The main concern is a singleton Redis client that ignores URL changes and a missing `tenantIdPath` merge in the multi-account config path.

## Critical

### CR-01: Redis client singleton ignores URL changes

**File:** `src/redis-cache.ts:12,16`
**Severity:** Critical
**Category:** correctness

```typescript
let redisClient: any = null;

async function ensureClient(redisUrl: string): Promise<any> {
  if (redisClient) return redisClient;  // ← 永远返回第一个连接
```

If `redisUrl` changes (config hot-reload, or different accounts pointing to different Redis instances), the cached client is reused with the old URL. All subsequent writes go to the wrong Redis instance.

**Fix:** Track the active URL and recreate the client when it changes:

```typescript
let activeUrl = "";
let redisClient: any = null;

async function ensureClient(redisUrl: string): Promise<any> {
  if (redisClient && activeUrl === redisUrl) return redisClient;
  if (redisClient) { redisClient.disconnect(); redisClient = null; }
  activeUrl = redisUrl;
  // ... create new client
}
```

## Warning

### WR-01: `getAccountConfig` missing `tenantIdPath` merge in multi-account branch

**File:** `src/config.ts:42-56`
**Severity:** Warning
**Category:** correctness

```typescript
return {
  gatewayUrl: account.gatewayUrl ?? cfg.gatewayUrl,
  robotId: account.robotId ?? cfg.robotId,
  ...
  userCache: account.userCache ?? cfg.userCache,
  // ← tenantIdPath 未合并
};
```

If an account-level config sets `tenantIdPath`, it won't be picked up. Currently `tenantIdPath` is a channel-level config so this isn't triggered, but the interface allows it on per-account `WildfireConfig`.

**Fix:** Add `tenantIdPath: account.tenantIdPath ?? cfg.tenantIdPath`.

### WR-02: Duplicate `resolveTenant`/`resolveTenantId` logic in two files

**File:** `src/inbound.ts:480-490`, `src/redis-cache.ts:32-42`
**Severity:** Warning
**Category:** maintainability

Same path-walking + JSON-parse logic duplicated in two files. If the parsing rules change, both must be updated.

**Fix:** Export `resolveTenantId` from `inbound.ts` (or a shared `tenant.ts`) and import it from `redis-cache.ts`.

### WR-03: Pipeline stability — if `flattenRecord` fails, entire pipeline may be skipped

**File:** `src/redis-cache.ts:89-91`
**Severity:** Warning
**Category:** robustness

```typescript
pipeline.hset(userHashKey, flattenRecord(record));  // flattenRecord 可能抛异常?
```

`flattenRecord` calls `JSON.stringify` on nested object values. If the nested object contains a circular reference or BigInt, `JSON.stringify` throws. This would crash the pipeline before `exec()`, losing the entire batch (Hash + counter + notify).

**Fix:** Wrap `flattenRecord` in try-catch per field, or pre-validate record values.

## Info

### I-01: Good `Promise.race` timeout pattern

**File:** `src/redis-cache.ts:95-99`
**Severity:** Info
**Category:** best practice

5-second hard timeout on pipeline execution prevents Redis hangs from blocking message processing.

### I-02: Reasonable TTL default

**File:** `src/redis-cache.ts:93`
**Severity:** Info
**Category:** best practice

24-hour TTL on user hash prevents unbounded key accumulation. Consider making TTL configurable if longer retention is needed.

## Call Chain

```
inbound.ts: handleIncomingMessage()
  ├─ resolveTenantId(data, config.tenantIdPath) → tenantId
  ├─ baseSessionKey = wildfire:user:{tenantId}:{sender}
  ├─ routePeer.id = {tenantId}:{sender}
  └─ pushUserSession(config, data)
       ├─ resolveTenant(data, config.tenantIdPath)
       ├─ pickFields(data, fields) → record
       ├─ HSET wildfire:tenant-users:{tenant}:{user} ...
       ├─ HINCRBY msgCount 1
       ├─ EXPIRE 86400
       └─ LPUSH wildfire:new-message ...
```

Path is clean, tenantId flows correctly to both session isolation and Redis keys.
