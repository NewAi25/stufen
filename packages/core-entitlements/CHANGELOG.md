# Changelog

## [Unreleased]

## [0.2.2] - 2026-11-11

### Changed
- Follows migration 0006: the app role lost its insert, update and delete grants on content tables, `feature_flags` included. A learner's update on a flag is now refused with `permission denied` (42501), where it used to match no row.
- `tests/postgres-store.integration.test.ts`: the flag write check expects 42501 for an update, an insert and a delete by a learner, and for an update when nobody is signed in. The flag stays as it was.
- README: the access model table and the integration test table say the same.
- README: the integration test table still said the row from `ensure_profile` carries limits 200, 20 and 30. Since migration 0005 it carries none, and the numbers come from `PLANS`. Corrected.
- No change to `src/`. `setFlag` was already owner work on `db`.

## [0.2.1] - 2026-11-11

### Changed
- Follows migration 0005: the default row has no limits of its own, so plan numbers come from `PLANS` for every user.

## [0.2.0] - 2026-11-06

### Added
- `src/postgres-store.ts`: `createPostgresEntitlementStore(db)`, the Postgres adapter for the `EntitlementStore` port (P1-33).
  - `getEntitlement` reads the own row inside `withUser(db, userId)`, as role `stufen_app`, so row level security applies.
  - `upsertEntitlement` is owner work on `db`: an insert that turns into an update on conflict, because `ensure_profile` has usually created the row at sign up. It returns the stored row.
  - `getFlag` reads inside `withUser(db, null)`. Flags are content and need no user.
  - `setFlag` is owner work on `db`, insert or update on conflict.
  - `usedToday` reads the matching column of the view `daily_usage` for that user and day inside `withUser`, and returns 0 when there is no row.
  - `recordUse` does nothing. Usage is counted from the tutor messages, writing submissions and speech recordings themselves.
  - One mapping between the snake_case row and the `Entitlement` shape from `contracts`. `features` and `limits` come back as plain objects, timestamps as ISO strings.
- `postgresDayKeyFor(db)`: the `dayKeyFor` option of `createEntitlements` for the Postgres store. It asks Postgres for the user's current local day in `profiles.timezone`, the same day the view files usage under. A user without a profile gets the UTC date.
- `tests/store-contract.ts`: `runEntitlementStoreContract(name, makeStore, hooks)`, the behaviour both adapters share: a missing row reads as null, upsert then get, a second upsert replaces the row, two users do not mix, flags get and set.
- `tests/in-memory-store.test.ts`: the contract for the in memory store, plus its own usage counting.
- `tests/postgres-store.integration.test.ts`: the contract for Postgres, the default row from `ensure_profile`, `setPlan` through the service, row security between two users, usage counted from real rows, `remaining` and `consume` with a per user override, the local day helper, and flags compared with the in memory store. Skipped unless `DATABASE_URL` is set.

### Changed
- `src/index.ts` also exports `createPostgresEntitlementStore` and `postgresDayKeyFor`.
- README: the adapter, the access model, the day key helper and how to run the integration test.

### Notes
- With the Postgres store, `updatedAt` on a row that already existed is the database time of the write. The trigger `entitlements_updated` sets it and the value passed in is ignored.
- The port has no "who is asking" argument. The store always reads as the user whose row is asked for, so the box that calls it must pass the signed in user's id.
- No migration and no change to `contracts` or `db`.

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `EntitlementStore` port (`getEntitlement`, `upsertEntitlement`, `getFlag`, `setFlag`, `usedToday`, `recordUse`) and `createInMemoryEntitlementStore()`, which keeps rows in Maps and hands out copies. Local types `FeatureFlag` and `FlagRules` describe a `feature_flags` row, because `contracts` has no type for it yet.
- `src/plans.ts`: `PLANS`, the plan definitions as data, and `DEFAULT_PLAN`. `free_beta` is the only active plan: every feature on, 200 tutor messages, 20 writing grades and 30 speech minutes a day, matching the column default in migration 0001. `free`, `plus` and `pro` from `docs/12` are encoded and marked inactive.
- `src/entitlements.ts`: `createEntitlements({ store, bus, now?, dayKeyFor? })`, a factory with no module level state. It returns `plan`, `can`, `remaining`, `consume`, `flag` and `setPlan`.
  - `plan` returns the stored row or creates the `free_beta` default on first call.
  - Per user `features` and `limits` overrides on the row win over the plan.
  - `remaining` is the limit minus today's use and never goes below zero.
  - `consume` throws `LimitExceededError` (with `limitKey`, `limit`, `used`, `requested`) when the amount is more than what is left, and a `RangeError` for an amount that is not a positive number. Otherwise it records the use.
  - The day a use counts toward comes from `dayKeyFor(userId, now)`, default the UTC date, so the app can pass the user's timezone later.
  - `flag` follows the rule order in `docs/12`: disabled, deny list, allow list, plan list, level gate from `ctx.level`, percent rollout by a stable FNV-1a hash of key plus user id, then on. An unknown key is off.
  - `setPlan` keeps the overrides, clears any expiry and emits `entitlement.changed`.
  - An expired row falls back to `free_beta` during beta. The row is rewritten on read and `entitlement.changed` is emitted once.
- `tests/entitlements.test.ts`: the acceptance checks (a new user gets `free_beta`, `can(user, 'tutor')` is true, `consume` past the limit throws) plus overrides, the daily count, day rollover, every flag rule, `setPlan` and expiry.

### Not in this version
- No payment code. `PaymentProvider` and `setPaymentProvider` are not implemented; the slot stays empty until the entitlements phase.
- No Postgres adapter. That is P1-33.
