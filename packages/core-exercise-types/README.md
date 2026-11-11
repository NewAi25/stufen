# @stufen/core-exercise-types

## Purpose

Registry of exercise types. Each type has a payload schema, a grader and a renderer key.
Pure logic. No tables. Language rules and the AI grader arrive through GradeContext.

Kind: `core`. May import: `contracts`.

## Public API

Version 0.1.0 ships the registry and the eight types that are graded without AI.
`translate`, `write_free` and `speak_prompt` are not registered yet. Asking the registry for one of them throws `UnknownExerciseTypeError`.

```ts
createExerciseTypeRegistry(): ExerciseTypeRegistry
registerDeterministicTypes(registry: ExerciseTypeRegistry): void   // registers the eight types below

interface ExerciseTypeRegistry {
  registerType(def: ExerciseTypeDefinition): void;     // throws when the id is already registered
  getType(id: ExerciseTypeId): ExerciseTypeDefinition; // throws UnknownExerciseTypeError when missing
  listTypes(): ExerciseTypeDefinition[];               // in registration order
  hasType(id: ExerciseTypeId): boolean;
}

interface ExerciseTypeDefinition {                     // from contracts
  id: ExerciseTypeId;
  skill: Skill[];                          // which skills it can evidence
  payloadSchema: JSONSchema;               // validated at pack install
  grade(payload, response, ctx: GradeContext): Promise<GradeResult>;   // ctx has languageRules and aiGrader
  needsAi: boolean;                        // false for all eight
  rendererKey: string;                     // equal to the id
}
```

Typical wiring in `apps/web`:

```ts
const registry = createExerciseTypeRegistry();
registerDeterministicTypes(registry);
const result = await registry.getType('cloze').grade(payload, { answers: ['bin'] }, ctx);
```

### The eight deterministic types

Each definition is also exported on its own, under the name in the first column.

| Type and export | Skills | Response the learner submits | Scoring rule |
|-----------------|--------|------------------------------|--------------|
| `multiple_choice` `multipleChoiceType` | all eight | `{ selected: number \| number[] }` zero based option index | Correct when the chosen set equals the correct set. Score 1 or 0 |
| `cloze` `clozeType` | grammar, vocabulary | `{ answers: string[] }` one per blank, in order | Each blank is compared after `languageRules.normalize` against `answer` and `accept`. Score is the share of blanks right. Correct when all are. Wrong blanks add `classifyError` results to `errorTypes` |
| `match_pairs` `matchPairsType` | vocabulary | `{ pairs: { left: string; right: string }[] }` | Score is the share of pairs joined correctly. Correct when all are |
| `order_words` `orderWordsType` | grammar | `{ order: string[] }` the tokens as placed | Correct only on an exact match with `answer` or an `accept` entry, after normalising spaces. Score is the share of words in the right position against the closest accepted order. `errorTypes` is `['word_order']` when wrong |
| `flashcard` `flashcardType` | vocabulary | `{ rating: 'again' \| 'hard' \| 'good' \| 'easy' }` | Self rated. Correct unless `again`. Score 0, 0.6, 0.8, 1 |
| `read_answer` `readAnswerType` | reading | `{ answers: (number \| string)[] }` one per question | Option question: the index must equal `answer_index`. Short answer question: exact match after normalising against `answer` and `accept`. Score is the share of questions right. Correct when all are |
| `listen_answer` `listenAnswerType` | listening | `{ answers: (number \| string)[] }` one per question | Same as `read_answer`. The transcript is never put into the feedback |
| `dictation` `dictationType` | listening, writing | `{ text: string; replays?: number }` | Text and target are normalised and split into words, with punctuation at word edges dropped. Score is 1 minus the word error rate (word level edit distance over the target word count), never below 0. The best score over `text` and `accept` counts. Correct from 0.9 up. `errorTypes` is `['spelling']` when wrong |

Normalising means `ctx.languageRules.normalize` when the context carries language rules. Without rules the graders trim, collapse spaces and case fold.

### Responses and guards

Every response type is exported: `MultipleChoiceResponse`, `ClozeResponse`, `MatchPairsResponse`, `OrderWordsResponse`, `FlashcardResponse`, `ReadAnswerResponse`, `ListenAnswerResponse`, `DictationResponse`, plus `FlashcardRating` and `FLASHCARD_RATINGS`.

Each has a guard that never throws:

```ts
checkClozeResponse(response: unknown): ResponseCheck<ClozeResponse>
// same pattern: checkMultipleChoiceResponse, checkMatchPairsResponse, checkOrderWordsResponse,
// checkFlashcardResponse, checkReadAnswerResponse, checkListenAnswerResponse, checkDictationResponse

type ResponseCheck<T> = { ok: true; value: T } | { ok: false; error: InvalidResponseError };
```

Extra fields on a response are ignored, so a renderer may add its own.

### Errors

| Error | Thrown when | Fields |
|-------|-------------|--------|
| `UnknownExerciseTypeError` | `getType` is asked for an id that is not registered | `code: 'unknown_exercise_type'`, `exerciseType` |
| `InvalidPayloadError` | `grade` gets a payload that does not fit the type's `payloadSchema`, or an `answer_index` outside the options, or a cloze text whose gap count differs from `blanks`, or an `order_words` answer that does not use the word bank | `code: 'invalid_payload'`, `exerciseType`, `problems: string[]` |
| `InvalidResponseError` | `grade` gets a response of the wrong shape, the wrong number of answers, or an option index outside the options | `code: 'invalid_response'`, `exerciseType`, `problems: string[]` |

`grade` is async, so these arrive as a rejected promise. A wrong answer is never an error. It is a `GradeResult` with `correct: false`.

### Feedback copy

`feedback.message` is plain English and follows the copy rules in `docs/06-ui-ux.md`. It starts with `Correct.`, `Partly correct.` or `Not quite.` and then says what the answer is. It never comments on the learner. `feedback.expected` holds the right answer and `feedback.explanation` holds `explanation_en` from the payload when there is one.

### Short answer questions

`docs/06-ui-ux.md` says a `read_answer` or `listen_answer` question is a choice list or a short text input. `content/schema/exercise.schema.json` only defines the choice form (`question`, `options`, `answer_index`). The graders accept both. A short answer question has `question`, `answer` and optional `accept` and `explanation_en`. No content uses that form today, and the content schema must gain it in its own change before any content can.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-exercise-types/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-exercise-types): message`.

To add a grader: write `src/graders/<type>.ts` with the payload schema, a `parse<Type>Payload` function and the definition. Add the response type and guard to `src/responses.ts`. Export both from `src/index.ts`. Add `tests/<type>.test.ts` with right, wrong, partial and malformed cases. Keep the payload schema equal to `content/schema/exercise.schema.json`. `tests/schema-parity.test.ts` fails when the two drift apart, and `tests/pack.test.ts` grades the real German lessons.

## How to test it

```
pnpm --filter @stufen/core-exercise-types test
```

| Test file | What it shows |
|-----------|---------------|
| `tests/registry.test.ts` | Register, get, list, duplicate id, unknown id, the eight types and nothing for the AI types |
| `tests/<type>.test.ts` | One file per grader: right, wrong, partial and malformed cases |
| `tests/schema-parity.test.ts` | Each type's `payloadSchema` says the same as `content/schema/exercise.schema.json` |
| `tests/pack.test.ts` | Every deterministic exercise in the two lessons of `content/de/units/A1/01-hallo` fits its schema, grades a right answer as correct and a wrong answer as not correct |

## Status

See the `core-exercise-types` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
