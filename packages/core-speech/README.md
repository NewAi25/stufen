# @stufen/core-speech

## Purpose

Speech to text and text to speech behind one provider interface, plus a pure transcript comparison.
Web Speech API first. A paid provider is an adapter later.

Kind: `core`. May import: `contracts`.

## Public API

```ts
interface SpeechProvider {
  transcribe(audio: Blob, locale: string): Promise<{ text: string; confidence?: number }>;
  speak(text: string, locale: string, voiceHint?: string): Promise<AudioSource>;
}
setProvider(p: SpeechProvider): void
transcribe(...)   // delegates
speak(...)        // delegates
compare(transcript, target): { similarity: number; diff: WordDiff[] }   // pure, no provider
saveRecording(userId, exerciseId, audio, transcript, target): Promise<Recording>  // emits speech.transcribed
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `speech_recordings` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `speech.transcribed` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-speech/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-speech): message`.

## How to test it

```
pnpm --filter @stufen/core-speech test
```

## Status

See the `core-speech` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
