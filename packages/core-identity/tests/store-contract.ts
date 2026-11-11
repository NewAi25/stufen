// The behaviour every ProfileStore adapter must show, written against the port
// only. Not a test file itself: store-contract.memory.test.ts runs it for the
// in memory store and postgres-store.integration.test.ts for Postgres.
//
// Two things are left open on purpose, because the adapters differ there:
//   * createdAt and updatedAt. The in memory store keeps the caller's values,
//     Postgres uses its own clock. The contract only asks for ISO strings and
//     an updatedAt that never moves backwards.
//   * insertProfile with a null displayName. Postgres keeps what
//     ensure_profile wrote. The contract always inserts with a name.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Profile } from '@stufen/contracts';
import type { ProfileStore } from '../src/index';

export interface ProfileStoreHarness {
  store: ProfileStore;
  /** A fresh uuid the store may create a profile for (Postgres: a row in users exists). */
  newUserId(): Promise<string>;
}

const T1 = '2026-11-05T08:00:00.000Z';
const T2 = '2026-11-05T09:00:00.000Z';
const T3 = '2026-11-05T10:00:00.000Z';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function profileFor(id: string, overrides: Partial<Profile> = {}): Profile {
  const at = new Date().toISOString();
  return {
    id,
    displayName: 'Ada',
    uiLocale: 'en',
    timezone: 'UTC',
    dailyGoalMinutes: 15,
    activeLanguage: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

/** The columns a caller chooses, without the two timestamps. */
function fields(profile: Profile): Omit<Profile, 'createdAt' | 'updatedAt'> {
  const { id, displayName, uiLocale, timezone, dailyGoalMinutes, activeLanguage } = profile;
  return { id, displayName, uiLocale, timezone, dailyGoalMinutes, activeLanguage };
}

export function runProfileStoreContract(
  name: string,
  makeStore: () => ProfileStoreHarness | Promise<ProfileStoreHarness>,
): void {
  describe(`ProfileStore contract: ${name}`, () => {
    let store: ProfileStore;
    let newUserId: () => Promise<string>;

    beforeAll(async () => {
      const harness = await makeStore();
      store = harness.store;
      newUserId = () => harness.newUserId();
    });

    /** A user with a stored profile. */
    async function seeded(overrides: Partial<Profile> = {}): Promise<Profile> {
      return store.insertProfile(profileFor(await newUserId(), overrides));
    }

    describe('getProfile', () => {
      it('returns null for a user with no profile', async () => {
        expect(await store.getProfile(await newUserId())).toBeNull();
      });
    });

    describe('insertProfile', () => {
      it('stores the default fields and returns the row', async () => {
        const wanted = profileFor(await newUserId());

        const stored = await store.insertProfile(wanted);

        expect(fields(stored)).toEqual(fields(wanted));
        expect(stored.createdAt).toMatch(ISO);
        expect(stored.updatedAt).toMatch(ISO);
        expect(await store.getProfile(wanted.id)).toEqual(stored);
      });

      it('stores fields that are not the defaults', async () => {
        const wanted = profileFor(await newUserId(), {
          displayName: 'Grace',
          uiLocale: 'de',
          timezone: 'Europe/Berlin',
          dailyGoalMinutes: 30,
          activeLanguage: 'de',
        });

        const stored = await store.insertProfile(wanted);

        expect(fields(stored)).toEqual(fields(wanted));
        expect(await store.getProfile(wanted.id)).toEqual(stored);
      });

      it('is idempotent: a second insert keeps the first row and returns it', async () => {
        const first = await seeded({ displayName: 'Ada', dailyGoalMinutes: 20 });

        const second = await store.insertProfile(
          profileFor(first.id, {
            displayName: 'Someone else',
            dailyGoalMinutes: 60,
            uiLocale: 'fr',
          }),
        );

        expect(second).toEqual(first);
        expect(await store.getProfile(first.id)).toEqual(first);
      });
    });

    describe('updateProfile', () => {
      it('persists the named fields and keeps the others', async () => {
        const before = await seeded({ displayName: 'Ada', timezone: 'Europe/Berlin' });

        const updated = await store.updateProfile(before.id, {
          dailyGoalMinutes: 45,
          uiLocale: 'de',
          activeLanguage: 'de',
          updatedAt: new Date().toISOString(),
        });

        expect(updated).not.toBeNull();
        expect(updated).toMatchObject({
          id: before.id,
          displayName: 'Ada',
          timezone: 'Europe/Berlin',
          dailyGoalMinutes: 45,
          uiLocale: 'de',
          activeLanguage: 'de',
          createdAt: before.createdAt,
        });
        expect(updated?.updatedAt).toMatch(ISO);
        expect(Date.parse(updated?.updatedAt ?? '')).toBeGreaterThanOrEqual(
          Date.parse(before.updatedAt),
        );
        expect(await store.getProfile(before.id)).toEqual(updated);
      });

      it('can clear the display name and the active language', async () => {
        const before = await seeded({ displayName: 'Ada', activeLanguage: 'de' });

        const updated = await store.updateProfile(before.id, {
          displayName: null,
          activeLanguage: null,
          updatedAt: new Date().toISOString(),
        });

        expect(updated?.displayName).toBeNull();
        expect(updated?.activeLanguage).toBeNull();
      });

      it('returns null for a user with no profile and creates nothing', async () => {
        const unknown = await newUserId();

        const updated = await store.updateProfile(unknown, {
          dailyGoalMinutes: 45,
          updatedAt: new Date().toISOString(),
        });

        expect(updated).toBeNull();
        expect(await store.getProfile(unknown)).toBeNull();
      });

      it('changes only the profile of the user it is called for', async () => {
        const mine = await seeded({ displayName: 'Mine' });
        const other = await seeded({ displayName: 'Other' });

        await store.updateProfile(mine.id, {
          displayName: 'Changed',
          updatedAt: new Date().toISOString(),
        });

        expect(await store.getProfile(other.id)).toEqual(other);
      });
    });

    describe('upsertLearnerLanguage', () => {
      it('inserts a row with no level estimate and the given start', async () => {
        const { id } = await seeded();

        const row = await store.upsertLearnerLanguage({
          userId: id,
          languageCode: 'de',
          targetLevel: 'B2',
          startedAt: T1,
        });

        expect(row).toEqual({
          userId: id,
          languageCode: 'de',
          targetLevel: 'B2',
          currentLevelEstimate: null,
          startedAt: T1,
        });
        expect(await store.listLearnerLanguages(id)).toEqual([row]);
      });

      it('on a repeat keeps startedAt and changes the target level', async () => {
        const { id } = await seeded();
        await store.upsertLearnerLanguage({
          userId: id,
          languageCode: 'de',
          targetLevel: 'B2',
          startedAt: T1,
        });

        const again = await store.upsertLearnerLanguage({
          userId: id,
          languageCode: 'de',
          targetLevel: 'C1',
          startedAt: T3,
        });

        expect(again.targetLevel).toBe('C1');
        expect(again.startedAt).toBe(T1);
        expect(again.currentLevelEstimate).toBeNull();
        expect(await store.listLearnerLanguages(id)).toEqual([again]);
      });
    });

    describe('listLearnerLanguages', () => {
      it('returns an empty list for a learner with no languages', async () => {
        const { id } = await seeded();
        expect(await store.listLearnerLanguages(id)).toEqual([]);
        expect(await store.listLearnerLanguages(await newUserId())).toEqual([]);
      });

      it('orders by startedAt, oldest first, then by language code', async () => {
        const { id } = await seeded();
        const add = (languageCode: 'de' | 'nl' | 'fr', startedAt: string) =>
          store.upsertLearnerLanguage({ userId: id, languageCode, targetLevel: 'B1', startedAt });
        await add('nl', T1);
        await add('fr', T2);
        await add('de', T2);

        const rows = await store.listLearnerLanguages(id);

        expect(rows.map((row) => [row.languageCode, row.startedAt])).toEqual([
          ['nl', T1],
          ['de', T2],
          ['fr', T2],
        ]);
      });

      it('lists only the languages of the learner it is called for', async () => {
        const mine = await seeded();
        const other = await seeded();
        await store.upsertLearnerLanguage({
          userId: other.id,
          languageCode: 'fr',
          targetLevel: 'A2',
          startedAt: T1,
        });

        expect(await store.listLearnerLanguages(mine.id)).toEqual([]);
      });
    });
  });
}
