// The in memory ContentStore against the shared contract (P1-03).
import { describe, expect, it } from 'vitest';
import { createInMemoryContentStore } from '../src/index';
import { runContentStoreContract, uniqueVersion } from './store-contract';

runContentStoreContract('in memory', () => createInMemoryContentStore(), ['nl', 'fr']);
runContentStoreContract('in memory, German and Dutch', () => createInMemoryContentStore(), [
  'de',
  'nl',
]);

describe('what is specific to the in memory store', () => {
  it('rows with the same installedAt list the later write first', async () => {
    const store = createInMemoryContentStore();
    const installedAt = '2026-11-11T10:00:00.000Z';
    const versions = [uniqueVersion(), uniqueVersion(), uniqueVersion()];
    for (const version of versions) {
      await store.recordVersion({
        language: 'nl',
        version,
        checksum: 'c',
        status: 'failed',
        installedAt,
      });
    }

    const listed = await store.listVersions('nl');

    expect(listed.map((row) => row.version)).toEqual([...versions].reverse());
  });

  it('two stores share nothing', async () => {
    const one = createInMemoryContentStore();
    const two = createInMemoryContentStore();
    await one.recordVersion({ language: 'nl', version: '1.0.0', checksum: 'c', status: 'active' });

    expect(await two.activeVersion('nl')).toBeNull();
  });
});
