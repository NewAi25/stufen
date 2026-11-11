# @stufen/core-content

## Purpose

Loads and validates language packs, installs them into the curriculum tables and tracks pack versions.
Knows the LanguagePack interface, never any pack's contents. Packs are registered at runtime by apps/web.

Kind: `core`. May import: `contracts`, `db`.

Optional peers (registered at runtime by apps/web, never imported): `lang-de`.

## Public API

`src/index.ts` exports the factory `createContent`, the pure functions `stableId`, `validatePackData` and `buildSnapshot`, the `ContentStore` type with `createInMemoryContentStore` and `createPostgresContentStore`, and the errors `PackNotRegisteredError` and `PackInvalidError`. Nothing is a singleton. `apps/web` builds one service and passes in the store, the writer and the bus.

```ts
import { createEventBus } from '@stufen/contracts';
import { createContent, createInMemoryContentStore } from '@stufen/core-content';

const content = createContent({
  store: createInMemoryContentStore(), // any ContentStore
  writer: curriculumStore, // a contracts SnapshotWriter, in practice the core-curriculum store
  bus: createEventBus(), // the app's EventBus
  now: () => new Date(), // optional clock, used for installedAt
});

content.registerPack(pack: LanguagePack): void
content.validatePack(language): Promise<PackValidationReport>   // referential checks, no writes
content.buildSnapshot(language): Promise<CurriculumSnapshot>    // stable ids derived from the pack's keys
content.installPack(language): Promise<InstallReport>           // emits content.pack_installed
content.activePackVersion(language): Promise<string | null>
```

`registerPack` is called at app start. Registering the same language again replaces the earlier pack. `validatePack`, `buildSnapshot` and `installPack` throw `PackNotRegisteredError` (with a `language` property) for a language no pack was registered for.

### Ids

Every id in a snapshot is `stableId(key)`: a UUID version 5 of the record's stable pack key inside one fixed namespace. The same pack key always gives the same id, so installing a pack again, or installing a newer version of it, keeps every id and a learner's attempts, review cards and mastery rows survive the reinstall.

| Record | Key that is hashed | Example |
|--------|--------------------|---------|
| Descriptor | its `key`, which is `<lang>:cando:<code>` | `de:cando:A1.LIS.03` |
| Item | its `key` | `de:vocab:haus` |
| Unit | its `key` | `de:unit:a1-01-hallo` |
| Lesson | its `key` | `de:lesson:a1-01-01` |
| Exercise | `<lesson key>#<exercise key>` | `de:lesson:a1-01-01#de:exercise:a1-01-01-04` |

A record that carries no key falls back to a derived one: `<lang>:unit:<slug>`, `<lang>:lesson:<unit slug>/<lesson slug>` and `<lesson key>#<ordinal>`. Items have no fallback. A key is never renamed (docs/09), because a renamed key is a new id.

### validatePackData and validatePack

`validatePackData(pack)` is the pure function, `validatePack(language)` runs it on the registered pack. Neither writes. The report is the contracts `ValidationReport` with a `severity` on every issue:

```ts
interface PackIssue {
  severity: 'error' | 'warning';
  file: string; // the pack file the record normally lives in, for example units/A1/01-hallo/lesson-02.json
  path: string; // for example units[de:unit:a1-01-hallo].lessons[de:lesson:a1-01-02].exercises[...].item_ids[1]
  message: string; // names the key at fault
}
```

`ok` is true when there is no error. Warnings never block an install.

