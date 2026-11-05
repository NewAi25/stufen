// Behaviour of the analytics sink (P0-19). Acceptance check from
// docs/07-build-sequence.md: emitting `user.signed_up` on the bus produces one
// stored event row with that name.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import { createAnalytics, createInMemoryEventStore } from '../src/index';
import type { AnalyticsEvent, EventStore } from '../src/index';

const FIXED_NOW = new Date('2026-11-05T10:00:00.000Z');

/** Analytics on an in memory store with a fixed clock and ids e1, e2, e3. */
function setup(extra: { sampleRate?: number; random?: () => number } = {}) {
  const store = createInMemoryEventStore();
  let n = 0;
  const analytics = createAnalytics({
    store,
    now: () => FIXED_NOW,
    newId: () => `e${++n}`,
    ...extra,
  });
  return { store, analytics };
}

function failingStore(): EventStore {
  return {
    insert: async () => {
      throw new Error('store down');
    },
    list: async () => [],
    count: async () => 0,
  };
}

describe('attach', () => {
  it('emitting user.signed_up stores one event row with that name', async () => {
    const { store, analytics } = setup();
    const bus = createEventBus();
    analytics.attach(bus);

    await bus.emit('user.signed_up', { userId: 'u1' });

    const rows = await store.list();
    expect(rows).toEqual<AnalyticsEvent[]>([
      {
        id: 'e1',
        userId: 'u1',
        name: 'user.signed_up',
        props: {},
        createdAt: '2026-11-05T10:00:00.000Z',
      },
    ]);
    expect(await store.count('user.signed_up')).toBe(1);
  });

  it('stores a null user id when the payload has no userId', async () => {
    const { store, analytics } = setup();
    const bus = createEventBus();
    analytics.attach(bus);

    await bus.emit('content.pack_installed', { language: 'de', version: '1.0.0' });

    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.props).toEqual({ language: 'de', version: '1.0.0' });
  });

  it('keeps the payload as props without the userId key', async () => {
    const { store, analytics } = setup();
    const bus = createEventBus();
    analytics.attach(bus);

    await bus.emit('lesson.completed', { userId: 'u1', lessonId: 'l1', score: 0.8 });

    const rows = await store.list();
    expect(rows[0]?.userId).toBe('u1');
    expect(rows[0]?.props).toEqual({ lessonId: 'l1', score: 0.8 });
    expect(rows[0]?.props).not.toHaveProperty('userId');
  });

  it('does not change the payload the other subscribers receive', async () => {
    const { analytics } = setup();
    const bus = createEventBus();
    analytics.attach(bus);
    const payload = { userId: 'u1', lessonId: 'l1', score: 0.8 };

    await bus.emit('lesson.completed', payload);

    expect(payload).toEqual({ userId: 'u1', lessonId: 'l1', score: 0.8 });
  });

  it('writes one row per event, for every event name', async () => {
    const { store, analytics } = setup();
    const bus = createEventBus();
    analytics.attach(bus);

    await bus.emit('user.signed_up', { userId: 'u1' });
    await bus.emit('lesson.completed', { userId: 'u1', lessonId: 'l1', score: 1 });
    await bus.emit('feedback.submitted', { feedbackId: 'f1', kind: 'bug' });

    expect(await store.count()).toBe(3);
    expect((await store.list()).map((row) => row.name)).toEqual([
      'user.signed_up',
      'lesson.completed',
      'feedback.submitted',
    ]);
  });

  it('unsubscribe stops writes', async () => {
    const { store, analytics } = setup();
    const bus = createEventBus();
    const detach = analytics.attach(bus);

    await bus.emit('user.signed_up', { userId: 'u1' });
    detach();
    await bus.emit('user.signed_up', { userId: 'u2' });

    expect(await store.count()).toBe(1);
    expect(bus.listenerCount()).toBe(0);
  });

  it('a failing store does not break emit and calls onError', async () => {
    const busError = vi.fn();
    const onError = vi.fn();
    const bus = createEventBus({ onError: busError });
    const other = vi.fn(async () => {});
    bus.on('user.signed_up', other);
    createAnalytics({ store: failingStore(), onError }).attach(bus);

    await expect(bus.emit('user.signed_up', { userId: 'u1' })).resolves.toBeUndefined();

    expect(other).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'user.signed_up');
    expect(busError).not.toHaveBeenCalled();
  });

  it('an onError that throws still does not reach the bus', async () => {
    const busError = vi.fn();
    const bus = createEventBus({ onError: busError });
    createAnalytics({
      store: failingStore(),
      onError: () => {
        throw new Error('reporter down');
      },
    }).attach(bus);

    await expect(bus.emit('user.signed_up', { userId: 'u1' })).resolves.toBeUndefined();

    expect(busError).not.toHaveBeenCalled();
  });

  it('without onError a store failure goes to console.error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus();
    createAnalytics({ store: failingStore() }).attach(bus);

    await bus.emit('user.signed_up', { userId: 'u1' });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[0]).toContain('user.signed_up');
    consoleError.mockRestore();
  });
});

