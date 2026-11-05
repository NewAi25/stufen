// A view of a StoragePort that lives under one prefix, for example one user.
// Works over any adapter, so the S3 adapter gets the same guarantee later.
import type { StoragePort } from '@stufen/contracts';
import { normaliseKey } from './keys';

/**
 * Returns a StoragePort that puts `${prefix}/` in front of every key. The key
 * is validated first, so it has no `..`, no leading slash and no backslash,
 * and the result can never leave the prefix. A key that tries, for example
 * `../other/x`, throws StorageKeyError and the inner storage is never called.
 */
export function scoped(storage: StoragePort, prefix: string): StoragePort {
  const base = normaliseKey(prefix);
  const full = (key: string): string => normaliseKey(`${base}/${normaliseKey(key)}`);

  return {
    async put(key, data, contentType) {
      await storage.put(full(key), data, contentType);
    },
    async get(key) {
      return storage.get(full(key));
    },
    async delete(key) {
      await storage.delete(full(key));
    },
    async signedUrl(key, ttlSeconds) {
      return storage.signedUrl(full(key), ttlSeconds);
    },
  };
}
