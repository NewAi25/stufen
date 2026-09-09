# @stufen/core-exercise-types

## Purpose

Registry of exercise types. Each type has a payload schema, a grader and a renderer key.
Pure logic. No tables. Language rules and the AI grader arrive through GradeContext.

Kind: `core`. May import: `contracts`.

## Public API

```ts
registerType(def: ExerciseTypeDefinition): void
getType(id: ExerciseTypeId): ExerciseTypeDefinition
listTypes(): ExerciseTypeDefinition[]

interface ExerciseTypeDefinition {
  id: ExerciseTypeId;
  skill: Skill[];                          // which skills it can evidence
  payloadSchema: JSONSchema;               // validated at pack install
  grade(payload, response, ctx: GradeContext): Promise<GradeResult>;   // ctx has languageRules and aiGrader
  needsAi: boolean;                        // translate, write_free, speak_prompt
  rendererKey: string;                     // apps/web maps this to a component
}
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-exercise-types/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-exercise-types): message`.

## How to test it

```
pnpm --filter @stufen/core-exercise-types test
```

## Status

See the `core-exercise-types` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
