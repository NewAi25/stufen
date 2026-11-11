// stableId and the key rules behind it (P1-02).
import { describe, expect, it } from 'vitest';
import { stableId } from '../src/index';
import {
  candoKey,
  exerciseKey,
  lessonKey,
  STUFEN_PACK_NAMESPACE,
  unitKey,
  uuidV5,
} from '../src/ids';

const NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** stableId('de:cando:A1.LIS.03'), computed once when the namespace was chosen. */
const PINNED = '96d752fc-1ecf-5ea7-8311-3863b6469c17';

describe('uuidV5', () => {
  it('matches the published test vector of RFC 9562, appendix A.4', () => {
    expect(uuidV5('www.example.com', NAMESPACE_DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('matches the example in the Python uuid documentation', () => {
    expect(uuidV5('python.org', NAMESPACE_DNS)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('hashes the name as UTF-8 and rejects a namespace that is not a uuid', () => {
    expect(uuidV5('heißen', NAMESPACE_DNS)).toMatch(UUID_V5);
    expect(uuidV5('heißen', NAMESPACE_DNS)).not.toBe(uuidV5('heissen', NAMESPACE_DNS));
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(TypeError);
  });
});

describe('stableId', () => {
  it('is deterministic: the same key gives the same id', () => {
    expect(stableId('de:vocab:haus')).toBe(stableId('de:vocab:haus'));
    expect(stableId('de:vocab:haus')).toBe(uuidV5('de:vocab:haus', STUFEN_PACK_NAMESPACE));
  });

  it('returns a version 5 uuid and a different one per key', () => {
    const keys = ['de:vocab:haus', 'de:vocab:Haus', 'nl:vocab:haus', 'de:cando:A1.LIS.03'];
    const ids = keys.map(stableId);
    for (const id of ids) expect(id).toMatch(UUID_V5);
    expect(new Set(ids).size).toBe(keys.length);
  });

  it('pins the namespace: this id must never change', () => {
    expect(STUFEN_PACK_NAMESPACE).toBe('6f0c1c0e-5b7a-5c41-9d2e-7a1f3b8e4c55');
    expect(stableId('de:cando:A1.LIS.03')).toBe(PINNED);
  });

  it('rejects an empty key', () => {
    expect(() => stableId('')).toThrow(TypeError);
  });
});

describe('key rules', () => {
  it("uses the pack's own keys when it has them", () => {
    expect(candoKey('de', { key: 'de:cando:A1.LIS.03', code: 'A1.LIS.03' })).toBe(
      'de:cando:A1.LIS.03',
    );
    expect(unitKey('de', { key: 'de:unit:a1-01-hallo', slug: 'hallo' })).toBe(
      'de:unit:a1-01-hallo',
    );
    expect(lessonKey('de', { slug: 'hallo' }, { key: 'de:lesson:a1-01-01', slug: 'x' })).toBe(
      'de:lesson:a1-01-01',
    );
    expect(exerciseKey('de:lesson:a1-01-01', { key: 'de:exercise:a1-01-01-04', ordinal: 4 })).toBe(
      'de:lesson:a1-01-01#de:exercise:a1-01-01-04',
    );
  });

  it('derives a key for a record that has none', () => {
    expect(candoKey('nl', { key: '', code: 'A1.REA.01' })).toBe('nl:cando:A1.REA.01');
    expect(unitKey('nl', { key: '', slug: 'hallo' })).toBe('nl:unit:hallo');
    expect(lessonKey('nl', { slug: 'hallo' }, { key: '', slug: 'ik-heet' })).toBe(
      'nl:lesson:hallo/ik-heet',
    );
    expect(exerciseKey('nl:lesson:hallo/ik-heet', { key: '', ordinal: 3 })).toBe(
      'nl:lesson:hallo/ik-heet#3',
    );
  });
});
