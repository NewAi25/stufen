# @stufen/core-curriculum

## Purpose

The CEFR spine: levels, can do descriptors, units and lessons as a graph. The service is read only. The store also carries the write port that core-content calls when it installs a pack.

Kind: `core`. May import: `contracts`, `db`.

## Public API

`src/index.ts` exports `createCurriculum`, `createInMemoryCurriculumStore`, `createPostgresCurriculumStore`, the errors `CurriculumNotFoundError` and `InvalidSnapshotError`, and the types `CurriculumService`, `LessonPathEntry`, `CurriculumStore` and `CurriculumWriter`. Nothing is a singleton. `apps/web` builds one store and passes it in.

```ts
import { createDb } from '@stufen/db';
import { createCurriculum, createPostgresCurriculumStore } from '@stufen/core-curriculum';

const store = createPostgresCurriculumStore(createDb(url)); // a CurriculumStore and a SnapshotWriter
const curriculum = createCurriculum({ store, completedLessonIds }); // completedLessonIds is optional

curriculum.listLevels(): CefrLevel[]
curriculum.listCandos(language, level?, skill?): Promise<Cando[]>
curriculum.getCando(candoId): Promise<Cando>
curriculum.listUnits(language, level): Promise<Unit[]>
curriculum.listLessons(unitId): Promise<LessonSummary[]>
curriculum.getLesson(lessonId): Promise<Lesson>          // includes ordered exercises
curriculum.lessonPath(language): Promise<LessonPathEntry[]>
curriculum.nextLessonFor(userId, language): Promise<LessonSummary | null>
```

| Function | What it returns |
|----------|-----------------|
| `listLevels` | The six CEFR levels, A1 first. A fresh array on every call |
| `listCandos` | Descriptors of the language plus the common CEFR descriptors (`languageCode` null), each once, by level and then `code`. `level` and `skill` narrow the list |
| `getCando` | One descriptor. Rejects with `CurriculumNotFoundError` (`kind` is `cando`) for an unknown id |
| `listUnits` | Units of one level in `ordinal` order, without their lessons |
| `listLessons` | Lessons of one unit in `ordinal` order, without exercises. Empty for an unknown unit |
| `getLesson` | One lesson with its exercises in `ordinal` order. Rejects with `CurriculumNotFoundError` (`kind` is `lesson`) for an unknown id |
| `lessonPath` | Every lesson of the language in learning order: level, then unit `ordinal`, then lesson `ordinal`. Each `LessonPathEntry` is `{ lesson, unit, level }` |
| `nextLessonFor` | The first lesson of `lessonPath` the learner has not completed, or null |

`CurriculumNotFoundError` has two properties: `kind` (`'cando'` or `'lesson'`) and `id`.

### nextLessonFor

`nextLessonFor(userId, language)` walks `lessonPath(language)` and returns the first lesson whose id is not in `await completedLessonIds(userId)`. It returns null when every lesson is completed and when the language has no lessons. Completed ids that are not on the path are ignored.

`completedLessonIds` is `(userId: string) => Promise<readonly string[]>`. This box does not know where completions are stored. The composition root passes the function of core-lesson-engine, because boxes do not import each other. When the option is left out, nothing counts as completed and `nextLessonFor` returns the first lesson of the path. If the function rejects, `nextLessonFor` rejects with the same error.

### Storage ports

`CurriculumStore` is the read port this box needs. `CurriculumWriter` is the write port that core-content calls when it installs a pack. It is an alias of `SnapshotWriter` in contracts, so there is one definition. The two boxes never import each other. The app hands the same store object to both.

```ts
interface CurriculumStore {
  listCandos(language, filter?: { level?; skill? }): Promise<Cando[]>;
  getCando(id): Promise<Cando | null>;
  listUnits(language, level?): Promise<Unit[]>;
  listLessonSummaries(unitId): Promise<LessonSummary[]>;
  getLesson(lessonId): Promise<Lesson | null>;
  getItems(ids): Promise<Item[]>; // in the order asked, unknown ids skipped
  listItems(language, level?): Promise<Item[]>;
  findLessonUnit(lessonId): Promise<Unit | null>;
  activeVersion(language): Promise<string | null>;
}

type CurriculumWriter = SnapshotWriter; // replaceLanguage(snapshot: CurriculumSnapshot): Promise<void>
```

Two adapters implement both ports. `tests/store-contract.ts` holds the behaviour both must show.

| Adapter | Use |
|---------|-----|
| `createInMemoryCurriculumStore()` | Unit tests and local runs. Copies data on the way in and on the way out |
| `createPostgresCurriculumStore(db)` | The real store. `db` is the owner connection from `createDb` |

### The Postgres adapter

`createPostgresCurriculumStore(db)` reads and writes `cando_descriptors`, `units`, `lessons`, `exercises` and `items`, and keeps the installed version in `languages.pack_version`.

Reads run inside `withUser(db, null, fn)`. That is the restricted role `stufen_app` with nobody signed in, so every read also shows that the content policies allow it. An id that is not a uuid cannot be stored, so it is answered as unknown without a query. Lists are sorted in this box with the comparators of `src/order.ts`, not by the database, so the order is the same as in memory whatever the collation is.

`replaceLanguage` is owner work. The restricted role has a read policy only, so the adapter uses `db` directly, in one transaction. One function per table maps between the snake_case columns and the contracts types. That mapping is the only place that knows the column names.

### What replaceLanguage does

The rules hold for both adapters unless a line names Postgres.

