// Behaviour of the profile api on the in memory store (P0-16). Acceptance check
// from docs/07-build-sequence.md: setActiveLanguage writes learner_languages in
// the in memory store and emits user.language_set.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { CefrLevel, LanguageCode, ProfileEditable } from '@stufen/contracts';
import { createIdentity, createInMemoryProfileStore, ProfileNotFoundError } from '../src/index';

const T0 = '2026-11-05T08:00:00.000Z';
const T1 = '2026-11-05T09:00:00.000Z';
const T2 = '2026-11-05T10:00:00.000Z';

/** A fresh store, bus and identity per test, with a clock the test can move. */
function setup(startAt: string = T0) {
  let current = startAt;
  const store = createInMemoryProfileStore();
  const bus = createEventBus();
  const identity = createIdentity({ store, bus, now: () => new Date(current) });
  return {
    store,
    bus,
    identity,
    setClock(iso: string) {
      current = iso;
    },
  };
}

describe('ensureProfile', () => {
  it('creates a default profile for a new user', async () => {
    const { identity } = setup();

    const profile = await identity.ensureProfile('u1', 'Ada');

    expect(profile).toEqual({
      id: 'u1',
      displayName: 'Ada',
      uiLocale: 'en',
      timezone: 'UTC',
      dailyGoalMinutes: 15,
      activeLanguage: null,
      createdAt: T0,
      updatedAt: T0,
    });
  });

  it('uses a null display name when none is given', async () => {
    const { identity } = setup();

    const profile = await identity.ensureProfile('u1');

    expect(profile.displayName).toBeNull();
  });

  it('is idempotent: a second call returns the same profile and changes nothing', async () => {
    const { identity, setClock } = setup();
    const first = await identity.ensureProfile('u1', 'Ada');
    await identity.updateProfile('u1', { dailyGoalMinutes: 30 });

    setClock(T2);
    const second = await identity.ensureProfile('u1', 'Someone Else');

    expect(second.displayName).toBe('Ada');
    expect(second.dailyGoalMinutes).toBe(30);
    expect(second.createdAt).toBe(first.createdAt);
    expect(await identity.getProfile('u1')).toEqual(second);
  });

  it('two calls racing each other leave one profile', async () => {
    const { identity } = setup();

    const [a, b] = await Promise.all([
      identity.ensureProfile('u1', 'Ada'),
      identity.ensureProfile('u1', 'Bea'),
    ]);

    expect(a).toEqual(b);
    expect(await identity.getProfile('u1')).toEqual(a);
  });
});

describe('getProfile', () => {
  it('returns the stored profile', async () => {
    const { identity } = setup();
    const created = await identity.ensureProfile('u1', 'Ada');

    expect(await identity.getProfile('u1')).toEqual(created);
  });

  it('throws ProfileNotFoundError for an unknown user', async () => {
    const { identity } = setup();

    const failure = identity.getProfile('nobody');

    await expect(failure).rejects.toBeInstanceOf(ProfileNotFoundError);
    await expect(failure).rejects.toMatchObject({ name: 'ProfileNotFoundError', userId: 'nobody' });
  });

  it('hands out copies, so changing a returned profile does not change the store', async () => {
    const { identity } = setup();
    await identity.ensureProfile('u1', 'Ada');

    const copy = await identity.getProfile('u1');
    copy.displayName = 'Changed outside';

    expect((await identity.getProfile('u1')).displayName).toBe('Ada');
  });
});