| Severity | Rule |
|----------|------|
| error | The manifest `code` and `version` equal the pack's |
| error | Every record has a key, the key starts with `<code>:`, and no key is used twice anywhere in the pack |
| error | A descriptor's key is `<code>:cando:<code field>` |
| error | Every level, in the manifest, descriptors, items and units, is a CEFR level |
| error | Every skill, item kind, lesson kind and exercise type is one that `contracts` knows |
| error | Every lesson and every exercise targets at least one descriptor |
| error | Every key in `cando_ids`, `introduces_item_ids` and `item_ids` exists in the pack |
| error | A lesson's `unit_key` is the key of its unit |
| error | Ordinals are whole numbers from 1 and unique within their parent: units in a level, lessons in a unit, exercises in a lesson |
| error | Unit slugs are unique in the pack and lesson slugs in a unit, as the tables require |
| error | A pack loader that throws |
| warning | A descriptor no lesson targets, an item no lesson uses |
| warning | An exercise that targets a descriptor its lesson does not list |
| warning | A checksum that is still `pending` |

Payload shapes are not checked here. `scripts/validate-content.mjs` checks them against `content/schema/`, and it also recomputes the checksum, which this box cannot do because it never sees the files.

### buildSnapshot

`buildSnapshot(pack)` maps the pack's input shapes to a contracts `CurriculumSnapshot`: ids from `stableId`, `cando_ids` and `item_ids` resolved to ids, `packVersion` set on items, units, lessons and exercises. Units come out in level order and then ordinal order, lessons and exercises in ordinal order, descriptors and items in pack order. It is pure: building twice gives deep equal results. It throws an `Error` naming the key for a reference that is not in the pack; `installPack` validates first, so that only happens when it is called directly on an invalid pack.

### installPack

1. Validates. With any error it throws `PackInvalidError`, whose `report` property is the full report. Nothing is written and nothing is emitted.
2. Builds the snapshot and calls `writer.replaceLanguage(snapshot)`.
3. Records the version as `active` with the manifest checksum. The previous active version of that language becomes `superseded`.
4. Emits `content.pack_installed` with `{ language, version }` and returns an `InstallReport` with status `active` and the counts of descriptors, items, units, lessons and exercises.

When the writer throws, the version is recorded as `failed` and the writer's error is rethrown. One exception: a failed reinstall of the version that is active right now leaves that row `active`, because the writer replaces a language in one step and the earlier content is still what readers see.

Rolling back is registering and installing the previous version again.

### ContentStore

The storage port for pack versions. Both adapters implement the same three methods.

```ts
interface ContentStore {
  recordVersion(input: {
    language: LanguageCode;
    version: string;
    checksum: string;
    status: 'installing' | 'active' | 'superseded' | 'failed';
    installedAt?: string; // ISO, defaults to the adapter's clock
  }): Promise<PackVersionRecord>;
  activeVersion(language): Promise<PackVersionRecord | null>;
  listVersions(language): Promise<PackVersionRecord[]>; // newest first by installedAt
}
```

There is one row per language and version; recording the same pair again replaces that row. A language has at most one `active` row: recording a version as `active` turns the other active row of that language into `superseded`. Any other status leaves the other rows alone. Languages do not affect each other.

`createInMemoryContentStore()` keeps rows in an array and hands out copies. It is what the unit tests use.

`createPostgresContentStore(db)` works on the table `content_pack_versions`, where `db` is what `createDb` from `@stufen/db` returns. `recordVersion` is owner work and runs in one transaction on `db`, so the supersede step and the new row land together. `activeVersion` and `listVersions` run inside `withUser(db, null, ...)` as the restricted role `stufen_app`; the table is reference data that everyone may read. Rows with the same `installedAt` come back in descending version order. A language code that is not in the `languages` table is rejected by the foreign key.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `content_pack_versions` |

The curriculum tables (`cando_descriptors`, `items`, `units`, `lessons`, `exercises`) belong to `core-curriculum`. This box fills them only through the `SnapshotWriter` it is given. Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `content.pack_installed` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-content/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-content): message`.

## How to test it

```
pnpm --filter @stufen/core-content test
```

That runs everything in memory, including the real German pack read from `content/de`. The Postgres adapter test is skipped unless `DATABASE_URL` points at a PostgreSQL with the migrations applied:

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-content test
```

It writes version rows for the languages `nl` and `fr` only, with version strings of its own, and deletes them after every test.

## Status

See the `core-content` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
