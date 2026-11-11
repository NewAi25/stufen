// The behaviour every ContentStore adapter shares. Not a test file itself:
// each adapter's test calls runContentStoreContract with a way to make a store.
//
// Version strings are unique per test, so the checks also hold on a database
// that keeps rows between runs. The two language codes must have no rows left
// from another run when a test starts; the Postgres test deletes what it wrote
// after every test.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '@stufen/contracts';
import type { ContentStore, RecordVersionInput } from '../src/index';

type MaybePromise<T> = T | Promise<T>;

const START = Date.parse('2026-11-11T09:00:00.000Z');

/** A version string no other test uses, for example 1.0.0-t.3f2a... */
export function uniqueVersion(label = '1.0.0'): string {
  return `${label}-t.${randomUUID()}`;
}

/** `minutes` moves installedAt forward from a fixed start. */
function at(minutes: number): string {
  return new Date(START + minutes * 60_000).toISOString();
}

/**
 * @param name       shown in the report, for example 'in memory' or 'Postgres'
 * @param makeStore  the store under test; called once per test
 * @param languages  two language codes the store accepts
 */
export function runContentStoreContract(
  name: string,
  makeStore: () => MaybePromise<ContentStore>,
  languages: [LanguageCode, LanguageCode] = ['nl', 'fr'],
): void {
  const [first, second] = languages;

  function input(minutes: number, override: Partial<RecordVersionInput> = {}): RecordVersionInput {
    return {
      language: first,
      version: uniqueVersion(),
      checksum: 'sha256:aaaa',
      status: 'active',
      installedAt: at(minutes),
      ...override,
    };
  }

  describe(`ContentStore contract: ${name}`, () => {
    it('a language with no rows has no active version and an empty list', async () => {
      const store = await makeStore();

      expect(await store.activeVersion(first)).toBeNull();
      expect(await store.listVersions(first)).toEqual([]);
    });

    it('recordVersion stores the row and resolves to it', async () => {
      const store = await makeStore();
      const row = input(0, { checksum: 'sha256:1234' });

      const stored = await store.recordVersion(row);

      expect(stored).toEqual(row);
      expect(await store.activeVersion(first)).toEqual(row);
      expect(await store.listVersions(first)).toEqual([row]);
    });

    it('recording a new active version marks the previous active one superseded', async () => {
      const store = await makeStore();
      const v1 = input(0);
      const v2 = input(1, { checksum: 'sha256:bbbb' });
      await store.recordVersion(v1);

      await store.recordVersion(v2);

      expect(await store.activeVersion(first)).toEqual(v2);
      expect(await store.listVersions(first)).toEqual([v2, { ...v1, status: 'superseded' }]);
    });

    it('never leaves two active rows, however many versions are installed', async () => {
      const store = await makeStore();
      const rows = [input(0), input(1), input(2), input(3)];

      for (const row of rows) await store.recordVersion(row);

      const listed = await store.listVersions(first);
      expect(listed.map((row) => row.version)).toEqual(rows.map((row) => row.version).reverse());
      expect(listed.map((row) => row.status)).toEqual([
        'active',
        'superseded',
        'superseded',
        'superseded',
      ]);
    });

    it('a failed or installing version does not supersede the active one', async () => {
      const store = await makeStore();
      const active = input(0);
      const failed = input(1, { status: 'failed' });
      const installing = input(2, { status: 'installing' });
      await store.recordVersion(active);

      await store.recordVersion(failed);
      await store.recordVersion(installing);

      expect(await store.activeVersion(first)).toEqual(active);
      expect(await store.listVersions(first)).toEqual([installing, failed, active]);
    });

    it('a language whose only row is failed has no active version', async () => {
      const store = await makeStore();
      await store.recordVersion(input(0, { status: 'failed' }));

      expect(await store.activeVersion(first)).toBeNull();
    });

    it('two versions recorded as active at the same time end with exactly one active row', async () => {
      const store = await makeStore();
      // Several rounds, since the outcome of a race is not the same every time.
      for (let round = 0; round < 5; round += 1) {
        const a = input(round * 2);
        const b = input(round * 2 + 1);

        const stored = await Promise.all([store.recordVersion(a), store.recordVersion(b)]);

        expect(stored.map((row) => row.version)).toEqual([a.version, b.version]);
        const listed = await store.listVersions(first);
        expect(listed.filter((row) => row.status === 'active')).toHaveLength(1);
        expect(listed).toHaveLength((round + 1) * 2);
        const active = await store.activeVersion(first);
        expect([a.version, b.version]).toContain(active?.version);
      }
    });

    it('recording the same language and version again replaces that row', async () => {
      const store = await makeStore();
      const version = uniqueVersion();
      await store.recordVersion(input(0, { version, status: 'failed', checksum: 'sha256:old' }));

      const again = input(5, { version, status: 'active', checksum: 'sha256:new' });
      await store.recordVersion(again);

      expect(await store.listVersions(first)).toEqual([again]);
      expect(await store.activeVersion(first)).toEqual(again);
    });

    it('installing an older version again makes it active and supersedes the newer one', async () => {
      const store = await makeStore();
      const v1 = input(0);
      const v2 = input(1);
      await store.recordVersion(v1);
      await store.recordVersion(v2);

      const rollback = { ...v1, installedAt: at(2) };
      await store.recordVersion(rollback);

      expect(await store.activeVersion(first)).toEqual(rollback);
      expect(await store.listVersions(first)).toEqual([rollback, { ...v2, status: 'superseded' }]);
    });

    it('languages do not affect each other', async () => {
      const store = await makeStore();
      const ofFirst = input(0);
      const ofSecond = input(1, { language: second });
      await store.recordVersion(ofFirst);
      await store.recordVersion(ofSecond);

      const newer = input(2, { language: second });
      await store.recordVersion(newer);

      expect(await store.activeVersion(first)).toEqual(ofFirst);
      expect(await store.listVersions(first)).toEqual([ofFirst]);
      expect(await store.activeVersion(second)).toEqual(newer);
      expect(await store.listVersions(second)).toEqual([
        newer,
        { ...ofSecond, status: 'superseded' },
      ]);
    });

    it('the same version string may exist in two languages', async () => {
      const store = await makeStore();
      const version = uniqueVersion();

      await store.recordVersion(input(0, { version }));
      await store.recordVersion(input(0, { version, language: second, status: 'failed' }));

      expect((await store.listVersions(first)).map((row) => row.status)).toEqual(['active']);
      expect((await store.listVersions(second)).map((row) => row.status)).toEqual(['failed']);
    });

    it('installedAt defaults to the current time', async () => {
      const store = await makeStore();
      const before = Date.now();
      const { installedAt: _unused, ...row } = input(0);
      void _unused;

      const stored = await store.recordVersion(row);

      const time = Date.parse(stored.installedAt);
      // Generous bounds: the Postgres clock is not the clock of this process.
      expect(time).toBeGreaterThan(before - 60_000);
      expect(time).toBeLessThan(Date.now() + 60_000);
      expect(stored.installedAt).toBe(new Date(time).toISOString());
    });

    it('what a caller holds is a copy: changing it does not change the store', async () => {
      const store = await makeStore();
      const row = input(0);
      const stored = await store.recordVersion(row);
      stored.status = 'failed';
      const listed = await store.listVersions(first);
      if (listed[0]) listed[0].checksum = 'changed';

      expect(await store.activeVersion(first)).toEqual(row);
    });
  });
}