describe('track', () => {
  it('stores a row with the user, name and props', async () => {
    const { store, analytics } = setup();

    await analytics.track('u1', 'page.viewed', { page: '/learn' });
    await analytics.track(null, 'page.viewed');

    expect(await store.list()).toEqual<AnalyticsEvent[]>([
      {
        id: 'e1',
        userId: 'u1',
        name: 'page.viewed',
        props: { page: '/learn' },
        createdAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'e2',
        userId: null,
        name: 'page.viewed',
        props: {},
        createdAt: '2026-11-05T10:00:00.000Z',
      },
    ]);
  });

  it.each([
    ['empty', ''],
    ['longer than 100 characters', 'a'.repeat(101)],
    ['uppercase', 'Page.Viewed'],
    ['space', 'page viewed'],
    ['hyphen', 'page-viewed'],
    ['colon', 'page:viewed'],
  ])('rejects a name that is %s and stores nothing', async (_label, name) => {
    const { store, analytics } = setup();

    await expect(analytics.track('u1', name)).rejects.toThrow(/event name/i);

    expect(await store.count()).toBe(0);
  });

  it.each([
    ['letters, dot and underscore', 'lesson.step_done'],
    ['digits', 'level_2.reached'],
    ['exactly 100 characters', 'a'.repeat(100)],
  ])('accepts a name with %s', async (_label, name) => {
    const { store, analytics } = setup();

    await analytics.track('u1', name);

    expect(await store.count(name)).toBe(1);
  });

  it('rejects when the store fails', async () => {
    const analytics = createAnalytics({ store: failingStore() });

    await expect(analytics.track('u1', 'page.viewed')).rejects.toThrow('store down');
  });
});

describe('sampleRate', () => {
  it('0 stores nothing, from the bus or from track', async () => {
    const { store, analytics } = setup({ sampleRate: 0, random: () => 0 });
    const bus = createEventBus();
    analytics.attach(bus);

    await bus.emit('user.signed_up', { userId: 'u1' });
    await analytics.track('u1', 'page.viewed');

    expect(await store.count()).toBe(0);
  });

  it('1 is the default and stores everything without drawing', async () => {
    const random = vi.fn(() => 0.999);
    const { store, analytics } = setup({ random });
    const bus = createEventBus();
    analytics.attach(bus);

    await bus.emit('user.signed_up', { userId: 'u1' });

    expect(await store.count()).toBe(1);
    expect(random).not.toHaveBeenCalled();
  });

  it('keeps an event when the draw is below the rate and drops it otherwise', async () => {
    const draws = [0.1, 0.5, 0.49, 0.9];
    const { store, analytics } = setup({ sampleRate: 0.5, random: () => draws.shift() ?? 1 });

    await analytics.track('u1', 'kept.first');
    await analytics.track('u1', 'dropped.at_rate');
    await analytics.track('u1', 'kept.second');
    await analytics.track('u1', 'dropped.above');

    expect((await store.list()).map((row) => row.name)).toEqual(['kept.first', 'kept.second']);
  });

  it.each([[-0.1], [1.1], [Number.NaN]])('rejects a rate of %s', (sampleRate) => {
    expect(() => createAnalytics({ store: createInMemoryEventStore(), sampleRate })).toThrow(
      RangeError,
    );
  });
});

describe('createInMemoryEventStore', () => {
  async function seeded(): Promise<EventStore> {
    const store = createInMemoryEventStore();
    await store.insert({
      id: 'a',
      userId: 'u1',
      name: 'user.signed_up',
      props: {},
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    await store.insert({
      id: 'b',
      userId: 'u2',
      name: 'lesson.completed',
      props: { lessonId: 'l1' },
      createdAt: '2026-11-03T00:00:00.000Z',
    });
    await store.insert({
      id: 'c',
      userId: null,
      name: 'lesson.completed',
      props: {},
      createdAt: '2026-11-05T00:00:00.000Z',
    });
    return store;
  }

  it('lists everything in insert order when there is no filter', async () => {
    const store = await seeded();
    expect((await store.list()).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by name, by user and by since, and combines them', async () => {
    const store = await seeded();
    const ids = async (filter: Parameters<EventStore['list']>[0]) =>
      (await store.list(filter)).map((row) => row.id);

    expect(await ids({ name: 'lesson.completed' })).toEqual(['b', 'c']);
    expect(await ids({ userId: 'u1' })).toEqual(['a']);
    expect(await ids({ userId: null })).toEqual(['c']);
    expect(await ids({ since: '2026-11-03T00:00:00.000Z' })).toEqual(['b', 'c']);
    expect(await ids({ name: 'lesson.completed', since: '2026-11-04T00:00:00.000Z' })).toEqual([
      'c',
    ]);
  });

  it('counts all rows or the rows with one name', async () => {
    const store = await seeded();
    expect(await store.count()).toBe(3);
    expect(await store.count('lesson.completed')).toBe(2);
    expect(await store.count('never.seen')).toBe(0);
  });

  it('hands out copies, so editing a listed row does not change the store', async () => {
    const store = await seeded();
    const [first] = await store.list();
    if (first) {
      first.name = 'changed';
      first.props.extra = true;
    }

    const [again] = await store.list();
    expect(again?.name).toBe('user.signed_up');
    expect(again?.props).toEqual({});
  });
});
