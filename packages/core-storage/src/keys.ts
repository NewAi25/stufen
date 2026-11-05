// Storage key rules. A key is a relative, forward slash separated path such as
// `u1/speech/2f6c.webm`. Every adapter validates keys with `normaliseKey`
// before it touches a disk or a bucket, so a key can never climb out of the
// place it was meant for.

/** Longest key accepted, in characters. */
export const MAX_KEY_LENGTH = 512;

export type StorageKeyErrorReason =
  | 'not_a_string'
  | 'empty'
  | 'too_long'
  | 'control_character'
  | 'drive_letter'
  | 'backslash'
  | 'absolute_path'
  | 'trailing_slash'
  | 'empty_segment'
  | 'dot_segment'
  | 'trailing_dot'
  | 'invalid_character'
  | 'reserved_suffix'
  | 'outside_root';

const REASON_TEXT: Record<StorageKeyErrorReason, string> = {
  not_a_string: 'the key must be a string',
  empty: 'the key is empty',
  too_long: `the key is longer than ${MAX_KEY_LENGTH} characters`,
  control_character: 'the key contains a control character',
  drive_letter: 'the key starts with a drive letter',
  backslash: 'the key contains a backslash; use forward slashes',
  absolute_path: 'the key starts with a slash; keys are relative',
  trailing_slash: 'the key ends with a slash',
  empty_segment: 'the key contains an empty segment (two slashes in a row)',
  dot_segment: 'the key contains a "." or ".." segment',
  trailing_dot: 'a segment of the key ends with a dot',
  invalid_character:
    'the key contains a character outside letters, digits, dot, underscore and hyphen',
  reserved_suffix: 'the key ends with a suffix this adapter reserves for its own files',
  outside_root: 'the key resolves to a path outside the storage root',
};

/** Thrown for any key an adapter refuses. `reason` says which rule failed. */
export class StorageKeyError extends Error {
  readonly reason: StorageKeyErrorReason;

  constructor(reason: StorageKeyErrorReason) {
    super(`Invalid storage key: ${REASON_TEXT[reason]}.`);
    this.name = 'StorageKeyError';
    this.reason = reason;
  }
}

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const DRIVE_LETTER = /^[A-Za-z]:/;

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Checks a key and returns it unchanged when it is valid. There is nothing to
 * rewrite: every shape that would need rewriting is rejected instead.
 *
 * Rejected: empty keys, keys over 512 characters, control characters, drive
 * letters, backslashes, a leading or trailing slash, empty segments, any `.`
 * or `..` segment, a segment ending in a dot, and any character outside
 * ASCII letters, digits, dot, underscore and hyphen.
 */
export function normaliseKey(key: string): string {
  if (typeof key !== 'string') throw new StorageKeyError('not_a_string');
  if (key.length === 0) throw new StorageKeyError('empty');
  if (key.length > MAX_KEY_LENGTH) throw new StorageKeyError('too_long');
  if (hasControlCharacter(key)) throw new StorageKeyError('control_character');
  if (DRIVE_LETTER.test(key)) throw new StorageKeyError('drive_letter');
  if (key.includes('\\')) throw new StorageKeyError('backslash');
  if (key.startsWith('/')) throw new StorageKeyError('absolute_path');
  if (key.endsWith('/')) throw new StorageKeyError('trailing_slash');

  for (const segment of key.split('/')) {
    if (segment.length === 0) throw new StorageKeyError('empty_segment');
    if (segment === '.' || segment === '..') throw new StorageKeyError('dot_segment');
    if (!SEGMENT.test(segment)) throw new StorageKeyError('invalid_character');
    // Windows silently drops trailing dots, so `a.` and `a` would be one file.
    if (segment.endsWith('.')) throw new StorageKeyError('trailing_dot');
  }
  return key;
}
