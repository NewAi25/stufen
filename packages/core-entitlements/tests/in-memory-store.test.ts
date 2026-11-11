// The in memory adapter: the shared store contract, then the part that is its
// own, which is that it counts use itself.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInMemoryEntitlementStore } from '../src/index';
import { runEntitlementStoreContract } from './store-contract';

runEntitlementStoreContract('in memory', () => createInMemoryEntitlementStore(), {
  newUserId: async () => randomUUID(),
  missingUserId: async () => randomUUID(),
  newFlagKey: () => `flag-${randomUUID()}`,
});

describe('in memory usage', () => {
  const DAY = '2026-11-06';

  it('usedToday is 0 before anything was recorded', async () => {
    const store = createInMemoryEntitlementStore();
    expect(await store.usedToday('user-1', 'tutor_messages_per_day', DAY)).toBe(0);
  });

  it('recordUse adds to the count of that user, limit and day only', async () => {
    const store = createInMemoryEntitlementStore();

    await store.recordUse('user-1', 'tutor_messages_per_day', 2, DAY);
    await store.recordUse('user-1', 'tutor_messages_per_day', 3, DAY);

    expect(await store.usedToday('user-1', 'tutor_messages_per_day', DAY)).toBe(5);
    expect(await store.usedToday('user-1', 'writing_grades_per_day', DAY)).toBe(0);
    expect(await store.usedToday('user-1', 'tutor_messages_per_day', '2026-11-07')).toBe(0);
    expect(await store.usedToday('user-2', 'tutor_messages_per_day', DAY)).toBe(0);
  });
});
