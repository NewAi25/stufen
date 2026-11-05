# @stufen/core-entitlements

## Purpose

Answers "may this user do X" and "how much of Y is left today". Plans, daily limits and feature flags.
In beta every user is `free_beta` and every feature is on. See ADR-007.
There is no payment code in this box yet. The payment adapter slot from `docs/12` stays empty until the entitlements phase.

Kind: `core`. May import: `contracts`.

## Public API

The box has no global state. `apps/web` builds one service from a store and the event bus, then calls it.

```ts
import { createEventBus } from '@stufen/contracts';
import { createEntitlements, createInMemoryEntitlementStore } from '@stufen/core-entitlements';

const entitlements = createEntitlements({
  store: createInMemoryEntitlementStore(), // any EntitlementStore
  bus: createEventBus(),                   // any EventBus
  now: () => new Date(),                   // optional clock
  dayKeyFor: (userId, now) => '2026-11-05', // optional, default is the UTC date
});
```

What the service offers:

```ts
plan(userId): Promise<Entitlement>
can(userId, feature: FeatureKey): Promise<boolean>
remaining(userId, limit: LimitKey): Promise<number>          // per day, never below zero
consume(userId, limit: LimitKey, amount = 1): Promise<void>  // throws LimitExceededError
flag(key: string, userId?, ctx?: { level?: CefrLevel }): Promise<boolean>
setPlan(userId, plan: PlanId, source: EntitlementSource): Promise<Entitlement>
```

Everything `src/index.ts` exports:

| Export | What it is |
|--------|------------|
| `createEntitlements` | The factory above |
| `EntitlementStore` | The storage port: `getEntitlement`, `upsertEntitlement`, `getFlag`, `setFlag`, `usedToday`, `recordUse` |
| `createInMemoryEntitlementStore` | The adapter used in unit tests |
| `PLANS`, `DEFAULT_PLAN` | Plan definitions as data, and the default plan `free_beta` |
| `LimitExceededError` | Thrown by `consume`. Carries `limitKey`, `limit`, `used`, `requested` |
| Types `Entitlements`, `EntitlementsDeps`, `FlagContext`, `FeatureFlag`, `FlagRules`, `PlanDefinition` | The shapes the exports above use |

## How it behaves

| Call | Rule |
|------|------|
| `plan` | Returns the stored row. A user with no row gets a `free_beta` row created on first call |
| `plan`, expired row | A row with `expiresAt` in the past is rewritten to `free_beta` and `entitlement.changed` is emitted once. Overrides are kept |
| `can` | The `features` override on the row wins. Otherwise the plan decides |
| `remaining` | The `limits` override on the row wins. Otherwise the plan decides. The result is the limit minus today's use |
| `consume` | Throws `LimitExceededError` when the amount is more than what is left. Throws `RangeError` when the amount is not a positive number. Otherwise records the use |
| `setPlan` | Writes the plan and source, keeps the overrides, clears any expiry, emits `entitlement.changed` |

"Today" is whatever `dayKeyFor(userId, now)` returns. The default is the UTC date. The app can pass a function that uses the user's timezone, and it may be async.

### Plans

Defined in `src/plans.ts`. Only `free_beta` is active. The others are the proposal from `docs/12`, kept as data so the shape is fixed.

| Plan | Active | Features off | Tutor messages | Writing grades | Speech minutes |
|------|--------|--------------|----------------|----------------|----------------|
| `free_beta` | yes | none | 200 | 20 | 30 |
| `free` | no | `exam_sim`, `levels_above_b1` | 10 | 1 | 5 |
| `plus` | no | none | 100 | 10 | 30 |
| `pro` | no | none | 400 | 40 | 120 |

Limits are per day. The `free_beta` numbers match the column default in migration 0001.

### Feature flags

`flag` stops at the first rule that decides.

| Order | Rule | Result |
|-------|------|--------|
| 0 | the key is unknown | false |
| 1 | `enabled` is false | false |
| 2 | `rules.deny` contains the user id | false |
| 3 | `rules.allow` contains the user id | true |
| 4 | `rules.plans` is set and the user's plan is not in it | false |
| 5 | `rules.min_level` is set and `ctx.level` is below it or missing | false |
| 6 | `rules.percent` is set and `hash(key + userId) mod 100 >= percent` | false |
| 7 | nothing above decided | true |

Without a `userId` only rows 0, 1 and 7 apply. The hash is FNV-1a, 32 bit, so a user who is in a rollout stays in when the percent grows.

### Storage

The Postgres adapter is not written yet (P1-33). It will read today's use from the `daily_usage` view, and its `recordUse` will do nothing, because the calling route writes the real row. The in memory adapter counts use itself.

## Owns tables

| Table |
|-------|
| `entitlements` |
| `feature_flags` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `entitlement.changed` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-entitlements/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-entitlements): message`.

## How to test it

```
pnpm --filter @stufen/core-entitlements test
```

## Status

See the `core-entitlements` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
