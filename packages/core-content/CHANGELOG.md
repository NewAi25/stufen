# Changelog

## [Unreleased]

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
