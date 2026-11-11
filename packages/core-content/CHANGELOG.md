# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-11

### Added
- `buildSnapshot` maps the fields contracts 0.6.0 gave a home: an exercise's `instruction_en` and `instruction_native` become `instructionEn` and `instructionNative`, a lesson's `title_en`, `description` and `introduces_item_ids` become `titleEn`, `description` and `introducesItemIds`, and a unit's `title_en` becomes `titleEn`. The text fields are always set, to null when the pack has none. `introducesItemIds` holds item ids from `stableId`, in pack order, and is an empty list when the lesson introduces nothing.
- An unknown key in `introduces_item_ids` stays a validation error like any other dangling reference, so `installPack` refuses the pack. `buildSnapshot` called directly throws and names the lesson and the key.
- Tests on the fixture pack for every new field, and on the real German pack: every exercise that has `instruction_en` keeps it in the snapshot, and the items lesson 1 introduces all resolve to items in the snapshot.
- A shared `ContentStore` contract check: two versions recorded as `active` at the same time end with exactly one active row and no error. Two Postgres checks: six concurrent installs through two stores, and a retry when a writer outside the adapter made another version active meanwhile.

### Changed
- `createPostgresContentStore`: `recordVersion` now locks the language's row in `languages` (`for no key update`) at the start of its transaction, so writers of one language run one after the other. The previous active row is marked `superseded` before the new row becomes `active`, which the index `content_pack_versions_one_active_key` from migration 0006 requires. If the insert still meets that index (Postgres error 23505), the transaction is run once more.

### Fixed
- The integration test expected an update by the restricted role to match no row. Since migration 0006 the role has no write grant on `content_pack_versions`, so insert, update and delete are all refused with 42501, and the test says so.

## [0.1.0] - 2026-11-11

### Added
- `src/ids.ts`: `stableId(key)`, a UUID version 5 (SHA-1) of a pack's stable string key inside one fixed namespace, built with `node:crypto`. The same key gives the same id on every machine and every install. Tested against the RFC 9562 test vector.
- Key rules. A descriptor is hashed under its key `<lang>:cando:<code>`, an item under its own key, a unit and a lesson under the pack's own key, and an exercise under `<lesson key>#<exercise key>`. A record without a key falls back to `<lang>:unit:<slug>`, `<lang>:lesson:<unit slug>/<lesson slug>` and `<lesson key>#<ordinal>`.
- `src/validate.ts`: `validatePackData(pack)`, referential checks with no writes. Errors: manifest code or version differs from the pack; a key that is missing, duplicated anywhere in the pack or not prefixed with the language code; a descriptor key that is not `<lang>:cando:<code>`; a level that is not a CEFR level; an unknown skill, item kind, lesson kind or exercise type; a lesson or exercise that targets no descriptor; a descriptor or item reference that does not resolve; a lesson whose `unit_key` is not its unit; an ordinal that is not a whole number from 1 or is used twice within its parent; a unit slug used twice, or a lesson slug used twice in one unit. Warnings: a descriptor no lesson targets, an item no lesson uses, an exercise that targets a descriptor its lesson does not list, a `pending` checksum.
- Every issue carries `severity` (`error` or `warning`), `file`, `path` and `message`. The report type `PackValidationReport` extends the contracts `ValidationReport`.
- `src/snapshot.ts`: `buildSnapshot(pack)`, a pure mapping from the pack's input shapes to a `CurriculumSnapshot` with ids from `stableId`, references resolved to ids, `packVersion` set, units in level then ordinal order, lessons and exercises in ordinal order.
- `src/store.ts`: the `ContentStore` port (`recordVersion`, `activeVersion`, `listVersions`) and `createInMemoryContentStore()`. Recording a version as `active` marks the previous active version of that language `superseded`.
- `src/postgres-store.ts`: `createPostgresContentStore(db)` on the table `content_pack_versions`. `recordVersion` is owner work in one transaction. The two reads run inside `withUser(db, null, ...)` as the restricted role.
- `src/content.ts`: `createContent({ store, writer, bus, now? })` returning `registerPack`, `validatePack`, `buildSnapshot`, `installPack` and `activePackVersion`. Everything is injected; there is no module level state.
- `installPack` validates first and throws `PackInvalidError` with the report when there is any error, writing nothing. Otherwise it hands the snapshot to `writer.replaceLanguage`, records the version as `active` with the manifest checksum, emits `content.pack_installed` and returns an `InstallReport` with counts. When the writer throws, the version is recorded as `failed` and the error is rethrown.
- `PackNotRegisteredError` for a language no pack was registered for.
- Tests: `stableId` vectors and key rules; one broken variant of a fixture pack per validation rule; the real German pack read from `content/de` with `fs` (no import of `lang-de`) validates with zero errors and builds a snapshot whose references all resolve; `installPack` happy path, refusal, writer failure and supersede; a shared `ContentStore` contract run in memory and, when `DATABASE_URL` is set, on a real PostgreSQL.