1. The snapshot is checked before anything is written. `InvalidSnapshotError` is thrown when a unit or item carries another language, a cando carries another language (null is allowed), a lesson names a unit it does not sit in, an exercise names a lesson it does not sit in, or an id appears twice. On Postgres also when an id is not a uuid, when the language is not in `languages`, or when an id is already stored for another language or as a common descriptor.
2. Everything happens in one step. Readers see the old content or the new content, never a mix. On Postgres it is one transaction, and the `languages` row is locked so two installs of one language wait for each other. If any statement fails, nothing is changed.
3. Every cando, item, unit, lesson and exercise of the snapshot is upserted by id: inserted when new, updated in place when the id is already stored. A row that stays in the pack is never deleted and inserted again. Learner tables point at these ids (`attempts.exercise_id`, `lesson_sessions.lesson_id`, `review_cards.item_id`, `cando_mastery.cando_id`) and some of those foreign keys cascade. On Postgres the row keeps its `created_at`.
4. Then the rows of that language which the snapshot no longer carries are deleted, children first: exercises, lessons, units, items, candos. A lesson or exercise that moved to another parent was already moved by the upsert, so it is kept.
5. Other languages are not touched.
6. Common descriptors (`languageCode` null) belong to no language. The ones in the snapshot are upserted. A replace never deletes one, also when the snapshot does not carry it. When two packs carry the same common id, the pack installed last wins.
7. `activeVersion(language)` then returns `snapshot.version`. Installing an empty snapshot removes the language's content and still sets the version.

What happens to learner rows when a row does leave the pack is decided by the schema, not here:

| Removed | Effect on Postgres |
|---------|--------------------|
| Exercise | `attempts.exercise_id`, `writing_submissions.task_id` and `speech_recordings.exercise_id` become null. The rows stay |
| Item | `attempts.item_id` becomes null. `review_cards` and `review_logs` rows of the item are deleted |
| Cando | `cando_mastery` and `cando_outcomes` rows of the cando are deleted |
| Lesson with no sessions | Deleted with its exercises |
| Lesson with a row in `lesson_sessions` | Refused. `lesson_sessions.lesson_id` has no delete rule, so the whole replace fails with a message that says so and nothing changes. Keep the lesson in the pack until `db` gets a rule for this |

Two limits on Postgres. The unique constraints on `(language_code, slug)`, `(unit_id, slug)`, `(language_code, code)` and `(language_code, key)` are checked per statement, and the upsert runs before the delete. So a new id cannot take over the slug, code or key of a row that the same replace removes, and two kept rows cannot swap theirs. The replace fails and rolls back. Ids built by core-content are derived from those keys, so its packs do not do this. `cando_descriptors.mastery_rule` holds the contracts `MasteryRule` as JSON with its camelCase keys.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `cefr_levels` |
| `cando_descriptors` |
| `units` |
| `lessons` |
| `exercises` |
| `items` |

It also writes `languages.pack_version`. Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-curriculum/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-curriculum): message`.

## How to test it

```
pnpm --filter @stufen/core-curriculum test
```

That runs the unit tests. They need no database.

| File | What it checks |
|------|----------------|
| `tests/curriculum.test.ts` | The service on the in memory store: every function, the orderings (also on a store that answers backwards), the filters and both not found errors |
| `tests/next-lesson.test.ts` | `nextLessonFor`: nothing completed, some completed, completed out of order, all completed, a language with no lessons, no `completedLessonIds`, one user's completions not counting for another |
| `tests/store-contract.ts` | Not a test file. `runCurriculumStoreContract(name, makeStore)` holds the behaviour of both ports: every read, the orderings, copies, and the replace rules above |
| `tests/store-contract.memory.test.ts` | The contract on the in memory store |
| `tests/postgres-store.integration.test.ts` | The contract on a real Postgres, plus the Postgres only checks. Skipped unless `DATABASE_URL` is set |
| `tests/fixtures.ts` | `createFixture()`: a German and a Dutch snapshot with fresh uuids and unique slugs, codes and keys per call |

### The integration test

It needs a PostgreSQL 16 or later with the migrations applied, and a `DATABASE_URL` for the user that ran them. That user must own the tables or be a superuser, because a replace is owner work and the test creates users.

```
pnpm db:up
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm db:migrate
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-curriculum test
```

In PowerShell set the variable first with `$env:DATABASE_URL = '...'`. For a scratch Postgres without Docker see `packages/db/README.md`.

Use a database with no installed content. `replaceLanguage` replaces a whole language, so the test would overwrite an installed pack. It checks first that `cando_descriptors`, `units`, `lessons`, `exercises` and `items` are empty and fails without touching anything when they are not. For the same reason do not run it at the same time as another box's integration test on the same database. Before every test and at the end it deletes the users it created, empties the five tables again and puts `languages.pack_version` back. If a run is killed half way, empty those five tables by hand before the next run.

What it shows beyond the contract:

| Check | Expected |
|-------|----------|
| A second replace with one lesson removed and one exercise changed | Unchanged rows keep id and `created_at`; the lesson and its exercises are gone; the changed payload is on the same row |
| A lesson session, two attempts, a review card and a mastery row, then a replace | All still there. The attempt on a removed exercise has `exercise_id` null |
| A replace that removes a lesson with a session | Refused, nothing changed |
| Reads inside `withUser(db, null)` and `withUser(db, userId)` | Role is `stufen_app`, every content row is visible |
| Insert, update and delete on content as `stufen_app` | Insert refused with 42501; update and delete change no row |
| Two replaces of one language at once | Both finish; the store holds one whole snapshot |
| A snapshot that claims an id of another language, or a non uuid id | `InvalidSnapshotError`, nothing changed |
| Postgres refuses a row half way through a replace | Everything rolled back, both languages as before |

## Status

See the `core-curriculum` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
