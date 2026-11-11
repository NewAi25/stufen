# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-11

### Added
- `src/postgres-store.ts`: `createPostgresCurriculumStore(db)`, the Postgres adapter for the `CurriculumStore` and `SnapshotWriter` ports (P1-27). Reads run inside `withUser(db, null, fn)`, as the restricted role `stufen_app` with nobody signed in. `replaceLanguage` is owner work on `db` in one transaction.
- `replaceLanguage` on Postgres upserts every cando, item, unit, lesson and exercise of the snapshot by id (`insert ... on conflict (id) do update`), then deletes the rows of that language the snapshot no longer carries: exercises, lessons, units, items, candos, in that order. A row that stays in the pack is updated in place and keeps its id and `created_at`, so the learner rows that point at it are untouched. It then writes `languages.pack_version`, which is what `activeVersion` reads. The `languages` row is locked first, so two installs of one language run one after the other.
- One mapping between the snake_case columns and the contracts `Cando`, `Unit`, `LessonSummary`, `Exercise` and `Item` shapes. A language code or exercise type in the database that is not in `LANGUAGE_CODES` or `EXERCISE_TYPES` throws. jsonb values are written as JSON text.
- `nextLessonFor(userId, language)` on the service (P1-21): the first lesson of `lessonPath(language)` whose id is not in `await completedLessonIds(userId)`. Null when every lesson is completed or the language has no lessons. `completedLessonIds` is a new optional option of `createCurriculum`; without it the first lesson of the path is returned.
- `InvalidSnapshotError`, thrown by `replaceLanguage` of both adapters before anything is written: a unit, item or cando of another language, a lesson or exercise that names the wrong parent, or an id that appears twice. The Postgres adapter also throws it for an id that is not a uuid, for a language that is not in `languages`, and for an id that is already stored for another language.
- `src/order.ts`: the comparators for every promised ordering, used by the service and both adapters. The Postgres adapter sorts with them too, so the order does not depend on the database collation.
- `src/index.ts` exports `createPostgresCurriculumStore`, `InvalidSnapshotError` and the types `CurriculumService` and `LessonPathEntry`.
- `tests/store-contract.ts`: `runCurriculumStoreContract(name, makeStore)`, the behaviour both adapters must show, written against the two ports only. `tests/store-contract.memory.test.ts` runs it for the in memory store, `tests/postgres-store.integration.test.ts` for Postgres.
- `tests/postgres-store.integration.test.ts`: skipped without `DATABASE_URL`. Runs the contract on a real Postgres and adds the Postgres only checks: a second replace keeps the ids and `created_at` of unchanged rows, removes a dropped lesson with its exercises and updates a changed payload; a lesson session, attempts, a review card and a mastery row survive a replace; reads work signed out and signed in while the restricted role cannot write; two replaces at once; a refused replace changes nothing.
- `tests/next-lesson.test.ts`: every case of `nextLessonFor`.

### Changed
- `CurriculumWriter` is now an alias of `SnapshotWriter` from contracts, so there is one definition. `createInMemoryCurriculumStore()` is typed `CurriculumStore & SnapshotWriter`.
- Common descriptors (`languageCode` null) belong to no language. A replace adds or updates the ones in the snapshot and never removes one. The in memory store now does the same: it keeps them in their own map, and when two packs carry the same common id the pack installed last wins. In 0.1.0 a common descriptor disappeared when the only pack that carried it was replaced without it.
- `tests/fixtures.ts` is now `createFixture()`. Every id is a fresh uuid, and slugs, codes and keys end in a tag that is new per fixture. `tests/curriculum.test.ts` keeps the service tests; the store tests moved into the contract.

### Notes
- `lesson_sessions.lesson_id` references `lessons` without a delete rule. A replace that removes a lesson some learner has a session on is refused by Postgres. The adapter reports it with a message that says so and the whole replace rolls back. Removing such a lesson needs a schema decision in `db` first.
- The other learner foreign keys act as the schema says when a row leaves the pack: `attempts.exercise_id` and `attempts.item_id` become null; `review_cards`, `review_logs`, `cando_mastery` and `cando_outcomes` rows of a removed item or cando are deleted by cascade.
- `unique (language_code, slug)`, `(unit_id, slug)`, `(language_code, code)` and `(language_code, key)` are checked by Postgres per statement. A new id that takes over the slug, code or key of a row removed in the same replace is refused, because the upsert runs before the delete. Ids are derived from those keys, so a pack built by core-content does not do this.
- `cando_descriptors.mastery_rule` holds the contracts `MasteryRule` as JSON with its camelCase keys.


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
