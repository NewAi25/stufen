# @stufen/core-curriculum

## Purpose

The CEFR spine: levels, can do descriptors, units and lessons as a graph.
Read side only. Content is written into these tables by core-content.

Kind: `core`. May import: `contracts`.

## Public API

`src/index.ts` exports five things: `createCurriculum`, the `CurriculumStore` and `CurriculumWriter` types, `createInMemoryCurriculumStore` and `CurriculumNotFoundError`. Nothing is a singleton. `apps/web` builds one store and passes it in.

```ts
import { createCurriculum, createInMemoryCurriculumStore } from '@stufen/core-curriculum';

const store = createInMemoryCurriculumStore(); // a CurriculumStore and a CurriculumWriter
const curriculum = createCurriculum({ store }); // any CurriculumStore

curriculum.listLevels(): CefrLevel[]
curriculum.listCandos(language, level?, skill?): Promise<Cando[]>
curriculum.getCando(candoId): Promise<Cando>
curriculum.listUnits(language, level): Promise<Unit[]>
curriculum.listLessons(unitId): Promise<LessonSummary[]>
curriculum.getLesson(lessonId): Promise<Lesson>          // includes ordered exercises
curriculum.lessonPath(language): Promise<{ lesson: LessonSummary; unit: Unit; level: CefrLevel }[]>
```

| Function | What it returns |
|----------|-----------------|
| `listLevels` | The six CEFR levels, A1 first. A fresh array on every call |
| `listCandos` | Descriptors of the language plus the common CEFR descriptors (`languageCode` null), each once, by level and then `code`. `level` and `skill` narrow the list |
| `getCando` | One descriptor. Rejects with `CurriculumNotFoundError` (`kind` is `cando`) for an unknown id |
| `listUnits` | Units of one level in `ordinal` order, without their lessons |
| `listLessons` | Lessons of one unit in `ordinal` order, without exercises. Empty for an unknown unit |
| `getLesson` | One lesson with its exercises in `ordinal` order. Rejects with `CurriculumNotFoundError` (`kind` is `lesson`) for an unknown id |
| `lessonPath` | Every lesson of the language in learning order: level, then unit `ordinal`, then lesson `ordinal`. Each entry carries its unit and level |

`CurriculumNotFoundError` has two properties: `kind` (`'cando'` or `'lesson'`) and `id`.

### Storage ports

`CurriculumStore` is the read port this box needs. `CurriculumWriter` is the write port that core-content calls when it installs a pack. The two boxes never import each other. The app hands the same store object to both.

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

interface CurriculumWriter {
  replaceLanguage(snapshot: CurriculumSnapshot): Promise<void>;
}
```

`replaceLanguage` swaps everything stored for `snapshot.language` in one step and leaves other languages alone. `createInMemoryCurriculumStore()` implements both ports and copies data on the way in and on the way out.

### Later rows

`nextLessonFor(userId, language)` is not built yet. It will walk `lessonPath`. The Postgres adapter for the two ports is also a later row.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `cefr_levels` |
| `cando_descriptors` |
| `units` |
| `lessons` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

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

## Status

See the `core-curriculum` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
