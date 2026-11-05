// Local filesystem adapter for StoragePort. For development and tests.
// Node built ins only. The S3 compatible adapter is a Phase 3 row.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StoragePort } from '@stufen/contracts';
import { normaliseKey, StorageKeyError } from './keys';

/** The content type of `<key>` is stored next to it in `<key>.meta.json`. */
export const META_SUFFIX = '.meta.json';

const DEFAULT_TTL_SECONDS = 300;

export interface FsStorageOptions {
  /** Folder that holds every file. Created on the first `put`. */
  root: string;
  /** Path or origin the web app serves files from. Default `/files`. */
  baseUrl?: string;
  /** HMAC secret for signed URLs. Without it URLs are unsigned: local development only. */
  secret?: string;
  /** Clock, injectable for tests. */
  now?: () => Date;
}

export interface VerifySignedUrlInput {
  key: string;
  /** Unix seconds, as a number or as the raw query string value. */
  expires: number | string;
  /** Hex HMAC SHA-256 from the `sig` query parameter. */
  sig: string;
  secret: string;
  now?: () => Date;
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function isMissing(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Real path of `target`, or of its nearest ancestor that exists. */
async function realPathOfNearest(target: string): Promise<string> {
  let current = target;
  for (;;) {
    try {
      return await fs.realpath(current);
    } catch (error) {
      const parent = path.dirname(current);
      if (!isMissing(error) || parent === current) throw error;
      current = parent;
    }
  }
}

function sign(key: string, expires: number, secret: string): string {
  // A key cannot contain a newline, so key and expiry cannot run together.
  return createHmac('sha256', secret).update(`${key}\n${expires}`).digest('hex');
}

function parseExpires(expires: number | string): number | null {
  if (typeof expires === 'number') {
    return Number.isSafeInteger(expires) && expires >= 0 ? expires : null;
  }
  if (typeof expires === 'string' && /^\d{1,15}$/.test(expires)) return Number(expires);
  return null;
}

/**
 * Checks the `expires` and `sig` query parameters of a URL made by
 * `signedUrl`. Returns true only when the signature matches the key and the
 * expiry, and the expiry is still in the future. Never throws on bad input.
 */
export function verifySignedUrl(input: VerifySignedUrlInput): boolean {
  const { secret, sig } = input;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/i.test(sig)) return false;

  const expires = parseExpires(input.expires);
  if (expires === null) return false;

  let key: string;
  try {
    key = normaliseKey(input.key);
  } catch (error) {
    if (error instanceof StorageKeyError) return false;
    throw error;
  }

  const expected = Buffer.from(sign(key, expires, secret), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  const nowSeconds = Math.floor((input.now ?? (() => new Date()))().getTime() / 1000);
  return nowSeconds < expires;
}

async function writeAtomic(target: string, data: Uint8Array): Promise<void> {
  // Same folder as the target, so the rename never crosses a volume.
  const temp = path.join(path.dirname(target), `.tmp-${randomUUID()}`);
  try {
    await fs.writeFile(temp, data, { flag: 'wx' });
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

async function removeFile(target: string): Promise<void> {
  try {
    await fs.unlink(target);
  } catch (error) {
    if (isMissing(error)) return;
    // A folder sits at this path, so no file is stored under this key.
    const stat = await fs.lstat(target).catch(() => null);
    if (stat?.isDirectory()) return;
    throw error;
  }
}

export function createFsStorage(options: FsStorageOptions): StoragePort {
  if (typeof options.root !== 'string' || options.root.length === 0) {
    throw new TypeError('createFsStorage: root must be a folder path.');
  }
  if (options.secret !== undefined && options.secret.length === 0) {
    throw new TypeError('createFsStorage: secret must not be an empty string.');
  }
  const rootPath = path.resolve(options.root);
  const baseUrl = (options.baseUrl ?? '/files').replace(/\/+$/, '');
  const secret = options.secret;
  const now = options.now ?? (() => new Date());

  function checkedKey(key: string): string {
    const normal = normaliseKey(key);
    // Case blind, because Windows and macOS filesystems are.
    if (normal.toLowerCase().endsWith(META_SUFFIX)) throw new StorageKeyError('reserved_suffix');
    return normal;
  }

  async function assertInsideRoot(root: string, file: string): Promise<void> {
    // Symlinks and junctions are followed here, so a link that points out of
    // the root is caught even though the key itself looks clean.
    const real = await realPathOfNearest(file);
    if (real !== root && !isInside(root, real)) throw new StorageKeyError('outside_root');
  }

  /** Validates the key, then maps it to a path that is proven to be inside root. */
  async function locate(
    key: string,
    createRoot: boolean,
  ): Promise<{ root: string; file: string; meta: string } | null> {
    const normal = checkedKey(key);
    if (createRoot) await fs.mkdir(rootPath, { recursive: true });
    let root: string;
    try {
      root = await fs.realpath(rootPath);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const file = path.resolve(root, ...normal.split('/'));
    if (!isInside(root, file)) throw new StorageKeyError('outside_root');
    await assertInsideRoot(root, file);
    return { root, file, meta: file + META_SUFFIX };
  }

  return {
    async put(key, data, contentType) {
      if (!(data instanceof Uint8Array)) {
        throw new TypeError('put: data must be a Uint8Array.');
      }
      if (typeof contentType !== 'string' || contentType.length === 0) {
        throw new TypeError('put: contentType must be a non empty string.');
      }
      const at = await locate(key, true);
      if (at === null) throw new Error('put: the storage root could not be created.');
      await fs.mkdir(path.dirname(at.file), { recursive: true });
      await assertInsideRoot(at.root, at.file);
      await writeAtomic(at.file, data);
      await writeAtomic(at.meta, Buffer.from(`${JSON.stringify({ contentType })}\n`, 'utf8'));
    },

    async get(key) {
      const at = await locate(key, false);
      if (at === null) return null;
      try {
        return new Uint8Array(await fs.readFile(at.file));
      } catch (error) {
        if (isMissing(error) || errorCode(error) === 'EISDIR') return null;
        throw error;
      }
    },

    async delete(key) {
      const at = await locate(key, false);
      if (at === null) return;
      await removeFile(at.file);
      await removeFile(at.meta);
    },

    async signedUrl(key, ttlSeconds = DEFAULT_TTL_SECONDS) {
      const normal = checkedKey(key);
      const plain = `${baseUrl}/${normal}`;
      if (secret === undefined) return plain;
      if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        throw new RangeError('signedUrl: ttlSeconds must be a positive number.');
      }
      const expires = Math.floor(now().getTime() / 1000) + Math.ceil(ttlSeconds);
      return `${plain}?expires=${expires}&sig=${sign(normal, expires, secret)}`;
    },
  };
}
