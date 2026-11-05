// Behaviour of core-entitlements (P0-18). Acceptance check from
// docs/07-build-sequence.md: a new user gets free_beta; can(user, 'tutor') is
// true; consume past the limit throws.
import { describe, expect, it, vi } from 'vitest';
import { FEATURE_KEYS, createEventBus } from '@stufen/contracts';
import type { Entitlement, PlanId } from '@stufen/contracts';
import {
  LimitExceededError,
  PLANS,
  createEntitlements,
  createInMemoryEntitlementStore,
} from '../src/index';

const USER = 'user-1';
const OTHER = 'user-2';
const START = '2026-11-05T10:00:00.000Z';

/** A fresh store, bus and service with a clock the test can move. */
function setup(startAt: string = START) {
  const clock = { current: new Date(startAt) };
  const store = createInMemoryEntitlementStore();
  const bus = createEventBus();
  const entitlements = createEntitlements({ store, bus, now: () => clock.current });
  return { clock, store, bus, entitlements };
}

function row(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    userId: USER,
    plan: 'free_beta',
    features: {},
    limits: {},
    source: 'default',
    expiresAt: null,
    updatedAt: START,
    ...overrides,
  };
}

describe('acceptance', () => {
  it('a new user gets free_beta', async () => {
    const { store, entitlements } = setup();

    const entitlement = await entitlements.plan(USER);

    expect(entitlement).toEqual({
      userId: USER,
      plan: 'free_beta',
      features: {},
      limits: {},
      source: 'default',
      expiresAt: null,
      updatedAt: START,
    });
    expect(await store.getEntitlement(USER)).toEqual(entitlement);
  });

  it("can(user, 'tutor') is true", async () => {
    const { entitlements } = setup();
    expect(await entitlements.can(USER, 'tutor')).toBe(true);
  });

  it('consume past the limit throws', async () => {
    const { entitlements } = setup();
    await entitlements.consume(USER, 'writing_grades_per_day', 20);

    await expect(entitlements.consume(USER, 'writing_grades_per_day')).rejects.toBeInstanceOf(
      LimitExceededError,
    );
  });
});

describe('plan data', () => {
  it.each(FEATURE_KEYS)('free_beta has %s on', (feature) => {
    expect(PLANS.free_beta.features[feature]).toBe(true);
  });

  it('free_beta limits match the migration default', () => {
    expect(PLANS.free_beta.limits).toEqual({
      tutor_messages_per_day: 200,
      writing_grades_per_day: 20,
      speech_minutes_per_day: 30,
    });
  });

  it('only free_beta is active', () => {
    const active = Object.values(PLANS)
      .filter((definition) => definition.active)
      .map((definition) => definition.id);
    expect(active).toEqual(['free_beta']);
  });
});

describe('plan', () => {
  it('returns the stored row without rewriting it', async () => {
    const { store, entitlements } = setup();
    const stored = row({ plan: 'pro', source: 'manual', updatedAt: '2026-10-01T00:00:00.000Z' });
    await store.upsertEntitlement(stored);

    expect(await entitlements.plan(USER)).toEqual(stored);
  });

  it('does not emit when it creates the default row', async () => {
    const { bus, entitlements } = setup();
    const changed = vi.fn(async () => {});
    bus.on('entitlement.changed', changed);

    await entitlements.plan(USER);

    expect(changed).not.toHaveBeenCalled();
  });
});

describe('can', () => {
  it.each(FEATURE_KEYS)('%s is on for a new user', async (feature) => {
    const { entitlements } = setup();
    expect(await entitlements.can(USER, feature)).toBe(true);
  });

  it('a feature override on the row wins over the plan', async () => {
    const { store, entitlements } = setup();
    await store.upsertEntitlement(row({ features: { exam_sim: false } }));

    expect(await entitlements.can(USER, 'exam_sim')).toBe(false);
    expect(await entitlements.can(USER, 'tutor')).toBe(true);
  });

  it('an override can also switch on what the plan has off', async () => {
    const { store, entitlements } = setup();
    await store.upsertEntitlement(row({ plan: 'free', features: { exam_sim: true } }));

    expect(await entitlements.can(USER, 'exam_sim')).toBe(true);
    expect(await entitlements.can(USER, 'levels_above_b1')).toBe(false);
  });
});

