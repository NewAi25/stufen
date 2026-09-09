# @stufen/core-assessment

## Purpose

Placement, level checkpoints and exam simulation.
Adaptive placement starts at A2 and steps by blocks. Exam formats come from the language pack.

Kind: `core`. May import: `contracts`.

## Public API

```ts
startPlacement(userId, language): Promise<Assessment>
startCheckpoint(userId, language, level): Promise<Assessment>
startExamSim(userId, language, level, format: ExamFormatId): Promise<Assessment>
answer(assessmentId, questionId, response): Promise<{ next: Question | null }>
finish(assessmentId): Promise<AssessmentResult>          // emits assessment.completed, calls progress.recordEstimate
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `assessments` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `assessment.completed` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-assessment/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-assessment): message`.

## How to test it

```
pnpm --filter @stufen/core-assessment test
```

## Status

See the `core-assessment` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
