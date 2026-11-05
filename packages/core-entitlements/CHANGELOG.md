# Changelog

## [Unreleased]

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