describe('remaining and consume', () => {
  it('remaining starts at the plan limit', async () => {
    const { entitlements } = setup();

    expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(200);
    expect(await entitlements.remaining(USER, 'writing_grades_per_day')).toBe(20);
    expect(await entitlements.remaining(USER, 'speech_minutes_per_day')).toBe(30);
  });

  it('a limit override on the row wins over the plan', async () => {
    const { store, entitlements } = setup();
    await store.upsertEntitlement(row({ limits: { tutor_messages_per_day: 3 } }));

    expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(3);
    expect(await entitlements.remaining(USER, 'writing_grades_per_day')).toBe(20);
  });

  it('remaining decreases as the user consumes', async () => {
    const { entitlements } = setup();

    await entitlements.consume(USER, 'tutor_messages_per_day');
    expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(199);

    await entitlements.consume(USER, 'tutor_messages_per_day', 9);
    expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(190);
  });

  it('use is counted per user and per limit', async () => {
    const { entitlements } = setup();
    await entitlements.consume(USER, 'tutor_messages_per_day', 5);

    expect(await entitlements.remaining(OTHER, 'tutor_messages_per_day')).toBe(200);
    expect(await entitlements.remaining(USER, 'writing_grades_per_day')).toBe(20);
  });

  it('remaining never goes below zero', async () => {
    const { store, entitlements } = setup();
    await store.recordUse(USER, 'writing_grades_per_day', 25, '2026-11-05');

    expect(await entitlements.remaining(USER, 'writing_grades_per_day')).toBe(0);
  });

  it('consume exactly to the limit succeeds, then the next one throws', async () => {
    const { store, entitlements } = setup();
    await store.upsertEntitlement(row({ limits: { tutor_messages_per_day: 3 } }));

    await entitlements.consume(USER, 'tutor_messages_per_day');
    await entitlements.consume(USER, 'tutor_messages_per_day', 2);
    expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(0);

    const error = await entitlements.consume(USER, 'tutor_messages_per_day').catch((e) => e);
    expect(error).toBeInstanceOf(LimitExceededError);
    expect(error).toMatchObject({
      name: 'LimitExceededError',
      limitKey: 'tutor_messages_per_day',
      limit: 3,
      used: 3,
      requested: 1,
    });
  });

  it('an amount larger than what is left throws and records nothing', async () => {
    const { entitlements } = setup();
    await entitlements.consume(USER, 'speech_minutes_per_day', 28);

    await expect(entitlements.consume(USER, 'speech_minutes_per_day', 3)).rejects.toBeInstanceOf(
      LimitExceededError,
    );
    expect(await entitlements.remaining(USER, 'speech_minutes_per_day')).toBe(2);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'an amount of %s is rejected and records nothing',
    async (amount) => {
      const { entitlements } = setup();

      await expect(
        entitlements.consume(USER, 'tutor_messages_per_day', amount),
      ).rejects.toBeInstanceOf(RangeError);
      expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(200);
    },
  );

  it('a new day resets the count', async () => {
    const { clock, store, entitlements } = setup('2026-11-05T23:59:00.000Z');
    await store.upsertEntitlement(row({ limits: { writing_grades_per_day: 2 } }));
    await entitlements.consume(USER, 'writing_grades_per_day', 2);
    await expect(entitlements.consume(USER, 'writing_grades_per_day')).rejects.toBeInstanceOf(
      LimitExceededError,
    );

    clock.current = new Date('2026-11-06T00:01:00.000Z');

    expect(await entitlements.remaining(USER, 'writing_grades_per_day')).toBe(2);
    await expect(entitlements.consume(USER, 'writing_grades_per_day')).resolves.toBeUndefined();
  });

  it('an injected dayKeyFor decides which day a use counts toward', async () => {
    const store = createInMemoryEntitlementStore();
    const dayKeyFor = vi.fn(async (userId: string) => `local-day-of-${userId}`);
    const entitlements = createEntitlements({
      store,
      bus: createEventBus(),
      now: () => new Date(START),
      dayKeyFor,
    });

    await entitlements.consume(USER, 'tutor_messages_per_day', 4);

    expect(dayKeyFor).toHaveBeenCalledWith(USER, new Date(START));
    expect(await store.usedToday(USER, 'tutor_messages_per_day', `local-day-of-${USER}`)).toBe(4);
    expect(await store.usedToday(USER, 'tutor_messages_per_day', '2026-11-05')).toBe(0);
  });
});

describe('flag', () => {
  it('an unknown key is off', async () => {
    const { entitlements } = setup();
    expect(await entitlements.flag('nope', USER)).toBe(false);
    expect(await entitlements.flag('nope')).toBe(false);
  });

  it('rule 1: a disabled flag is off, even for an allow listed user', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({ key: 'payments_enabled', enabled: false, rules: { allow: [USER] } });

    expect(await entitlements.flag('payments_enabled', USER)).toBe(false);
    expect(await entitlements.flag('payments_enabled')).toBe(false);
  });

  it('rule 2: a denied user is off, even when also allow listed', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({ key: 'f', enabled: true, rules: { deny: [USER], allow: [USER] } });

    expect(await entitlements.flag('f', USER)).toBe(false);
    expect(await entitlements.flag('f', OTHER)).toBe(true);
  });

  it('rule 3: an allow listed user is on and skips every later rule', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({
      key: 'f',
      enabled: true,
      rules: { allow: [USER], plans: ['pro'], min_level: 'C1', percent: 0 },
    });

    expect(await entitlements.flag('f', USER)).toBe(true);
    expect(await entitlements.flag('f', OTHER, { level: 'C2' })).toBe(false);
  });

  it('rule 4: a plan list keeps out users whose plan is not in it', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({ key: 'dutch_pack', enabled: true, rules: { plans: ['pro'] } });
    await store.upsertEntitlement(row({ userId: OTHER, plan: 'pro', source: 'manual' }));

    expect(await entitlements.flag('dutch_pack', USER)).toBe(false);
    expect(await entitlements.flag('dutch_pack', OTHER)).toBe(true);
  });

  it.each([
    { level: undefined, expected: false },
    { level: 'A1', expected: false },
    { level: 'B1', expected: false },
    { level: 'B2', expected: true },
    { level: 'C2', expected: true },
  ] as const)(
    'rule 5: min_level B2 with level $level gives $expected',
    async ({ level, expected }) => {
      const { store, entitlements } = setup();
      await store.setFlag({ key: 'exam_sim_c1', enabled: true, rules: { min_level: 'B2' } });

      expect(await entitlements.flag('exam_sim_c1', USER, { level })).toBe(expected);
    },
  );

  it('rule 5: a level gate with no ctx at all is off', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({ key: 'exam_sim_c1', enabled: true, rules: { min_level: 'B2' } });

    expect(await entitlements.flag('exam_sim_c1', USER)).toBe(false);
  });

  it('rule 6: percent uses a stable 32 bit hash of key plus user id', async () => {
    // FNV-1a 32 bit of "foobar" is 0xbf9cf968, which is 3214735720, so the bucket is 20.
    const { store, entitlements } = setup();

    await store.setFlag({ key: 'foo', enabled: true, rules: { percent: 20 } });
    expect(await entitlements.flag('foo', 'bar')).toBe(false);

    await store.setFlag({ key: 'foo', enabled: true, rules: { percent: 21 } });
    expect(await entitlements.flag('foo', 'bar')).toBe(true);
  });

  it('rule 6: percent 0 is nobody and percent 100 is everybody', async () => {
    const { store, entitlements } = setup();
    const users = Array.from({ length: 50 }, (_, i) => `u${i}`);

    await store.setFlag({ key: 'rollout', enabled: true, rules: { percent: 0 } });
    for (const user of users) expect(await entitlements.flag('rollout', user)).toBe(false);

    await store.setFlag({ key: 'rollout', enabled: true, rules: { percent: 100 } });
    for (const user of users) expect(await entitlements.flag('rollout', user)).toBe(true);
  });

  it('rule 6: a user who is in stays in when the percent grows', async () => {
    const { store, entitlements } = setup();
    const users = Array.from({ length: 300 }, (_, i) => `u${i}`);

    await store.setFlag({ key: 'voice_tutor', enabled: true, rules: { percent: 20 } });
    const inAt20: string[] = [];
    for (const user of users) if (await entitlements.flag('voice_tutor', user)) inAt20.push(user);

    await store.setFlag({ key: 'voice_tutor', enabled: true, rules: { percent: 60 } });
    const inAt60: string[] = [];
    for (const user of users) if (await entitlements.flag('voice_tutor', user)) inAt60.push(user);

    // Roughly a fifth, then roughly three fifths, and nobody dropped out.
    expect(inAt20.length).toBeGreaterThan(30);
    expect(inAt20.length).toBeLessThan(90);
    expect(inAt60.length).toBeGreaterThan(inAt20.length);
    expect(inAt60).toEqual(expect.arrayContaining(inAt20));
  });

  it('rule 7: an enabled flag with no rules is on', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({ key: 'f', enabled: true, rules: {} });

    expect(await entitlements.flag('f', USER)).toBe(true);
  });

  it('without a user id only the enabled switch applies', async () => {
    const { store, entitlements } = setup();
    await store.setFlag({
      key: 'f',
      enabled: true,
      rules: { plans: ['pro'], min_level: 'C2', percent: 0 },
    });

    expect(await entitlements.flag('f')).toBe(true);
  });
});

