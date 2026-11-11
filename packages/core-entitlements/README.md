# @stufen/core-entitlements

## Purpose

Answers "may this user do X" and "how much of Y is left today". Plans, daily limits and feature flags.
In beta every user is `free_beta` and every feature is on. See ADR-007.
There is no payment code in this box yet. The payment adapter slot from `docs/12` stays empty until the entitlements phase.

Kind: `core`. May import: `contracts`, `db`.

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
| `createPostgresEntitlementStore` | The adapter the app uses. Takes the `Database` from `createDb`. See Storage |
| `postgresDayKeyFor` | The `dayKeyFor` option to pass together with the Postgres store. See Storage |
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

"Today" is whatever `dayKeyFor(userId, now)` returns. The default is the UTC date. The app can pass a function that uses the user's timezone, and it may be async. With the Postgres store the app passes `postgresDayKeyFor(db)`, described under Storage.

### Plans

Defined in `src/plans.ts`. Only `free_beta` is active. The others are the proposal from `docs/12`, kept as data so the shape is fixed.

| Plan | Active | Features off | Tutor messages | Writing grades | Speech minutes |
|------|--------|--------------|----------------|----------------|----------------|
| `free_beta` | yes | none | 200 | 20 | 30 |
| `free` | no | `exam_sim`, `levels_above_b1` | 10 | 1 | 5 |
| `plus` | no | none | 100 | 10 | 30 |
| `pro` | no | none | 400 | 40 | 120 |

Limits are per day. The numbers live in `PLANS` in this box. The `entitlements` row holds only per user overrides (migration 0005), so a change to a plan reaches every user on it.

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

There are two adapters for the `EntitlementStore` port. Both pass the same contract in `tests/store-contract.ts`. They differ in one place by design: how use is counted.

| | `createInMemoryEntitlementStore()` | `createPostgresEntitlementStore(db)` |
|---|---|---|
| Used by | unit tests | the app |
| Rows | Maps, copied in and out | tables `entitlements` and `feature_flags` |
| `usedToday` | what `recordUse` added | the view `daily_usage`, which counts the real rows |
| `recordUse` | adds to a counter | does nothing |

With Postgres a use is never counted twice and never forgotten. `consume` checks the limit, then the calling route writes the tutor message, the writing submission or the speech recording, and the view counts that row. Speech is counted in whole minutes, rounded up, from `speech_recordings.duration_ms`. Only messages the learner sent count as tutor messages.

```ts
import { createEventBus } from '@stufen/contracts';
import { createDb } from '@stufen/db';
import {
  createEntitlements,
  createPostgresEntitlementStore,
  postgresDayKeyFor,
} from '@stufen/core-entitlements';

const db = createDb(process.env.DATABASE_URL);
const entitlements = createEntitlements({
  store: createPostgresEntitlementStore(db),
  bus: createEventBus(),
  dayKeyFor: postgresDayKeyFor(db), // needed with the Postgres store, see below
});
```

#### Access model

The adapter follows the two kinds of access in `docs/03-data-schema.md`.

| Method | Runs as | Why |
|--------|---------|-----|
| `getEntitlement(userId)` | the learner, inside `withUser(db, userId)` | Row level security lets a learner read the own row only |
| `usedToday(userId, limit, dayKey)` | the learner, inside `withUser(db, userId)` | The view is `security_invoker`, so it shows the own usage only |
| `getFlag(key)` | signed out, inside `withUser(db, null)` | Flags are content. Anyone may read them |
| `upsertEntitlement(entitlement)` | the owner, on `db` directly | Learners may not write entitlements |
| `setFlag(flag)` | the owner, on `db` directly | Learners may not write flags. The app role has no write grant on `feature_flags` (migration 0006) |
| `recordUse(...)` | nothing runs | Usage comes from the real rows |

Three things follow from this.

