# @stufen/contracts

## Purpose

Shared types, event names and interfaces that every box imports.
No logic, no database access, no dependencies.

Kind: `contracts`. May import: nothing.

## Public API

```ts
type LanguageCode = 'de' | 'nl' | 'fr';
type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type Skill = 'reading' | 'listening' | 'spoken_production' | 'spoken_interaction'
           | 'writing' | 'mediation' | 'grammar' | 'vocabulary';
type ExerciseTypeId = 'multiple_choice' | 'cloze' | 'match_pairs' | 'order_words'
           | 'translate' | 'dictation' | 'read_answer' | 'listen_answer'
           | 'write_free' | 'speak_prompt' | 'flashcard';

interface GradeResult {
  correct: boolean;          // pass or fail for evidence purposes
  score: number;             // 0 to 1
  feedback: Feedback;        // shown to the learner
  errorTypes?: ErrorType[];  // article, case, gender, word_order, spelling, tense, register, vocabulary, other
}

interface EventBus {
  emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): Promise<void>;
  on<K extends keyof EventMap>(name: K, handler: (p: EventMap[K]) => Promise<void>): () => void;
  onAny(handler: (name: string, payload: unknown) => Promise<void>): () => void;
}

// EventMap, LanguagePack, ExerciseTypeDefinition, SpeechProvider and
// PaymentProvider are listed in full in docs/04-module-contracts.md.
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/contracts/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(contracts): message`.

## How to test it

```
pnpm --filter @stufen/contracts test
```

## Status

See the `contracts` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
