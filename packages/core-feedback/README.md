# @stufen/core-feedback

## Purpose

In app feedback capture.
Small on purpose. One table, two functions.

Kind: `core`. May import: `contracts`.

## Public API

```ts
submit(input: { userId?: string; kind; page; message; rating?; context? }): Promise<void>   // emits feedback.submitted
listMine(userId): Promise<FeedbackItem[]>
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `feedback` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `feedback.submitted` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-feedback/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-feedback): message`.

## How to test it

```
pnpm --filter @stufen/core-feedback test
```

## Status

See the `core-feedback` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
