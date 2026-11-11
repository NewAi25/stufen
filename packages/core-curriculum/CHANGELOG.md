# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-06

### Added
- `src/store.ts`: the `CurriculumStore` read port (`listCandos(language, filter?)`, `getCando`, `listUnits(language, level?)`, `listLessonSummaries`, `getLesson`, `getItems`, `listItems(language, level?)`, `findLessonUnit`, `activeVersion`) and the `CurriculumWriter` port (`replaceLanguage(snapshot)`). Every list has a fixed order: candos by level, then `code`; units by level, then `ordinal`; lessons and exercises by `ordinal`; items by level, then `key`.
- `createInMemoryCurriculumStore()` implements both ports. It keeps one `CurriculumSnapshot` per language. `replaceLanguage` swaps the whole snapshot of that language in one step and leaves other languages alone. Snapshots are copied on the way in and rows on the way out.
- Common CEFR descriptors (`languageCode` null) are returned for every language together with the language specific ones, each id once, also when two packs carry the same descriptor.
- `src/curriculum.ts`: `createCurriculum({ store })` returning `listLevels`, `listCandos`, `getCando`, `listUnits`, `listLessons`, `getLesson` and `lessonPath`. The store is injected; there is no module level state. The service applies its promised orderings itself, so they hold for any adapter.
- `CurriculumNotFoundError` with `kind` (`cando` or `lesson`) and `id`, thrown by `getCando` and `getLesson` for an unknown id.
- `lessonPath(language)`: every lesson summary of the language in learning order (level, then unit `ordinal`, then lesson `ordinal`), each with its unit and level. A later row uses it to find the next lesson.
- `tests/fixtures.ts` and `tests/curriculum.test.ts`: every function, the orderings, the level and skill filters, both not found errors, exercises in `ordinal` order, `lessonPath` order, copies on read and write, and `replaceLanguage` replacing one language only.

### Not yet
- `nextLessonFor(userId, language)` and the Postgres adapter are later rows.
