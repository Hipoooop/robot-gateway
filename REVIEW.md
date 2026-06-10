---
status: issues_found
depth: deep
files_reviewed: 5
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
reviewed_files:
  - openclaw-plugin.js/src/clients.ts
  - openclaw-plugin.js/src/index.ts
  - openclaw-plugin.js/src/channel.ts
  - openclaw-plugin.js/src/inbound.ts
  - openclaw-plugin.js/src/utils.ts
reviewed_at: 2026-02-06
---

# Code Review: Wildfire Multi-Account Refactor

## Summary

5 files reviewed at **deep** depth. 7 findings: 1 critical, 5 warning, 1 info.

The multi-account refactor is structurally sound — `accountId` flows correctly through the entire call chain from `index.ts` startup → `clients.ts` connection → `inbound.ts` message handling → `utils.ts` mention detection. No hardcoded `"default"` remains in the runtime path. Backward compatibility is maintained through `listEnabledAccountConfigs` fallback.

## Critical

### CR-01: Optional `accountId` in `sendStreamingReply` / `sendDirectReply` signatures

**File:** `src/inbound.ts:341,586`
**Severity:** Critical
**Category:** correctness

`sendStreamingReply` and `sendDirectReply` accept `accountId?: string` (optional). If any future call site omits this parameter, `getClient(undefined)` falls back to the first Map entry (arbitrary client), causing messages to be sent from the wrong bot account.

All current call sites within `handleIncomingMessage` pass `accountId` correctly. However, the optional signature is an API contract risk — it signals that omitting the parameter is acceptable when it never is in a multi-account context.

**Fix:** Change both function signatures to make `accountId: string` required:

```typescript
// sendStreamingReply — change:
api?: any,
accountId?: string,
// to:
api: any | undefined,
accountId: string,

// sendDirectReply — change:
api?: any,
accountId?: string,
// to:
api: any | undefined,
accountId: string,
```

## Warning

### WR-01: `entry.client` initialized via `as unknown as` type assertion

**File:** `src/clients.ts:36`
**Severity:** Warning
**Category:** code quality

```typescript
const entry: ClientEntry = {
  client: undefined as unknown as RobotServiceClient,
  connected: false,
  config,
};
entry.client = new RobotServiceClient(...);
```

The `as unknown as` bypasses type checking. If any code between the object literal and the assignment reads `entry.client`, it would get `undefined` but typed as `RobotServiceClient`. Low risk in current code (assignment immediately follows), but fragile.

**Fix:** Defer entry construction until after `RobotServiceClient` is created, or declare `client` field as `RobotServiceClient | undefined`.

### WR-02: `getClient` / `getConnectedClient` fallback is non-deterministic

**File:** `src/clients.ts:81-85,93-95`
**Severity:** Warning
**Category:** correctness

When called without `accountId`, these functions return the first entry in Map iteration order (insertion order). In a multi-account setup, callers that don't pass `accountId` may silently use the wrong bot. All current call sites in the diff do pass `accountId`, so this is dormant — but the API remains dangerous for future use.

**Fix:** Add a deprecation warning log when the fallback path is taken.

### WR-03: `resolveAccount` spreads entire account object with extra properties

**File:** `src/channel.ts:52-62`
**Severity:** Warning
**Category:** code quality

```typescript
return {
  ...wildfireCfg,
  ...account,
  accounts: wildfireCfg.accounts,
  gatewayUrl: account.gatewayUrl ?? wildfireCfg.gatewayUrl,
  ...
};
```

If an account sub-config has a typo (e.g., `robotIdd` instead of `robotId`), the misspelled key will silently appear in the resolved account object. Not a functional bug, but reduces error visibility.

### WR-04: Dead code path in `resolveAccount` — `enabled === false` check

**File:** `src/channel.ts:55`
**Severity:** Warning
**Category:** dead code

`resolveAccount` checks `if (account.enabled === false) return null`, but `listAccountIds` already filters out `enabled === false` accounts before the framework calls `resolveAccount`. This null-return path will never execute. Not harmful, but dead code.

### WR-05: `sendDirectReply` whitelist block path uses optional accountId

**File:** `src/inbound.ts:97,586`
**Severity:** Warning
**Category:** correctness

The call at line 97 passes `accountId`, but the function signature at line 586 still marks it optional. Same risk profile as CR-01 but lower frequency (only on whitelist block).

## Info

### I-01: Good error collection pattern in `index.ts`

**File:** `src/index.ts:34-52`
**Severity:** Info
**Category:** best practice

The startup loop collects per-account errors via `errors.push(...)` and only throws if zero accounts connected. This correctly handles partial failure: one broken account config doesn't prevent other accounts from starting. Good pattern.

## Call Chain Verification

```
index.ts start()
  → listEnabledAccountConfigs(api)                    ✓ config.ts
  → for each { id, config }:
      → validateConfig(config)                        ✓ config.ts
      → startClient(api, config, id)                  ✓ clients.ts
        → handleIncomingMessage(api, msg, config, id) ✓ inbound.ts
          → shouldRespondToGroupMessage(text,...,robotId,...) ✓ utils.ts
          → resolveAgentRoute({ accountId: id })      ✓ framework
          → recordInboundSession({ accountId: id })   ✓ framework
          → activity.record({ accountId: id })        ✓ framework
          → sendStreamingReply(..., api, id)          ✓ inbound.ts
          → sendDirectReply(..., api, id)             ✓ inbound.ts
channel.ts config adapter
  listAccountIds → reads accounts map                 ✓
  resolveAccount → per-account merge with ??          ✓
```

All 6 hardcoded `"default"` values replaced. `accountId` flows end-to-end without gaps.

## Security

| Check | Result |
|-------|--------|
| Secret exposure in logs | ✓ `robotSecret` only used in `client.connect()`, never logged |
| Injection (eval/exec) | ✓ User text extracted via `extractPayloadInfo`, passed as `Body` to AI pipeline |
| Path traversal | ✓ `downloadMediaToTemp` uses `path.join + UUID`, no user-controlled filenames |
| Race conditions | ✓ Node single-threaded + `sessionQueues` serialized by sessionKey |

## Recommendation

Apply CR-01 (make accountId required in sendStreamingReply/sendDirectReply) before production deployment. WR-01 through WR-05 are lower priority and can be addressed in a follow-up cleanup pass.
