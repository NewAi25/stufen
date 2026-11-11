# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-06

### Added
- `src/loader.ts`: `createGermanPack({ contentDir })` returns the German `LanguagePack`. It reads `pack.json`, every `candos/*.json`, every `items/*.jsonl` (one JSON object per line, blank lines skipped, a bad line throws an error that names the file and the line number), and every `units/<level>/<nn-slug>/unit.json` with its lesson files in the order the unit lists them. Levels are read in CEFR order. `immersionRamp` comes from `ramp.json`, `examFormats` from `exam-formats.json`, `tts` from the manifest with the locale `de-DE` as fallback. `defaultContentDir()` resolves the repo's `content/de` from the file's own location. All reads are synchronous and belong on the server.
- `src/rules/articles.ts`: the definite, indefinite and negative (`kein`) article tables for four cases across masculine, feminine, neuter and plural, the possessive stems and the ein word endings, with `article(kind, case, genderOrPlural)` and `possessive(person, case, genderOrPlural)`.
- `src/rules/normalize.ts`: `normalize` for lenient compare (trim, single spaces, NFC, German lower case, no final punctuation, ß as ss, ä ö ü as ae oe ue), `normalizeStrict`, `equalsLenient` and `equalsStrict`.
- `src/rules/gender.ts`: `createNounGender(items)` builds `nounGender(lemma)` from the vocab items that carry `payload.gender`. Case insensitive, with or without an article.
- `src/rules/conjugate.ts` and `src/rules/verb-tables.ts`: `conjugate(verb, person, tense)` for the present tense and the Perfekt. Regular verbs by rule, including stems in t or d, stems in s, ß, z or x, and infinitives in eln and ern. Listed irregular and stem changing verbs. Separable verbs give the split form (`stehe auf`). `participle(verb)` gives Partizip II and auxiliary where listed. Unknown input gives `undefined`.
- `src/rules/classify-error.ts` and `src/rules/determiners.ts`: `classifyError(expected, actual)` names article, case, gender, word order, spelling, vocabulary or other, following the error type guide in `docs/10-ai-tutor.md`. `createClassifyError(nounGender)` uses the gender of the noun when the pack knows it.
- `src/rules/german-rules.ts`: `germanRules(items)` assembles the `LanguageRules` object. `createConjugate(items)` lets present forms listed in a verb item's `payload.forms` win over the rules. The pack returned by `createGermanPack` has `rules` assembled from its own items.
- `src/index.ts` exports all of the above.
- Tests: `loader`, `articles` (every cell of every table), `normalize`, `gender`, `conjugate` (384 present forms across 64 verbs and 36 participles with auxiliary, each written out by hand), `classify-error` (34 pairs without a noun lexicon, 10 with one), `index` (public surface, rules of the real pack, rules against the verb forms the content states). No test hard codes a count of content items.
