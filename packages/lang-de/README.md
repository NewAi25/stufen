# @stufen/lang-de

## Purpose

German language pack: implements LanguagePack over content/de and holds the German rules the graders need.
Data and language rules only. No UI, no database, no core internals.

Kind: `lang`. May import: `contracts`.

## Public API

```ts
// The pack. Reads content/de with synchronous fs calls, so call it on the server only.
createGermanPack(options?: { contentDir?: string }): LanguagePack
defaultContentDir(): string                      // content/de of this repo

// LanguagePack from contracts:
//   code 'de', version (from pack.json),
//   loadManifest(), loadCandos(), loadItems(), loadUnits(),   read from disk on every call
//   rules, immersionRamp, examFormats, tts                    read once when the pack is created

// The rules as one object, built from a list of items.
germanRules(items: ItemInput[]): LanguageRules
rules: {
  articles: { nominative, accusative, dative, genitive } per gender and number;   // definite articles
  nounGender(lemma): 'm' | 'f' | 'n' | undefined;
  conjugate(verb, person, tense): string | undefined;   // regular and listed irregular verbs
  normalize(text): string;                              // ß, umlauts, case folding for lenient compare
  classifyError(expected, actual): ErrorType[];         // used by cloze and translate graders
}

// Articles
DEFINITE_ARTICLES, INDEFINITE_ARTICLES, NEGATIVE_ARTICLES, ARTICLE_TABLES   // case, then m | f | n | plural
POSSESSIVE_STEMS, EIN_WORD_ENDINGS, CASES, NUMBERS
article(kind: 'definite' | 'indefinite' | 'negative', case, genderOrPlural): string
possessive(person, case, genderOrPlural): string        // possessive('ich', 'accusative', 'm') is "meinen"

// Comparing text
normalize(text): string            // lenient form
normalizeStrict(text): string      // spacing and final punctuation only
equalsLenient(a, b): boolean       // forgives case, final punctuation, ss for ß, ae oe ue for ä ö ü
equalsStrict(a, b): boolean        // case and umlauts matter

// Nouns
createNounGender(items): (lemma: string) => Gender | undefined

// Verbs
conjugate(verb, person, tense): string | undefined
participle(verb): { participle: string; auxiliary: 'haben' | 'sein' } | undefined
splitSeparable(verb): { prefix: string; base: string } | undefined
createConjugate(items): conjugate that lets forms listed in the pack win
parsePerson(person), parseTense(tense)
PERSONS, IRREGULAR_PRESENT, STEM_CHANGES, PARTICIPLES, SEPARABLE_PREFIXES

// Errors
classifyError(expected, actual): ErrorType[]
createClassifyError(nounGender?): classifyError that knows the gender of the pack's nouns
```

Source of truth: `docs/04-module-contracts.md`. The `LanguagePack` and `rules` shapes are defined there. The other names above are this box's own helpers and are public because `src/index.ts` exports them.

### The loader

| Pack part | Read from | Notes |
|-----------|-----------|-------|
| `loadManifest()` | `pack.json` | Throws if `code` is not `de` or `version` is missing |
| `loadCandos()` | every `candos/*.json` | Levels in CEFR order |
| `loadItems()` | every `items/*.jsonl` | One JSON object per line. Blank lines are skipped. A bad line throws an error with the file name and the line number |
| `loadUnits()` | every `units/<LEVEL>/<nn-slug>/unit.json` | Each unit carries its lessons in the order `unit.json` lists them, each lesson with its exercises |
| `immersionRamp` | `ramp.json` | One mode per level, taken from the `instructions` field. A level the file does not list is `target` |
| `examFormats` | `exam-formats.json` | Passed through as written |
| `tts` | `pack.json` | `tts.locale` and `tts.voiceHint`, with `de-DE` as fallback locale |

The loader parses and shapes files. It does not validate them against `content/schema/`. That is the job of `core-content`.

### What the rules cover

Coverage is A1 and grows with each level.

| Rule | Covered now |
|------|-------------|
| Articles | Definite, indefinite and `kein` in four cases for masculine, feminine, neuter and plural. Possessives for every person, with `euer` shortening to `eur` before an ending |
| Noun gender | Every vocab item in the pack that has `payload.gender`. Nothing is guessed from word endings |
| Present tense, regular | Infinitives in `en`, `eln` and `ern`. Linking e after stems in t or d and after a consonant plus m or n (`arbeitest`, `öffnet`). No extra s after stems in s, ß, z or x (`du heißt`) |
| Present tense, listed in full | sein, haben, werden, wissen, können, müssen, wollen, sollen, dürfen, mögen, möchten, tun |
| Present tense, stem change | fahren, sprechen, lesen, sehen, nehmen, essen, geben, schlafen, laufen, treffen, helfen, tragen, waschen, fangen, laden, halten, lassen, fallen, vergessen. A stem change carries over an inseparable prefix (`versprichst`, `gefällt`) |
| Separable verbs | Prefixes an, auf, aus, ein, mit, zu, ab, vor, nach, weg, zurück, fern and zusammen. The result is the split form, `stehe auf` |
| Perfekt | Participle and auxiliary for the listed verbs above except möchten, plus kommen, gehen, bleiben, heißen, stehen, trinken, finden, schreiben, rufen, machen, wohnen, lernen, arbeiten, kaufen, spielen, hören, sagen, fragen, gefallen, bekommen, verstehen, beginnen, besuchen, bezahlen. A separable verb takes the participle of its base verb (`ferngesehen`) |
| Error types | article, case, gender, word_order, spelling, vocabulary, other, as defined in `docs/10-ai-tutor.md`. `tense` and `register` are never returned yet |

Things to know before relying on it:

- `conjugate` accepts a person as `1sg` to `3pl` or as a pronoun. `sie` is she, `sie_plural` is they, `Sie` with a capital is the formal address. Tenses are `present` (also `Präsens`) and `perfekt`. Anything else gives `undefined`.
- A verb that is not listed is treated as regular. A strong verb missing from `src/rules/verb-tables.ts` would come out with a regular stem. Two guards exist. The rules object of a pack takes present forms from a verb item's `payload.forms` first. And `tests/index.test.ts` fails when a verb in `content/de` states a form the rules disagree with, and names the verb.
- A separable prefix outside the list (los, um, her, hin and others) is not detected yet.
- `classifyError` compares two strings. It names the likely kind of slip. It does not decide whether an answer is accepted. Wrong capitalisation counts as `spelling`. `case` means grammatical case.
- Lenient compare treats `Maße` and `Masse` as equal. Use `equalsStrict` where that matters.

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
