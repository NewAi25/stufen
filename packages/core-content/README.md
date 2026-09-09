# @stufen/core-content

## Purpose

Loads and validates language packs, installs them into the curriculum tables and tracks pack versions.
Knows the LanguagePack interface, never any pack's contents. Packs are registered at runtime by apps/web.

Kind: `core`. May import: `contracts`.

Optional peers (registered at runtime by apps/web, never imported): `lang-de`.

## Public API

```ts
registerPack(pack: LanguagePack): void                 // called once at app start by apps/web
validatePack(language): Promise<ValidationReport>      // schema plus referential checks
installPack(language, version): Promise<InstallReport> // service role, emits content.pack_installed
activePackVersion(language): Promise<string | null>
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `content_pack_versions` |
| `exercises` |
| `items` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

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

## Status

See the `core-content` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
