// Behaviour of the filesystem StoragePort adapter (P0-27). Acceptance check
// from docs/07-build-sequence.md: `put` then `get` round trips a file under a
// user prefix on the local filesystem; a key outside the prefix throws.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFsStorage,
  normaliseKey,
  scoped,
  StorageKeyError,
  verifySignedUrl,
} from '../src/index';
import type { StorageKeyErrorReason, StoragePort } from '../src/index';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array | null): string | null =>
  data === null ? null : new TextDecoder().decode(data);

let sandbox: string;
let root: string;
let storage: StoragePort;

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'stufen-core-storage-'));
  root = path.join(sandbox, 'files');
  storage = createFsStorage({ root });
});

afterEach(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

async function reasonOf(action: () => Promise<unknown>): Promise<StorageKeyErrorReason | 'none'> {
  try {
    await action();
  } catch (error) {
    if (error instanceof StorageKeyError) return error.reason;
    throw error;
  }
  return 'none';
}

describe('acceptance (P0-27)', () => {
  it('put then get round trips a file under a user prefix on the local filesystem', async () => {
    const user = scoped(storage, 'u1');
    const data = new Uint8Array([0, 1, 2, 250, 255]);

    await user.put('speech/rec.webm', data, 'audio/webm');

    const back = await user.get('speech/rec.webm');
    expect(back).toBeInstanceOf(Uint8Array);
    expect(Array.from(back ?? [])).toEqual([0, 1, 2, 250, 255]);
    const onDisk = await fs.readFile(path.join(root, 'u1', 'speech', 'rec.webm'));
    expect(Array.from(onDisk)).toEqual([0, 1, 2, 250, 255]);
  });

  it('a key outside the prefix throws and writes nothing', async () => {
    const user = scoped(storage, 'u1');

    await expect(user.put('../u2/x.txt', bytes('x'), 'text/plain')).rejects.toBeInstanceOf(
      StorageKeyError,
    );
    await expect(user.get('../u2/x.txt')).rejects.toBeInstanceOf(StorageKeyError);
    await expect(user.delete('../u2/x.txt')).rejects.toBeInstanceOf(StorageKeyError);
    await expect(user.signedUrl('../u2/x.txt')).rejects.toBeInstanceOf(StorageKeyError);
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('createFsStorage', () => {
  it('overwrites an existing file and its content type', async () => {
    await storage.put('u1/a.txt', bytes('first'), 'text/plain');
    await storage.put('u1/a.txt', bytes('second, longer'), 'text/markdown');

    expect(text(await storage.get('u1/a.txt'))).toBe('second, longer');
    const meta: unknown = JSON.parse(
      await fs.readFile(path.join(root, 'u1', 'a.txt.meta.json'), 'utf8'),
    );
    expect(meta).toEqual({ contentType: 'text/markdown' });
  });

  it('get returns null for a missing key, a missing root and a folder', async () => {
    expect(await storage.get('u1/missing.txt')).toBeNull();
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });

    await storage.put('u1/a/b.txt', bytes('b'), 'text/plain');
    expect(await storage.get('u1/other.txt')).toBeNull();
    expect(await storage.get('u1/a')).toBeNull();
    expect(await storage.get('u1/a/b.txt/c')).toBeNull();
  });

  it('delete removes the file and its sidecar, and is safe to call twice', async () => {
    await storage.put('u1/a.txt', bytes('a'), 'text/plain');

    await storage.delete('u1/a.txt');

    expect(await storage.get('u1/a.txt')).toBeNull();
    expect(await fs.readdir(path.join(root, 'u1'))).toEqual([]);
    await expect(storage.delete('u1/a.txt')).resolves.toBeUndefined();
    await expect(storage.delete('never/there.txt')).resolves.toBeUndefined();
  });

  it('delete on a missing root or on a folder does nothing', async () => {
    await expect(storage.delete('u1/a.txt')).resolves.toBeUndefined();

    await storage.put('u1/a/b.txt', bytes('b'), 'text/plain');
    await expect(storage.delete('u1/a')).resolves.toBeUndefined();
    expect(text(await storage.get('u1/a/b.txt'))).toBe('b');
  });

  it('creates parent folders for nested keys', async () => {
    await storage.put('u1/speech/2026/11/rec_01.webm', bytes('deep'), 'audio/webm');

    expect(text(await storage.get('u1/speech/2026/11/rec_01.webm'))).toBe('deep');
    const stat = await fs.stat(path.join(root, 'u1', 'speech', '2026', '11'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('stores the content type in a sidecar file next to the data', async () => {
    await storage.put('u1/rec.webm', bytes('audio'), 'audio/webm');

    const sidecar = await fs.readFile(path.join(root, 'u1', 'rec.webm.meta.json'), 'utf8');
    const meta: unknown = JSON.parse(sidecar);
    expect(meta).toEqual({ contentType: 'audio/webm' });
  });

  it('leaves no temporary files behind after a put', async () => {
    await storage.put('u1/a.txt', bytes('a'), 'text/plain');
    await storage.put('u1/a.txt', bytes('b'), 'text/plain');

    expect((await fs.readdir(path.join(root, 'u1'))).sort()).toEqual(['a.txt', 'a.txt.meta.json']);
  });

  it('stores an empty file', async () => {
    await storage.put('u1/empty.bin', new Uint8Array(0), 'application/octet-stream');

    expect((await storage.get('u1/empty.bin'))?.length).toBe(0);
  });

  it('refuses keys that would collide with a sidecar file', async () => {
    const put = (key: string) => storage.put(key, bytes('{}'), 'application/json');

    expect(await reasonOf(() => put('u1/a.txt.meta.json'))).toBe('reserved_suffix');
    expect(await reasonOf(() => put('u1/a.txt.META.JSON'))).toBe('reserved_suffix');
    expect(await reasonOf(() => storage.get('u1/a.txt.meta.json'))).toBe('reserved_suffix');
    expect(await reasonOf(() => storage.delete('u1/a.txt.meta.json'))).toBe('reserved_suffix');
    expect(await reasonOf(() => storage.signedUrl('u1/a.txt.meta.json'))).toBe('reserved_suffix');
  });

  it('rejects bad input before touching the disk', async () => {
    const notBytes = 'text' as unknown as Uint8Array;

    await expect(storage.put('u1/a.txt', notBytes, 'text/plain')).rejects.toBeInstanceOf(TypeError);
    await expect(storage.put('u1/a.txt', bytes('a'), '')).rejects.toBeInstanceOf(TypeError);
    expect(() => createFsStorage({ root: '' })).toThrow(TypeError);
    expect(() => createFsStorage({ root, secret: '' })).toThrow(TypeError);
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to follow a link that points outside the root', async () => {
    const outside = path.join(sandbox, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
    await fs.mkdir(path.join(root, 'u1'), { recursive: true });
    // A junction on Windows (no admin rights needed), a symlink elsewhere.
    await fs.symlink(outside, path.join(root, 'u1', 'link'), 'junction');

    expect(await reasonOf(() => storage.get('u1/link/secret.txt'))).toBe('outside_root');
    expect(await reasonOf(() => storage.put('u1/link/new.txt', bytes('x'), 'text/plain'))).toBe(
      'outside_root',
    );
    expect(await reasonOf(() => storage.put('u1/link/sub/new.txt', bytes('x'), 'text/plain'))).toBe(
      'outside_root',
    );
    expect(await reasonOf(() => storage.delete('u1/link/secret.txt'))).toBe('outside_root');
    expect((await fs.readdir(outside)).sort()).toEqual(['secret.txt']);
  });
});

describe('rejected key shapes', () => {
  const cases: ReadonlyArray<readonly [label: string, key: string, reason: StorageKeyErrorReason]> =
    [
      ['empty key', '', 'empty'],
      ['absolute POSIX path', '/etc/passwd', 'absolute_path'],
      ['leading slash', '/u1/a.txt', 'absolute_path'],
      ['Windows drive path', 'C:\\x', 'drive_letter'],
      ['drive letter with forward slash', 'C:/x', 'drive_letter'],
      ['drive relative path', 'c:x', 'drive_letter'],
      ['UNC path', '\\\\server\\share\\x', 'backslash'],
      ['backslash separator', 'u1\\a.txt', 'backslash'],
      ['Windows style parent', '..\\x', 'backslash'],
      ['parent segment first', '../x', 'dot_segment'],
      ['parent segment in the middle', 'u1/../u2/x', 'dot_segment'],
      ['parent segment last', 'u1/..', 'dot_segment'],
      ['lone parent segment', '..', 'dot_segment'],
      ['current segment first', './x', 'dot_segment'],
      ['current segment in the middle', 'u1/./x', 'dot_segment'],
      ['lone current segment', '.', 'dot_segment'],
      ['trailing slash', 'u1/a/', 'trailing_slash'],
      ['double slash', 'u1//a.txt', 'empty_segment'],
      ['segment ending in a dot', 'u1/a.', 'trailing_dot'],
      ['three dots', 'u1/.../x', 'trailing_dot'],
      ['newline', 'u1/a\nb', 'control_character'],
      ['NUL byte', 'u1/a\u0000b', 'control_character'],
      ['tab', 'u1/a\tb', 'control_character'],
      ['DEL', 'u1/a\u007fb', 'control_character'],
      ['C1 control', 'u1/a\u0085b', 'control_character'],
      ['space', 'u1/a b.txt', 'invalid_character'],
      ['non ASCII letter', 'u1/\u00e4.txt', 'invalid_character'],
      ['percent encoded dots', 'u1/%2e%2e/x', 'invalid_character'],
      ['query string', 'u1/a.txt?x=1', 'invalid_character'],
      ['colon inside', 'u1/a:b', 'invalid_character'],
      ['tilde', '~/x', 'invalid_character'],
      ['513 characters', 'a'.repeat(513), 'too_long'],
    ];

  it.each(cases)('normaliseKey rejects %s', (_label, key, reason) => {
    let caught: unknown;
    try {
      normaliseKey(key);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StorageKeyError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as StorageKeyError).reason).toBe(reason);
    expect((caught as StorageKeyError).name).toBe('StorageKeyError');
  });

  it.each(cases)('every storage method rejects %s', async (_label, key, reason) => {
    expect(await reasonOf(() => storage.put(key, bytes('x'), 'text/plain'))).toBe(reason);
    expect(await reasonOf(() => storage.get(key))).toBe(reason);
    expect(await reasonOf(() => storage.delete(key))).toBe(reason);
    expect(await reasonOf(() => storage.signedUrl(key))).toBe(reason);
  });

  it('nothing is written for any rejected key', async () => {
    for (const [, key] of cases) {
      await reasonOf(() => storage.put(key, bytes('x'), 'text/plain'));
    }
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readdir(sandbox)).toEqual([]);
  });

  it('rejects a key that is not a string', () => {
    expect(() => normaliseKey(undefined as unknown as string)).toThrow(StorageKeyError);
    expect(() => normaliseKey(42 as unknown as string)).toThrow(StorageKeyError);
  });

  it('accepts ordinary keys and returns them unchanged', () => {
    for (const key of [
      'a',
      'u1/speech/2f6c.webm',
      'user_1/box-2/file.name.tar.gz',
      '.hidden/x',
      '0/1/2',
      'a'.repeat(512),
    ]) {
      expect(normaliseKey(key)).toBe(key);
    }
  });
});

describe('scoped', () => {
  it('keeps two prefixes apart', async () => {
    const alice = scoped(storage, 'alice');
    const bob = scoped(storage, 'bob');

    await alice.put('notes/a.txt', bytes('from alice'), 'text/plain');
    await bob.put('notes/a.txt', bytes('from bob'), 'text/plain');

    expect(text(await alice.get('notes/a.txt'))).toBe('from alice');
    expect(text(await bob.get('notes/a.txt'))).toBe('from bob');
    expect(text(await storage.get('alice/notes/a.txt'))).toBe('from alice');
    expect(text(await storage.get('bob/notes/a.txt'))).toBe('from bob');

    await alice.delete('notes/a.txt');
    expect(await alice.get('notes/a.txt')).toBeNull();
    expect(text(await bob.get('notes/a.txt'))).toBe('from bob');
  });

  it('cannot reach another prefix by any key shape', async () => {
    const bob = scoped(storage, 'bob');
    await bob.put('private.txt', bytes('bob only'), 'text/plain');
    const alice = scoped(storage, 'alice');

    for (const key of [
      '../bob/private.txt',
      '..\\bob\\private.txt',
      '/bob/private.txt',
      'x/../../bob/private.txt',
      './../bob/private.txt',
      '%2e%2e/bob/private.txt',
    ]) {
      await expect(alice.get(key)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(alice.put(key, bytes('overwritten'), 'text/plain')).rejects.toBeInstanceOf(
        StorageKeyError,
      );
      await expect(alice.delete(key)).rejects.toBeInstanceOf(StorageKeyError);
    }
    // The same words as a clean key stay inside alice's own folder.
    expect(await alice.get('bob/private.txt')).toBeNull();
    expect(text(await bob.get('private.txt'))).toBe('bob only');
  });

  it('rejects a bad prefix when the scope is created', () => {
    expect(() => scoped(storage, '')).toThrow(StorageKeyError);
    expect(() => scoped(storage, '../u2')).toThrow(StorageKeyError);
    expect(() => scoped(storage, 'u1/')).toThrow(StorageKeyError);
    expect(() => scoped(storage, 'C:\\x')).toThrow(StorageKeyError);
  });

  it('accepts a prefix with more than one segment and nests', async () => {
    const speech = scoped(scoped(storage, 'u1'), 'speech');

    await speech.put('rec.webm', bytes('audio'), 'audio/webm');

    expect(text(await storage.get('u1/speech/rec.webm'))).toBe('audio');
    expect(text(await scoped(storage, 'u1/speech').get('rec.webm'))).toBe('audio');
  });

  it('rejects a key that is too long once the prefix is added', async () => {
    const user = scoped(storage, 'u1');

    expect(await reasonOf(() => user.get('a'.repeat(510)))).toBe('too_long');
  });

  it('puts the prefix into signed URLs', async () => {
    const user = scoped(storage, 'u1');

    expect(await user.signedUrl('rec.webm')).toBe('/files/u1/rec.webm');
  });
});

describe('signedUrl and verifySignedUrl', () => {
  const secret = 'test-secret-not-for-production';
  const issuedAt = new Date('2026-11-05T12:00:00.000Z');
  const issuedSeconds = issuedAt.getTime() / 1000;
  const at = (offsetSeconds: number) => () => new Date(issuedAt.getTime() + offsetSeconds * 1000);

  function parse(url: string): { key: string; expires: string; sig: string } {
    const parsed = new URL(url, 'http://localhost');
    return {
      key: parsed.pathname.replace(/^\/files\//, ''),
      expires: parsed.searchParams.get('expires') ?? '',
      sig: parsed.searchParams.get('sig') ?? '',
    };
  }

  function signing(baseUrl?: string): StoragePort {
    return createFsStorage({
      root,
      secret,
      now: () => issuedAt,
      ...(baseUrl === undefined ? {} : { baseUrl }),
    });
  }

  it('without a secret returns the plain URL', async () => {
    expect(await storage.signedUrl('u1/rec.webm')).toBe('/files/u1/rec.webm');
    expect(await storage.signedUrl('u1/rec.webm', 60)).toBe('/files/u1/rec.webm');
  });

  it('with a secret returns expires and a hex signature, default ttl 300 seconds', async () => {
    const url = await signing().signedUrl('u1/rec.webm');

    expect(url).toMatch(/^\/files\/u1\/rec\.webm\?expires=\d+&sig=[0-9a-f]{64}$/);
    expect(parse(url).expires).toBe(String(issuedSeconds + 300));
  });

  it('honours ttlSeconds and baseUrl, with or without a trailing slash', async () => {
    const url = await signing('https://cdn.example.test/media/').signedUrl('u1/rec.webm', 60);

    expect(url.startsWith('https://cdn.example.test/media/u1/rec.webm?expires=')).toBe(true);
    expect(new URL(url).searchParams.get('expires')).toBe(String(issuedSeconds + 60));
  });

  it('a fresh URL verifies, with expires as a string or a number', async () => {
    const { key, expires, sig } = parse(await signing().signedUrl('u1/rec.webm'));

    expect(key).toBe('u1/rec.webm');
    expect(verifySignedUrl({ key, expires, sig, secret, now: at(0) })).toBe(true);
    expect(verifySignedUrl({ key, expires: Number(expires), sig, secret, now: at(299) })).toBe(
      true,
    );
    expect(verifySignedUrl({ key, expires, sig: sig.toUpperCase(), secret, now: at(0) })).toBe(
      true,
    );
  });

  it('a tampered signature fails', async () => {
    const { key, expires, sig } = parse(await signing().signedUrl('u1/rec.webm'));
    const flipped = (sig.startsWith('0') ? '1' : '0') + sig.slice(1);

    expect(verifySignedUrl({ key, expires, sig: flipped, secret, now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires, sig: sig.slice(2), secret, now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires, sig: '', secret, now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires, sig: 'z'.repeat(64), secret, now: at(0) })).toBe(false);
  });

  it('a signature does not carry over to another key, expiry or secret', async () => {
    const { key, expires, sig } = parse(await signing().signedUrl('u1/rec.webm'));
    const later = String(Number(expires) + 3600);

    expect(verifySignedUrl({ key: 'u2/rec.webm', expires, sig, secret, now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires: later, sig, secret, now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires, sig, secret: 'other', now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires, sig, secret: '', now: at(0) })).toBe(false);
  });

  it('an expired URL fails', async () => {
    const { key, expires, sig } = parse(await signing().signedUrl('u1/rec.webm', 60));

    expect(verifySignedUrl({ key, expires, sig, secret, now: at(59) })).toBe(true);
    expect(verifySignedUrl({ key, expires, sig, secret, now: at(60) })).toBe(false);
    expect(verifySignedUrl({ key, expires, sig, secret, now: at(3600) })).toBe(false);
  });

  it('returns false instead of throwing on malformed input', async () => {
    const { key, expires, sig } = parse(await signing().signedUrl('u1/rec.webm'));

    expect(verifySignedUrl({ key: '../u1/rec.webm', expires, sig, secret, now: at(0) })).toBe(
      false,
    );
    for (const bad of ['', 'abc', '-1', '1e9', '12.5', ` ${expires}`]) {
      expect(verifySignedUrl({ key, expires: bad, sig, secret, now: at(0) })).toBe(false);
    }
    expect(verifySignedUrl({ key, expires: Number.NaN, sig, secret, now: at(0) })).toBe(false);
    expect(verifySignedUrl({ key, expires: -5, sig, secret, now: at(0) })).toBe(false);
  });

  it('rejects a ttl that is not a positive number', async () => {
    const signer = signing();

    await expect(signer.signedUrl('u1/rec.webm', 0)).rejects.toBeInstanceOf(RangeError);
    await expect(signer.signedUrl('u1/rec.webm', -1)).rejects.toBeInstanceOf(RangeError);
    await expect(signer.signedUrl('u1/rec.webm', Number.NaN)).rejects.toBeInstanceOf(RangeError);
  });
});
