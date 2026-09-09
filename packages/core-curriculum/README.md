# @stufen/core-curriculum

## Purpose

The CEFR spine: levels, can do descriptors, units and lessons as a graph.
Read side only. Content is written into these tables by core-content.

Kind: `core`. May import: `contracts`.

## Public API

```ts
listLevels(): CefrLevel[]
listCandos(language, level?, skill?): Promise<Cando[]>
getCando(candoId): Promise<Cando>
listUnits(language, level): Promise<Unit[]>
listLessons(unitId): Promise<LessonSummary[]>
getLesson(lessonId): Promise<Lesson>                    // includes ordered exercises
nextLessonFor(userId, language): Promise<LessonSummary | null>   // first incomplete lesson at current level
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `cefr_levels` |
| `cando_descriptors` |
| `units` |
| `lessons` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-curriculum/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-curriculum): message`.

## How to test it

```
pnpm --filter @stufen/core-curriculum test
```

## Status

See the `core-curriculum` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
