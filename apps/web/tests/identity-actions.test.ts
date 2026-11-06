import { describe, expect, it } from 'vitest';
import { completeOnboarding, saveSettings } from '../src/server/actions/identity-actions';
import { readConfig } from '../src/server/config';
import { createContainer } from '../src/server/container';

// The real container with its in memory stores, and one signed up user.
async function setup() {
  const container = createContainer(readConfig({ NODE_ENV: 'test' }));
  const session = await container.auth.createDevSession('learner@stufen.local');
  return { container, userId: session.userId };
}

const VALID_SETTINGS = {
  displayName: 'Manisha',
  uiLocale: 'en',
  timezone: 'Europe/Berlin',
  dailyGoalMinutes: 20,
};

describe('completeOnboarding', () => {
  it('sets the active language and emits user.language_set', async () => {
    const { container, userId } = await setup();
    const result = await completeOnboarding(container, userId, {
      language: 'de',
      targetLevel: 'B2',
    });

    expect(result).toEqual({ ok: true });
    const profile = await container.identity.getProfile(userId);
    expect(profile.activeLanguage).toBe('de');
    const languages = await container.identity.listLearnerLanguages(userId);
    expect(languages).toHaveLength(1);
    expect(languages[0]?.targetLevel).toBe('B2');
    expect(await container.stores.events.count('user.language_set')).toBe(1);
  });

  it('creates the profile when the user has none yet', async () => {
    const container = createContainer(readConfig({ NODE_ENV: 'test' }));
    const result = await completeOnboarding(container, 'no-profile-yet', {
      language: 'de',
      targetLevel: 'A1',
    });
    expect(result).toEqual({ ok: true });
    expect((await container.identity.getProfile('no-profile-yet')).activeLanguage).toBe('de');
  });

  it('rejects Dutch, which is coming soon', async () => {
    const { container, userId } = await setup();
    const result = await completeOnboarding(container, userId, {
      language: 'nl',
      targetLevel: 'B1',
    });

    expect(result).toMatchObject({ ok: false, field: 'language' });
    expect((await container.identity.getProfile(userId)).activeLanguage).toBeNull();
    expect(await container.stores.events.count('user.language_set')).toBe(0);
  });

  it('rejects an unknown language and an unknown level', async () => {
    const { container, userId } = await setup();
    const badLanguage = await completeOnboarding(container, userId, {
      language: 'xx',
      targetLevel: 'B1',
    });
    expect(badLanguage).toMatchObject({ ok: false, field: 'language' });

    const badLevel = await completeOnboarding(container, userId, {
      language: 'de',
      targetLevel: 'D1',
    });
    expect(badLevel).toMatchObject({ ok: false, field: 'targetLevel' });
    expect((await container.identity.getProfile(userId)).activeLanguage).toBeNull();
  });
});

describe('saveSettings', () => {
  it('saves valid values', async () => {
    const { container, userId } = await setup();
    const result = await saveSettings(container, userId, VALID_SETTINGS);

    expect(result).toEqual({ ok: true });
    const profile = await container.identity.getProfile(userId);
    expect(profile.displayName).toBe('Manisha');
    expect(profile.timezone).toBe('Europe/Berlin');
    expect(profile.dailyGoalMinutes).toBe(20);
    expect(profile.uiLocale).toBe('en');
  });

  it('rejects a daily goal of 3 and keeps the old value', async () => {
    const { container, userId } = await setup();
    const result = await saveSettings(container, userId, {
      ...VALID_SETTINGS,
      dailyGoalMinutes: 3,
    });

    expect(result).toMatchObject({ ok: false, field: 'dailyGoalMinutes' });
    expect((await container.identity.getProfile(userId)).dailyGoalMinutes).toBe(15);
  });

  it('rejects an unknown timezone and another interface language', async () => {
    const { container, userId } = await setup();
    const zone = await saveSettings(container, userId, { ...VALID_SETTINGS, timezone: 'Nowhere' });
    expect(zone).toMatchObject({ ok: false, field: 'timezone' });
    const locale = await saveSettings(container, userId, { ...VALID_SETTINGS, uiLocale: 'de' });
    expect(locale).toMatchObject({ ok: false, field: 'uiLocale' });
  });

  // core-identity accepts any string or null as a display name, so a name of
  // only spaces is not an error. The action trims it and stores null.
  it('stores no name when the display name is only spaces', async () => {
    const { container, userId } = await setup();
    await saveSettings(container, userId, VALID_SETTINGS);
    const result = await saveSettings(container, userId, { ...VALID_SETTINGS, displayName: '   ' });

    expect(result).toEqual({ ok: true });
    expect((await container.identity.getProfile(userId)).displayName).toBeNull();
  });

  it('returns a message, not a throw, for a user without a profile', async () => {
    const container = createContainer(readConfig({ NODE_ENV: 'test' }));
    const result = await saveSettings(container, 'nobody', VALID_SETTINGS);
    expect(result.ok).toBe(false);
  });
});
