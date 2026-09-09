// Smoke test proving the Vitest toolchain runs inside a box.
// P0-10 replaces this file with the real contract tests.
import { describe, expect, it } from 'vitest';

describe('toolchain smoke', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
