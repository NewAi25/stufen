# @stufen/core-entitlements

## Purpose

Answers "may this user do X". Plans, daily limits, feature flags and the payment adapter slot.
In beta every user is free_beta and every feature is on. See ADR-007.

Kind: `core`. May import: `contracts`.

## Public API

```ts
can(userId, feature: FeatureKey): Promise<boolean>
remaining(userId, limit: LimitKey): Promise<number>          // per day, resets at user's midnight
consume(userId, limit: LimitKey, amount?): Promise<void>     // throws when exhausted
plan(userId): Promise<Entitlement>
flag(key: string, userId?): Promise<boolean>
// Payment adapter slot, unused in beta:
interface PaymentProvider { createCheckout(...); handleWebhook(...); }
setPaymentProvider(p: PaymentProvider): void
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `entitlements` |
| `feature_flags` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

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
