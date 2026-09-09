# @stufen/core-ai-tutor

## Purpose

The only box that calls the Claude API: conversation tutor, writing grading, explanations and AI grading of open exercises.
Model ids are configuration. Grades are structured outputs. See ADR-006.

Kind: `core`. May import: `contracts`.

## Public API

```ts
startConversation(userId, language, mode, level, scenario?): Promise<Conversation>
sendTurn(conversationId, text): AsyncIterable<TutorChunk>        // streams; final chunk carries corrections; emits tutor.turn
gradeWriting(userId, language, prompt, text, targetLevel, taskId?): Promise<WritingGrade>   // emits writing.graded
explain(language, level, question, context?): Promise<string>     // grammar or vocabulary explanation on demand
aiGrade(exerciseType, payload, response, level, rules): Promise<GradeResult>   // used by core-exercise-types
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `tutor_conversations` |
| `tutor_messages` |
| `writing_submissions` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `writing.graded` |
| emits | `tutor.turn` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-ai-tutor/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-ai-tutor): message`.

## How to test it

```
pnpm --filter @stufen/core-ai-tutor test
```

## Status

See the `core-ai-tutor` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
