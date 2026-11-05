# @stufen/core-storage

## Purpose

File storage behind one small port. Speech recordings and any future uploads go through it. No other box knows where the bytes end up.

This version ships the local filesystem adapter, for development and tests. The S3 compatible adapter for production is a Phase 3 row (P3-02) and is not in this box yet.

Kind: `core`. May import: `contracts`. Uses Node built ins only.

## Public API

Everything is exported from `src/index.ts`. The `StoragePort` interface lives in `@stufen/contracts` and is re exported here as a type.

```ts
interface StoragePort {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

createFsStorage(options: {
  root: string;          // folder that holds every file
  baseUrl?: string;      // default '/files'
  secret?: string;       // HMAC secret for signed URLs
  now?: () => Date;      // clock, for tests
}): StoragePort

scoped(storage: StoragePort, prefix: string): StoragePort

verifySignedUrl(input: {
  key: string;
  expires: number | string;   // unix seconds, the raw query value is fine
  sig: string;
  secret: string;
  now?: () => Date;
}): boolean

normaliseKey(key: string): string    // returns the key, or throws StorageKeyError
class StorageKeyError extends Error { reason: StorageKeyErrorReason }
```

Types exported alongside: `FsStorageOptions`, `VerifySignedUrlInput`, `StorageKeyErrorReason`.

```ts
const storage = createFsStorage({ root: './.data/files', secret: signingSecret });
const mine = scoped(storage, userId);
await mine.put('speech/2f6c.webm', bytes, 'audio/webm');
const back = await mine.get('speech/2f6c.webm');
const url = await mine.signedUrl('speech/2f6c.webm', 300);
```

### Keys

A key is a relative path with forward slashes, for example `u1/speech/2f6c.webm`. The convention is `<userId>/<box>/<uuid>.<ext>`.

`normaliseKey` returns a valid key unchanged and throws `StorageKeyError` for everything else. The `reason` field says which rule failed.

| Rejected | `reason` |
|----------|----------|
| Empty key | `empty` |
| Longer than 512 characters | `too_long` |
| Control character | `control_character` |
| Drive letter, such as `C:\x` or `C:/x` | `drive_letter` |
| Backslash, such as `..\x` | `backslash` |
| Leading slash, which means an absolute path | `absolute_path` |
| Trailing slash | `trailing_slash` |
| Two slashes in a row | `empty_segment` |
| A `.` or `..` segment | `dot_segment` |
| A segment that ends in a dot | `trailing_dot` |
| Any character outside ASCII letters, digits, dot, underscore and hyphen | `invalid_character` |
| Not a string | `not_a_string` |

The filesystem adapter adds two more.

| Rejected | `reason` |
|----------|----------|
| A key ending in `.meta.json`, which is reserved for sidecar files | `reserved_suffix` |
| A key whose real path is outside the root, for example through a symlink | `outside_root` |

### createFsStorage

- `put` creates the parent folders, writes to a temporary name in the same folder, then renames it over the target. A reader never sees a half written file. The content type is stored in a sidecar file `<key>.meta.json` as `{ "contentType": "..." }`.
- `get` returns the bytes, or null when nothing is stored under the key.
- `delete` removes the file and its sidecar. It is safe on a missing key and safe to call twice.
- After the key is resolved, the real path is checked to be inside `root`, with symlinks and junctions followed. If it is not, the call throws `StorageKeyError` and nothing is read or written.
- Keys are validated before anything touches the disk. A rejected key creates no folder and no file.

### Per user isolation

`scoped(storage, prefix)` returns a `StoragePort` that puts `${prefix}/` in front of every key. The key is validated first, so a scoped storage can never leave its prefix. A key that tries, such as `../other/x`, throws `StorageKeyError` and the inner storage is never called. The prefix itself is validated when the scope is created, and it may have more than one segment.

Callers hand each request a storage scoped to the signed in user's id. `scoped` works over any `StoragePort`, so the S3 adapter gets the same guarantee.

### Signed URLs

With a `secret`, `signedUrl(key, ttlSeconds = 300)` returns

```
${baseUrl}/${key}?expires=<unix seconds>&sig=<hex>
```

where `sig` is the HMAC SHA-256 of the key, a newline and the expiry, using the secret. The web route that serves `baseUrl` calls `verifySignedUrl` with the key from the path and the two query values. It returns true only when the signature matches and the expiry is still in the future. It returns false for a tampered signature, an expired URL, a bad key or malformed values, and it never throws on bad input. The comparison is constant time.

Without a `secret`, `signedUrl` returns the plain `${baseUrl}/${key}` with no expiry and no signature. That is for local development only. Any deployment that other people can reach must set a secret.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

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

Tests run against the filesystem adapter in a temporary folder under the system temp directory and remove it afterwards. No network and no account.

## Status

See the `core-storage` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