describe('updateProfile', () => {
  it('changes the editable fields and moves updatedAt', async () => {
    const { identity, setClock } = setup();
    await identity.ensureProfile('u1', 'Ada');

    setClock(T1);
    const updated = await identity.updateProfile('u1', {
      displayName: 'Ada L.',
      uiLocale: 'de',
      timezone: 'Europe/Berlin',
      dailyGoalMinutes: 45,
    });

    expect(updated).toEqual({
      id: 'u1',
      displayName: 'Ada L.',
      uiLocale: 'de',
      timezone: 'Europe/Berlin',
      dailyGoalMinutes: 45,
      activeLanguage: null,
      createdAt: T0,
      updatedAt: T1,
    });
    expect(await identity.getProfile('u1')).toEqual(updated);
  });

  it('a partial patch leaves the other fields alone', async () => {
    const { identity } = setup();
    await identity.ensureProfile('u1', 'Ada');

    const updated = await identity.updateProfile('u1', { timezone: 'Asia/Kolkata' });

    expect(updated.timezone).toBe('Asia/Kolkata');
    expect(updated.displayName).toBe('Ada');
    expect(updated.uiLocale).toBe('en');
    expect(updated.dailyGoalMinutes).toBe(15);
  });

  it('accepts null to clear the display name', async () => {
    const { identity } = setup();
    await identity.ensureProfile('u1', 'Ada');

    const updated = await identity.updateProfile('u1', { displayName: null });

    expect(updated.displayName).toBeNull();
  });

  it('accepts the edges of the daily goal range', async () => {
    const { identity } = setup();
    await identity.ensureProfile('u1');

    expect((await identity.updateProfile('u1', { dailyGoalMinutes: 5 })).dailyGoalMinutes).toBe(5);
    expect((await identity.updateProfile('u1', { dailyGoalMinutes: 120 })).dailyGoalMinutes).toBe(
      120,
    );
  });

  it.each([
    ['dailyGoalMinutes below 5', { dailyGoalMinutes: 4 }],
    ['dailyGoalMinutes above 120', { dailyGoalMinutes: 121 }],
    ['dailyGoalMinutes not a whole number', { dailyGoalMinutes: 12.5 }],
    ['dailyGoalMinutes not a number', { dailyGoalMinutes: Number.NaN }],
    ['uiLocale empty', { uiLocale: '' }],
    ['uiLocale only spaces', { uiLocale: '   ' }],
    ['timezone empty', { timezone: '' }],
  ] satisfies [string, Partial<ProfileEditable>][])(
    'rejects %s and stores nothing',
    async (_label, patch) => {
      const { identity, setClock } = setup();
      const before = await identity.ensureProfile('u1', 'Ada');

      setClock(T1);
      await expect(identity.updateProfile('u1', patch)).rejects.toBeInstanceOf(RangeError);

      expect(await identity.getProfile('u1')).toEqual(before);
    },
  );

  it('rejects a field that is not editable', async () => {
    const { identity } = setup();
    const before = await identity.ensureProfile('u1', 'Ada');
    // What an untyped caller, such as a form handler, could send.
    const sneaky = { activeLanguage: 'de', id: 'u2' } as unknown as Partial<ProfileEditable>;

    await expect(identity.updateProfile('u1', sneaky)).rejects.toBeInstanceOf(RangeError);

    expect(await identity.getProfile('u1')).toEqual(before);
  });

  it('an empty patch returns the profile unchanged', async () => {
    const { identity, setClock } = setup();
    const before = await identity.ensureProfile('u1', 'Ada');

    setClock(T1);

    expect(await identity.updateProfile('u1', {})).toEqual(before);
  });

  it('throws ProfileNotFoundError for an unknown user', async () => {
    const { identity } = setup();

    await expect(identity.updateProfile('nobody', { uiLocale: 'de' })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
    await expect(identity.updateProfile('nobody', {})).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});

describe('setActiveLanguage', () => {
  it('writes learner_languages in the store and emits user.language_set', async () => {
    const { identity, store, bus, setClock } = setup();
    await identity.ensureProfile('u1', 'Ada');
    const onLanguageSet = vi.fn(async () => {});
    bus.on('user.language_set', onLanguageSet);

    setClock(T1);
    await identity.setActiveLanguage('u1', 'de', 'B2');

    // Read straight from the store, not through the api under test.
    expect(await store.listLearnerLanguages('u1')).toEqual([
      {
        userId: 'u1',
        languageCode: 'de',
        targetLevel: 'B2',
        currentLevelEstimate: null,
        startedAt: T1,
      },
    ]);
    expect(onLanguageSet).toHaveBeenCalledTimes(1);
    expect(onLanguageSet).toHaveBeenCalledWith({ userId: 'u1', language: 'de', targetLevel: 'B2' });
  });

  it('sets the active language on the profile', async () => {
    const { identity, setClock } = setup();
    await identity.ensureProfile('u1', 'Ada');

    setClock(T1);
    await identity.setActiveLanguage('u1', 'de', 'B2');

    const profile = await identity.getProfile('u1');
    expect(profile.activeLanguage).toBe('de');
    expect(profile.updatedAt).toBe(T1);
  });

  it('a repeat keeps startedAt, updates the target level and emits again', async () => {
    const { identity, bus, setClock } = setup();
    await identity.ensureProfile('u1', 'Ada');
    const onLanguageSet = vi.fn(async () => {});
    bus.on('user.language_set', onLanguageSet);

    setClock(T1);
    await identity.setActiveLanguage('u1', 'de', 'B1');
    setClock(T2);
    await identity.setActiveLanguage('u1', 'de', 'C1');

    expect(await identity.listLearnerLanguages('u1')).toEqual([
      {
        userId: 'u1',
        languageCode: 'de',
        targetLevel: 'C1',
        currentLevelEstimate: null,
        startedAt: T1,
      },
    ]);
    expect(onLanguageSet).toHaveBeenCalledTimes(2);
    expect(onLanguageSet).toHaveBeenLastCalledWith({
      userId: 'u1',
      language: 'de',
      targetLevel: 'C1',
    });
  });

  it('switching language keeps the earlier one and moves the active language', async () => {
    const { identity, setClock } = setup();
    await identity.ensureProfile('u1', 'Ada');

    setClock(T1);
    await identity.setActiveLanguage('u1', 'de', 'B2');
    setClock(T2);
    await identity.setActiveLanguage('u1', 'fr', 'A2');

    expect((await identity.getProfile('u1')).activeLanguage).toBe('fr');
    expect((await identity.listLearnerLanguages('u1')).map((row) => row.languageCode)).toEqual([
      'de',
      'fr',
    ]);
  });

  it('rejects an unknown language or level, writes nothing and emits nothing', async () => {
    const { identity, bus } = setup();
    await identity.ensureProfile('u1', 'Ada');
    const onAny = vi.fn(async () => {});
    bus.onAny(onAny);

    await expect(
      identity.setActiveLanguage('u1', 'es' as unknown as LanguageCode, 'B2'),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      identity.setActiveLanguage('u1', 'de', 'C3' as unknown as CefrLevel),
    ).rejects.toBeInstanceOf(RangeError);

    expect(await identity.listLearnerLanguages('u1')).toEqual([]);
    expect((await identity.getProfile('u1')).activeLanguage).toBeNull();
    expect(onAny).not.toHaveBeenCalled();
  });

  it('throws ProfileNotFoundError for an unknown user, writes nothing and emits nothing', async () => {
    const { identity, store, bus } = setup();
    const onAny = vi.fn(async () => {});
    bus.onAny(onAny);

    await expect(identity.setActiveLanguage('nobody', 'de', 'B2')).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );

    expect(await store.listLearnerLanguages('nobody')).toEqual([]);
    expect(onAny).not.toHaveBeenCalled();
  });
});

describe('listLearnerLanguages', () => {
  it('returns an empty list for a learner with no language yet', async () => {
    const { identity } = setup();
    await identity.ensureProfile('u1');

    expect(await identity.listLearnerLanguages('u1')).toEqual([]);
  });

  it('lists every language of one learner, oldest first, and not those of another learner', async () => {
    const { identity, setClock } = setup();
    await identity.ensureProfile('u1');
    await identity.ensureProfile('u2');

    setClock(T1);
    await identity.setActiveLanguage('u1', 'nl', 'A2');
    await identity.setActiveLanguage('u2', 'fr', 'B1');
    setClock(T2);
    await identity.setActiveLanguage('u1', 'de', 'C1');

    expect(await identity.listLearnerLanguages('u1')).toEqual([
      {
        userId: 'u1',
        languageCode: 'nl',
        targetLevel: 'A2',
        currentLevelEstimate: null,
        startedAt: T1,
      },
      {
        userId: 'u1',
        languageCode: 'de',
        targetLevel: 'C1',
        currentLevelEstimate: null,
        startedAt: T2,
      },
    ]);
    expect(await identity.listLearnerLanguages('u2')).toEqual([
      {
        userId: 'u2',
        languageCode: 'fr',
        targetLevel: 'B1',
        currentLevelEstimate: null,
        startedAt: T1,
      },
    ]);
  });
});
