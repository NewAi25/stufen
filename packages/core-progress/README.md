# @stufen/core-progress

## Purpose

Mastery per can do descriptor, level estimate and streaks.
Applies the evidence rule from ADR-004. Never grades anything itself.

Kind: `core`. May import: `contracts`.

## Public API

```ts
masteryFor(userId, language, level?): Promise<CandoMastery[]>
levelEstimate(userId, language): Promise<LevelEstimate>
recordEstimate(userId, language, level, confidence, method): Promise<void>  // emits level.reached when level rises
streak(userId, language): Promise<Streak>
levelMap(userId, language): Promise<LevelMap>            // per level: candos, mastered count, checkpoint status
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `cando_mastery` |
| `level_estimates` |
| `streaks` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `cando.mastered` |
| emits | `level.reached` |
| listens | `attempt.recorded` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-progress/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-progress): message`.

## How to test it

```
pnpm --filter @stufen/core-progress test
```

## Status

See the `core-progress` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