- The port has no "who is asking" argument. The store reads as the user whose row is asked for. The route that calls the service must pass the signed in user's id and nothing else. Row level security then guarantees the read cannot return another learner's row.
- The row usually exists before the box is first asked. The database function `ensure_profile` creates it at sign up with plan `free_beta` and no limits of its own. `upsertEntitlement` is therefore an insert that becomes an update on conflict. The `entitlements` row references `profiles`, so an upsert for a user id without a profile fails.
- On a row that already existed, `updatedAt` is the database time of the write. A trigger sets it, and the value passed in is ignored.

A user id that is not a uuid makes `withUser` throw a `TypeError` before any query runs.

#### The day key with Postgres

The default `dayKeyFor` uses the UTC date. The view `daily_usage` files each row under the user's local day, taken from `profiles.timezone`. For a learner in Kolkata those two days differ for five and a half hours every night, and in that window the count would read as zero.

`postgresDayKeyFor(db)` closes the gap. It returns a function for the `dayKeyFor` option that asks Postgres for the user's current local day, `YYYY-MM-DD`, with the same `local_day` function the view uses. The composition root in `apps/web` must pass it whenever it uses the Postgres store. The in memory store does not need it.

| Case | Result |
|------|--------|
| The user has a profile | The current day in `profiles.timezone`, from the database clock |
| `profiles.timezone` is not a known zone | The current UTC day, the same fallback the view has |
| The user has no profile | The UTC date of the `now` argument |

The day comes from the database clock because the rows the view counts are stamped by that clock. The `now` argument of `dayKeyFor` is used only in the last case.

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

That runs the unit tests. They need no database, and the integration test reports as skipped.

| File | What it checks |
|------|----------------|
| `tests/entitlements.test.ts` | The service over the in memory store: plans, overrides, limits, day rollover, every flag rule, `setPlan`, expiry |
| `tests/store-contract.ts` | Not a test file. `runEntitlementStoreContract(name, makeStore, hooks)` holds the checks every adapter must pass |
| `tests/in-memory-store.test.ts` | The contract for the in memory store, and that `recordUse` counts per user, limit and day |
| `tests/postgres-store.integration.test.ts` | The contract for the Postgres store and everything below. Skipped unless `DATABASE_URL` is set |

### The integration test

It needs a PostgreSQL 16 or later with every migration applied, and a `DATABASE_URL` for the user that owns the tables. `packages/db/README.md` shows how to start one with Docker or with a local install.

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-entitlements test
```

In PowerShell set the variable first with `$env:DATABASE_URL = '...'`.

The test creates its own users through the owner connection (an insert into `users`, then `select ensure_profile(id)`), uses flag keys that start with `p133-` and a random id, and deletes all of it at the end. It drops and truncates nothing, so it can share a database with other tests.

| Check | Expected |
|-------|----------|
| The shared store contract | passes on Postgres as it does in memory |
| The row `ensure_profile` made | read as `free_beta`, source `default`, no limits of its own (since migration 0005). `remaining` is 200, 20 and 30, from `PLANS` |
| `setPlan` through the service | the row is changed, overrides are kept, `entitlement.changed` is emitted once |
| User A asks for B's entitlement as role `stufen_app` | no rows. Signed out: no rows |
| `usedToday` for a new user | 0 for all three limits |
| Two learner messages, one assistant message, one submission, one recording of 90000 ms | `usedToday` is 2, 1 and 2. `remaining` is 198, 19 and 28 |
| `consume` with room left | passes and writes nothing |
| `consume` after a per user override of 2 tutor messages | throws `LimitExceededError` with `limit` 2 and `used` 2 |
| Another user, or another day | 0 |
| `postgresDayKeyFor` for users in UTC+14 and UTC-12 | two different days, and each user's usage is found under the own day only |
| `postgresDayKeyFor` for an unknown zone, and for a user without a profile | the UTC day |
| A 50 percent flag, 40 users | the same users get it as with the in memory store |
| A learner, or nobody signed in, tries to update, insert or delete a flag | every write is refused with `permission denied` (42501, since migration 0006), and the flag is unchanged |

## Status

See the `core-entitlements` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
