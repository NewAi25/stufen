# @stufen/core-storage

## Purpose

File storage behind one small port. Speech recordings and any future uploads go through it. Two adapters: local filesystem for development and tests, and any S3 compatible service for production. No other box knows which one is in use.

Kind: `core`. May import: `contracts`.

## Public API

```ts
interface StoragePort {
  put(key: string, body: Uint8Array | ReadableStream, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<void>
  signedUrl(key: string, ttlSeconds: number): Promise<string>
}

fsStorage(rootDir: string): StoragePort
s3Storage(config: { bucket: string; endpoint: string; region: string; accessKeyId: string; secretAccessKey: string }): StoragePort
```

Keys are `<userId>/<box>/<uuid>.<ext>`. Callers must pass the signed in user's id as the first segment; this box rejects keys that do not start with the caller's id.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public. The `docs/04` entry for this box is still to be written.

## Owns tables

None. Object keys are stored by the box that owns the object (for example `speech_recordings.storage_path`).

## Emits and listens

None.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-storage/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-storage): message`.

## How to test it

```
pnpm --filter @stufen/core-storage test
```

Tests run against the filesystem adapter in a temporary directory. The S3 adapter is tested against the same port contract with a stubbed client.

## Status

See the `core-storage` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
