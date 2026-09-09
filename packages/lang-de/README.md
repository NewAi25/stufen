# @stufen/lang-de

## Purpose

German language pack: implements LanguagePack over content/de and holds the German rules the graders need.
Data and language rules only. No UI, no database, no core internals.

Kind: `lang`. May import: `contracts`.

## Public API

```ts
// Implements LanguagePack from contracts (code, version, loadManifest, loadCandos,
// loadItems, loadUnits, rules, immersionRamp, examFormats, tts).
rules: {
  articles: { nominative, accusative, dative, genitive } per gender and number;
  nounGender(lemma): 'm' | 'f' | 'n' | undefined;
  conjugate(verb, person, tense): string | undefined;   // regular and listed irregular verbs
  normalize(text): string;                              // ß, umlauts, case folding for lenient compare
  classifyError(expected, actual): ErrorType[];         // used by cloze and translate graders
}
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/lang-de/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(lang-de): message`.

## How to test it

```
pnpm --filter @stufen/lang-de test
```

## Status

See the `lang-de` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
