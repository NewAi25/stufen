# @stufen/core-analytics

## Purpose

Event sink. Subscribes to every event on the bus and writes an events row.
Sampled on free tiers. Never read by other boxes.

Kind: `core`. May import: `contracts`.

## Public API

```ts
track(userId | null, name, props?): Promise<void>
attach(bus: EventBus): void            // subscribes onAny and writes events
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `events` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| listens | `* (onAny, every event)` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-analytics/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-analytics): message`.

## How to test it

```
pnpm --filter @stufen/core-analytics test
```

## Status

See the `core-analytics` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
