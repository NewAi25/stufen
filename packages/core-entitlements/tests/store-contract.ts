// The behaviour every EntitlementStore adapter shares. Each adapter's test file
// calls runEntitlementStoreContract with a way to make the store and a way to
// make users. Usage is not here: the in memory store records use itself and
// the Postgres store counts real rows, so each adapter tests usage on its own.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entitlement } from '@stufen/contracts';
import type { EntitlementStore, FeatureFlag } from '../src/index';

export interface StoreContractHooks {
  /**
   * A user id the store can hold an entitlement for. The Postgres adapter
   * creates a real user here, so the row from ensure_profile may already exist.
   */
  newUserId(): Promise<string>;
  /** A user id that has no entitlement row. */
  missingUserId(): Promise<string>;
  /** A flag key no other test or worker uses. */
  newFlagKey(): string;
  /** Runs once before the first test, for example to open a connection. */
  setup?(): Promise<void>;
  /** Runs once after the last test. Removes what the hooks created. */
  cleanup?(): Promise<void>;
}

/** The row with `updatedAt` blanked, because a database may stamp it with its own clock. */
function withoutUpdatedAt(entitlement: Entitlement): Entitlement {
  return { ...entitlement, updatedAt: '' };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function runEntitlementStoreContract(
  name: string,
  makeStore: () => EntitlementStore | Promise<EntitlementStore>,
  hooks: StoreContractHooks,
): void {
  describe(`EntitlementStore contract: ${name}`, () => {
    let store: EntitlementStore;

    beforeAll(async () => {
      await hooks.setup?.();
      store = await makeStore();
    });

    afterAll(async () => {
      await hooks.cleanup?.();
    });

    const entitlementFor = (userId: string, overrides: Partial<Entitlement> = {}): Entitlement => ({
      userId,
      plan: 'plus',
      features: { exam_sim: false },
      limits: { tutor_messages_per_day: 7 },
      source: 'manual',
      expiresAt: '2030-01-02T03:04:05.000Z',
      updatedAt: '2026-11-06T08:00:00.000Z',
      ...overrides,
    });

    it('getEntitlement returns null for a user without a row', async () => {
      expect(await store.getEntitlement(await hooks.missingUserId())).toBeNull();
    });

    it('upsertEntitlement returns what was stored', async () => {
      const wanted = entitlementFor(await hooks.newUserId());

      const stored = await store.upsertEntitlement(wanted);

      expect(withoutUpdatedAt(stored)).toEqual(withoutUpdatedAt(wanted));
      expect(stored.updatedAt).toMatch(ISO);
    });

    it('getEntitlement returns the row upsertEntitlement stored', async () => {
      const userId = await hooks.newUserId();
      const stored = await store.upsertEntitlement(entitlementFor(userId));

      expect(await store.getEntitlement(userId)).toEqual(stored);
    });

    it('a second upsert replaces the row, overrides and expiry included', async () => {
      const userId = await hooks.newUserId();
      await store.upsertEntitlement(entitlementFor(userId));
      const second = entitlementFor(userId, {
        plan: 'free_beta',
        features: {},
        limits: {},
        source: 'default',
        expiresAt: null,
      });

      const stored = await store.upsertEntitlement(second);

      expect(withoutUpdatedAt(stored)).toEqual(withoutUpdatedAt(second));
      expect(await store.getEntitlement(userId)).toEqual(stored);
    });

    it('rows of two users do not mix', async () => {
      const first = await hooks.newUserId();
      const second = await hooks.newUserId();
      await store.upsertEntitlement(entitlementFor(first, { plan: 'pro' }));
      await store.upsertEntitlement(entitlementFor(second, { plan: 'free' }));

      expect((await store.getEntitlement(first))?.plan).toBe('pro');
      expect((await store.getEntitlement(second))?.plan).toBe('free');
    });

    it('features and limits come back as plain objects the caller may change', async () => {
      const userId = await hooks.newUserId();
      await store.upsertEntitlement(entitlementFor(userId));

      const read = await store.getEntitlement(userId);
      if (read) read.limits.tutor_messages_per_day = 999;

      expect((await store.getEntitlement(userId))?.limits).toEqual({ tutor_messages_per_day: 7 });
    });

    it('getFlag returns null for an unknown key', async () => {
      expect(await store.getFlag(hooks.newFlagKey())).toBeNull();
    });

    it('setFlag then getFlag returns the flag with its rules', async () => {
      const flag: FeatureFlag = {
        key: hooks.newFlagKey(),
        enabled: true,
        rules: { allow: ['a'], deny: ['b'], plans: ['plus'], min_level: 'B1', percent: 25 },
      };

      await store.setFlag(flag);

      expect(await store.getFlag(flag.key)).toEqual(flag);
    });

    it('setFlag on an existing key replaces the row', async () => {
      const key = hooks.newFlagKey();
      await store.setFlag({ key, enabled: true, rules: { percent: 10 } });

      await store.setFlag({ key, enabled: false, rules: {} });

      expect(await store.getFlag(key)).toEqual({ key, enabled: false, rules: {} });
    });
  });
}
