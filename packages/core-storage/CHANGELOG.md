# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/keys.ts`: `normaliseKey(key)` and the typed `StorageKeyError` with a `reason` code. Rejects empty keys, keys over 512 characters, control characters, drive letters, backslashes, a leading or trailing slash, empty segments, any `.` or `..` segment, a segment ending in a dot, and any character outside ASCII letters, digits, dot, underscore and hyphen.
- `src/fs-storage.ts`: `createFsStorage({ root, baseUrl, secret, now })`, the local filesystem adapter for `StoragePort`. `put` creates parent folders and writes through a temporary file and a rename. The content type goes into a sidecar file `<key>.meta.json`. `get` returns the bytes or null. `delete` removes the file and its sidecar and is safe on a missing key. `signedUrl` returns `${baseUrl}/${key}?expires=<unix seconds>&sig=<hex HMAC SHA-256>` when a secret is set and the plain URL when it is not. Every resolved path is checked to be inside the root after links are followed.
- `verifySignedUrl({ key, expires, sig, secret, now })` so the web route can check a signed URL. Returns false on a wrong signature, an expired URL or malformed input.
- `src/scoped.ts`: `scoped(storage, prefix)`, a `StoragePort` that keeps every key under one prefix.
- `tests/fs-storage.test.ts`: the P0-27 acceptance checks, overwrite, missing keys, delete, nested keys, the sidecar, every rejected key shape, links that point outside the root, isolation between two prefixes, and signed URLs (valid, tampered, expired).
