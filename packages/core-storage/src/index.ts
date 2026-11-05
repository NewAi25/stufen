// @stufen/core-storage
// File storage behind StoragePort. This file is the only public surface of
// the box. The interface itself lives in @stufen/contracts (src/ports.ts).
export { createFsStorage, verifySignedUrl } from './fs-storage';
export type { FsStorageOptions, VerifySignedUrlInput } from './fs-storage';
export { scoped } from './scoped';
export { normaliseKey, StorageKeyError } from './keys';
export type { StorageKeyErrorReason } from './keys';
export type { StoragePort } from '@stufen/contracts';
