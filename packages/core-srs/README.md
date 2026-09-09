# @stufen/core-srs

## Purpose

FSRS scheduling for items: review queue, ratings and review logging.
Wraps ts-fsrs so no other box sees scheduler types. See ADR-005.

Kind: `core`. May import: `contracts`.

## Public API

```ts
dueQueue(userId, language, limit?): Promise<ReviewCard[]>
review(userId, itemId, rating: 1|2|3|4): Promise<ReviewCard>     // emits item.reviewed
introduceItems(userId, itemIds): Promise<void>                   // called after a lesson introduces items
stats(userId, language): Promise<{ due: number; learning: number; mature: number }>
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `review_cards` |
| `review_logs` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `item.reviewed` |
| listens | `attempt.recorded` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-srs/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-srs): message`.

## How to test it

```
pnpm --filter @stufen/core-srs test
```

## Status

See the `core-srs` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
