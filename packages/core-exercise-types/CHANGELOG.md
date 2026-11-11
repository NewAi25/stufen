# Changelog

## [Unreleased]

## [0.1.1] - 2026-11-12

### Changed
- `match_pairs` can evidence vocabulary, grammar and reading. It never evidences speaking or writing.
- The real content test now covers every lesson file under `content/de/units`, so a new lesson is checked as soon as it exists.

## [0.1.0] - 2026-11-06

### Added
- `src/registry.ts`: `createExerciseTypeRegistry()` with `registerType`, `getType`, `listTypes` and `hasType`. Registering an id twice throws. `getType` on a missing id throws `UnknownExerciseTypeError`.
- `src/deterministic.ts`: `registerDeterministicTypes(registry)` registers the eight types graded without AI. Nothing is registered for `translate`, `write_free` or `speak_prompt`; those arrive in 0.2.0 and 0.3.0.
- `src/graders/`: one `ExerciseTypeDefinition` per type, each with `needsAi: false`, a `rendererKey` equal to its id and a `payloadSchema` that mirrors `content/schema/exercise.schema.json`: `multipleChoiceType`, `clozeType`, `matchPairsType`, `orderWordsType`, `flashcardType`, `readAnswerType`, `listenAnswerType`, `dictationType`.
- `src/responses.ts`: the response shape the learner submits for each type, and a guard per type (`checkClozeResponse` and so on) that returns the typed response or an `InvalidResponseError`.
- `src/errors.ts`: `UnknownExerciseTypeError`, `InvalidPayloadError`, `InvalidResponseError`. Each carries a `code`, and the two invalid errors carry the exercise type and a list of problems.
- `src/schema.ts`: a small JSON Schema checker for the keywords the payload schemas use. Every grader checks its payload against its own `payloadSchema` at grade time and throws `InvalidPayloadError` when it does not fit.
- `cloze` compares each blank through `ctx.languageRules.normalize` and collects `ctx.languageRules.classifyError` results for wrong blanks. Without language rules it trims and case folds.
- `read_answer` and `listen_answer` grade option questions by index. They also accept a short answer question (`question`, `answer`, optional `accept`), which the content schema does not define yet. See the README.
- Tests: one file per grader with right, wrong, partial and malformed cases, `tests/registry.test.ts`, `tests/schema-parity.test.ts` (each `payloadSchema` against the content schema), and `tests/pack.test.ts`, which grades every deterministic exercise in `content/de/units/A1/01-hallo/lesson-01.json` and `lesson-02.json`.
