// The hashing helpers of the Postgres adapter. Pure functions, no database.
import { describe, expect, it } from 'vitest';
import { hashToken, linkIdentifier } from '../src/postgres-store';

describe('hashToken', () => {
  it('is SHA-256 as 64 lower case hex characters', () => {
    // Test vector from FIPS 180-2, appendix B.1.
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('gives the same hash for the same token and another for a token one character off', () => {
    expect(hashToken('token-1')).toBe(hashToken('token-1'));
    expect(hashToken('token-1')).not.toBe(hashToken('token-2'));
    expect(hashToken('token-1')).not.toBe(hashToken('Token-1'));
  });

  it('never contains the token it was made from', () => {
    const token = 'a'.repeat(64);

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(token);
  });
});

describe('linkIdentifier', () => {
  it('is magic-link: followed by the hash, without the raw token', () => {
    const token = 'raw-link-token';

    expect(linkIdentifier(token)).toBe(`magic-link:${hashToken(token)}`);
    expect(linkIdentifier(token)).not.toContain(token);
  });
});