describe('setPlan', () => {
  it('upserts the row and emits entitlement.changed', async () => {
    const { clock, store, bus, entitlements } = setup();
    const changed = vi.fn(async () => {});
    bus.on('entitlement.changed', changed);
    clock.current = new Date('2026-11-06T08:00:00.000Z');

    const saved = await entitlements.setPlan(USER, 'pro', 'manual');

    expect(saved).toEqual({
      userId: USER,
      plan: 'pro',
      features: {},
      limits: {},
      source: 'manual',
      expiresAt: null,
      updatedAt: '2026-11-06T08:00:00.000Z',
    });
    expect(await store.getEntitlement(USER)).toEqual(saved);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith({ userId: USER, plan: 'pro' });
  });

  it('the new plan decides features and limits', async () => {
    const { entitlements } = setup();

    await entitlements.setPlan(USER, 'free', 'manual');

    expect(await entitlements.can(USER, 'exam_sim')).toBe(false);
    expect(await entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(10);
  });

  it('keeps the per user overrides already on the row', async () => {
    const { store, entitlements } = setup();
    await store.upsertEntitlement(
      row({ features: { speech: false }, limits: { writing_grades_per_day: 7 } }),
    );

    const saved = await entitlements.setPlan(USER, 'plus', 'manual');

    expect(saved.features).toEqual({ speech: false });
    expect(saved.limits).toEqual({ writing_grades_per_day: 7 });
  });
});

describe('expiry', () => {
  it.each(['free_beta', 'pro'] satisfies PlanId[])(
    'an expired %s row falls back to free_beta',
    async (plan) => {
      const { store, bus, entitlements } = setup();
      const changed = vi.fn(async () => {});
      bus.on('entitlement.changed', changed);
      await store.upsertEntitlement(
        row({
          plan,
          source: 'manual',
          limits: { tutor_messages_per_day: 5 },
          expiresAt: '2026-11-05T09:59:59.000Z',
        }),
      );

      const entitlement = await entitlements.plan(USER);

      expect(entitlement).toEqual({
        userId: USER,
        plan: 'free_beta',
        features: {},
        limits: { tutor_messages_per_day: 5 },
        source: 'default',
        expiresAt: null,
        updatedAt: START,
      });
      expect(await store.getEntitlement(USER)).toEqual(entitlement);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenCalledWith({ userId: USER, plan: 'free_beta' });
    },
  );

  it('the fallback is written once, so a second read does not emit again', async () => {
    const { store, bus, entitlements } = setup();
    const changed = vi.fn(async () => {});
    bus.on('entitlement.changed', changed);
    await store.upsertEntitlement(row({ plan: 'free', expiresAt: '2026-11-01T00:00:00.000Z' }));

    expect(await entitlements.can(USER, 'exam_sim')).toBe(true);
    expect(await entitlements.can(USER, 'levels_above_b1')).toBe(true);

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('a row that expires in the future keeps its plan', async () => {
    const { store, bus, entitlements } = setup();
    const changed = vi.fn(async () => {});
    bus.on('entitlement.changed', changed);
    const stored = row({ plan: 'free', source: 'manual', expiresAt: '2026-12-01T00:00:00.000Z' });
    await store.upsertEntitlement(stored);

    expect(await entitlements.plan(USER)).toEqual(stored);
    expect(await entitlements.can(USER, 'exam_sim')).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('in memory store', () => {
  it('hands out copies, so changing a returned row does not change the store', async () => {
    const { store, entitlements } = setup();
    const first = await entitlements.plan(USER);
    first.features.tutor = false;
    first.plan = 'free';

    expect(await entitlements.can(USER, 'tutor')).toBe(true);
    expect((await store.getEntitlement(USER))?.plan).toBe('free_beta');
  });

  it('two services built from two stores share nothing', async () => {
    const a = setup();
    const b = setup();

    await a.entitlements.consume(USER, 'tutor_messages_per_day', 50);

    expect(await b.entitlements.remaining(USER, 'tutor_messages_per_day')).toBe(200);
  });
});
