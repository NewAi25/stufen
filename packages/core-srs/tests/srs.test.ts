// Behaviour of core-srs (P1-14 and P1-15). Acceptance checks from
// docs/07-build-sequence.md: rating 1 then 3 then 3 moves a card from `new`
// to `review` and `due` moves forward; emitting `attempt.recorded` with one
// item id creates a card. Everything runs in memory with an injected clock.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { EventMap } from '@stufen/contracts';
import { CardNotFoundError, createInMemoryCardStore, createSrs } from '../src/index';
import type { CardStore, CreateSrsOptions, StoredReviewCard } from '../src/index';

const START = Date.parse('2026-11-06T10:00:00.000Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const USER = 'user-1';

/** One scheduler wired to a fresh store and bus, with a clock the test controls. */
function setup(overrides: Partial<CreateSrsOptions> = {}) {
  const store = overrides.store ?? createInMemoryCardStore();
  const bus = createEventBus({ onError: () => {} });
  const reviewed = vi.fn<(payload: EventMap['item.reviewed']) => Promise<void>>(async () => {});
  bus.on('item.reviewed', reviewed);
  const onError = vi.fn();

  let time = START;
  const srs = createSrs({ store, bus, now: () => new Date(time), onError, ...overrides });

  return {
    store,
    bus,
    reviewed,
    onError,
    srs,
    now: () => time,
    /** Moves the injected clock forward. */
    advance(ms: number) {
      time += ms;
    },
    /** Moves the injected clock to the moment a card comes due. */
    goTo(card: StoredReviewCard) {
      time = Date.parse(card.due);
    },
  };
}

function attempt(
  override: Partial<EventMap['attempt.recorded']> = {},
): EventMap['attempt.recorded'] {
  return {
    userId: USER,
    attemptId: 'attempt-1',
    exerciseType: 'cloze',
    correct: true,
    score: 1,
    candoIds: [],
    itemIds: ['item-1'],
    language: 'de',
    ...override,
  };
}

async function mustGet(store: CardStore, itemId: string): Promise<StoredReviewCard> {
  const card = await store.getCard(USER, itemId);
  if (!card) throw new Error(`expected a card for ${itemId}`);
  return card;
}

describe('introduceItems', () => {
  it('creates a new card that is due at once', async () => {
    const { srs, store } = setup();

    await srs.introduceItems(USER, 'de', ['item-1']);

    expect(await store.getCard(USER, 'item-1')).toEqual<StoredReviewCard>({
      userId: USER,
      itemId: 'item-1',
      language: 'de',
      stability: 0,
      difficulty: 0,
      due: new Date(START).toISOString(),
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new',
      scheduledDays: 0,
      learningSteps: 0,
    });
    const queue = await srs.dueQueue(USER, 'de');
    expect(queue.map((card) => card.itemId)).toEqual(['item-1']);
  });

  it('is idempotent: a second call leaves a reviewed card untouched', async () => {
    const { srs, store, advance } = setup();
    await srs.introduceItems(USER, 'de', ['item-1', 'item-1']);
    const afterReview = await srs.review(USER, 'item-1', 3);

    advance(5 * MINUTE);
    await srs.introduceItems(USER, 'de', ['item-1', 'item-2']);

    expect(await store.getCard(USER, 'item-1')).toEqual(afterReview);
    expect((await mustGet(store, 'item-2')).state).toBe('new');
    expect(await store.listLogs(USER, 'item-1')).toHaveLength(1);
  });
});

describe('review', () => {
  it('acceptance: rating 1 then 3 then 3 moves a card from new to review and due moves forward', async () => {
    const { srs, goTo } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);

    const first = await srs.review(USER, 'item-1', 1);
    goTo(first);
    const second = await srs.review(USER, 'item-1', 3);
    goTo(second);
    const third = await srs.review(USER, 'item-1', 3);

    expect([first.state, second.state, third.state]).toEqual(['learning', 'learning', 'review']);
    expect(Date.parse(first.due)).toBeGreaterThan(START);
    expect(Date.parse(second.due)).toBeGreaterThan(Date.parse(first.due));
    expect(Date.parse(third.due)).toBeGreaterThan(Date.parse(second.due));
    expect(third.reps).toBe(3);
  });

  it('good moves the due date forward and a second good moves it further', async () => {
    const { srs, goTo, now } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);

    const first = await srs.review(USER, 'item-1', 3);
    const firstGap = Date.parse(first.due) - now();
    goTo(first);
    const second = await srs.review(USER, 'item-1', 3);
    const secondGap = Date.parse(second.due) - now();

    expect(firstGap).toBeGreaterThan(0);
    expect(secondGap).toBeGreaterThan(firstGap);
    expect(secondGap).toBeGreaterThanOrEqual(DAY);
    expect(second.state).toBe('review');
    expect(second.lastReview).toBe(new Date(now()).toISOString());
  });

  it('again brings a review card back soon and counts a lapse', async () => {
    const { srs, goTo, now } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);
    goTo(await srs.review(USER, 'item-1', 3));
    const mature = await srs.review(USER, 'item-1', 3);
    expect(mature.lapses).toBe(0);
    goTo(mature);

    const lapsed = await srs.review(USER, 'item-1', 1);

    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(Date.parse(lapsed.due) - now()).toBeLessThanOrEqual(60 * MINUTE);
    expect(lapsed.stability).toBeLessThan(mature.stability);
  });

  it('writes a review log with elapsed days, scheduled days and the state before', async () => {
    const { srs, store, goTo, advance } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);
    goTo(await srs.review(USER, 'item-1', 3));
    const inReview = await srs.review(USER, 'item-1', 3);
    goTo(inReview);
    advance(DAY); // one day late
    await srs.review(USER, 'item-1', 2);

    const logs = await store.listLogs(USER, 'item-1');

    expect(logs.map((log) => [log.rating, log.stateBefore])).toEqual([
      [3, 'new'],
      [3, 'learning'],
      [2, 'review'],
    ]);
    expect(logs[0]).toMatchObject({ elapsedDays: 0, scheduledDays: 0 });
    expect(logs[0]?.reviewedAt).toBe(new Date(START).toISOString());
    expect(logs[2]?.scheduledDays).toBe(inReview.scheduledDays);
    expect(logs[2]?.elapsedDays).toBeCloseTo(inReview.scheduledDays + 1, 5);
  });

  it('throws CardNotFoundError for a card that was never introduced', async () => {
    const { srs, store, reviewed } = setup();

    const failure = srs.review(USER, 'missing', 3);

    await expect(failure).rejects.toBeInstanceOf(CardNotFoundError);
    await expect(failure).rejects.toMatchObject({ userId: USER, itemId: 'missing' });
    expect(await store.getCard(USER, 'missing')).toBeNull();
    expect(reviewed).not.toHaveBeenCalled();
  });

  it('rejects a rating outside 1 to 4 and stores nothing', async () => {
    const { srs, store } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);

    await expect(srs.review(USER, 'item-1', 5 as 4)).rejects.toBeInstanceOf(RangeError);
    expect(await store.listLogs(USER, 'item-1')).toEqual([]);
  });

  it('emits item.reviewed with the user, the item and the rating', async () => {
    const { srs, reviewed } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);

    await srs.review(USER, 'item-1', 4);

    expect(reviewed).toHaveBeenCalledTimes(1);
    expect(reviewed).toHaveBeenCalledWith({ userId: USER, itemId: 'item-1', rating: 4 });
  });
});

describe('dueQueue', () => {
  it('returns due cards oldest due date first and respects the limit', async () => {
    const { srs, advance } = setup();
    await srs.introduceItems(USER, 'de', ['item-b']);
    advance(MINUTE);
    await srs.introduceItems(USER, 'de', ['item-a']);
    advance(MINUTE);
    await srs.introduceItems(USER, 'de', ['item-d', 'item-c']);

    const all = await srs.dueQueue(USER, 'de');
    const firstTwo = await srs.dueQueue(USER, 'de', 2);

    // item-c and item-d share a due date, so they come back in id order.
    expect(all.map((card) => card.itemId)).toEqual(['item-b', 'item-a', 'item-c', 'item-d']);
    expect(firstTwo.map((card) => card.itemId)).toEqual(['item-b', 'item-a']);
    expect(await srs.dueQueue(USER, 'de', 0)).toEqual([]);
  });

  it('defaults to a limit of 20', async () => {
    const { srs } = setup();
    const ids = Array.from({ length: 25 }, (_, i) => `item-${String(i).padStart(2, '0')}`);
    await srs.introduceItems(USER, 'de', ids);

    expect(await srs.dueQueue(USER, 'de')).toHaveLength(20);
    expect(await srs.dueQueue(USER, 'de', 30)).toHaveLength(25);
  });

  it('leaves out a card until its due date arrives', async () => {
    const { srs, goTo, advance } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);
    const reviewedCard = await srs.review(USER, 'item-1', 3);

    expect(await srs.dueQueue(USER, 'de')).toEqual([]);
    goTo(reviewedCard);
    advance(-1);
    expect(await srs.dueQueue(USER, 'de')).toEqual([]);
    advance(1);
    expect(await srs.dueQueue(USER, 'de')).toEqual([reviewedCard]);
  });

  it('keeps languages and users apart', async () => {
    const { srs } = setup();
    await srs.introduceItems(USER, 'de', ['de-1', 'de-2']);
    await srs.introduceItems(USER, 'nl', ['nl-1']);
    await srs.introduceItems('user-2', 'de', ['de-3']);

    expect((await srs.dueQueue(USER, 'de')).map((card) => card.itemId)).toEqual(['de-1', 'de-2']);
    expect((await srs.dueQueue(USER, 'nl')).map((card) => card.itemId)).toEqual(['nl-1']);
    expect((await srs.dueQueue(USER, 'fr')).map((card) => card.itemId)).toEqual([]);
    expect((await srs.dueQueue('user-2', 'de')).map((card) => card.itemId)).toEqual(['de-3']);
  });
});

describe('stats', () => {
  it('counts due, learning and mature cards for one language', async () => {
    const { srs, store, now } = setup();
    const inFuture = new Date(now() + 30 * DAY).toISOString();
    const reviewCard = (itemId: string, stability: number): StoredReviewCard => ({
      userId: USER,
      itemId,
      language: 'de',
      stability,
      difficulty: 5,
      due: inFuture,
      lastReview: new Date(now() - DAY).toISOString(),
      reps: 6,
      lapses: 0,
      state: 'review',
      scheduledDays: 31,
      learningSteps: 0,
    });
    await store.upsertCard(reviewCard('mature-at-21', 21));
    await store.upsertCard(reviewCard('mature-at-40', 40));
    await store.upsertCard(reviewCard('young-at-20.9', 20.9));
    await store.upsertCard({ ...reviewCard('relearning', 3), state: 'relearning' });
    await store.upsertCard({ ...reviewCard('other-language', 40), language: 'nl' });
    await srs.introduceItems(USER, 'de', ['new-1', 'new-2', 'learning-1']);
    await srs.review(USER, 'learning-1', 3);

    expect(await srs.stats(USER, 'de')).toEqual({ due: 2, learning: 2, mature: 2 });
    expect(await srs.stats(USER, 'nl')).toEqual({ due: 0, learning: 0, mature: 1 });
    expect(await srs.stats(USER, 'fr')).toEqual({ due: 0, learning: 0, mature: 0 });
  });
});

describe('attempt.recorded subscription', () => {
  it('acceptance: an attempt with one item id creates a card and rates it', async () => {
    const { srs, bus, store, reviewed } = setup();
    srs.attach();

    await bus.emit('attempt.recorded', attempt({ itemIds: ['item-1'], language: 'nl' }));

    const card = await mustGet(store, 'item-1');
    expect(card).toMatchObject({ language: 'nl', state: 'learning', reps: 1 });
    expect(Date.parse(card.due)).toBeGreaterThan(START);
    expect(await store.listLogs(USER, 'item-1')).toMatchObject([{ rating: 3, stateBefore: 'new' }]);
    expect(reviewed).toHaveBeenCalledWith({ userId: USER, itemId: 'item-1', rating: 3 });
  });

  it.each([
    { correct: true, score: 1, rating: 3 },
    { correct: true, score: 0.9, rating: 3 },
    { correct: true, score: 0.89, rating: 2 },
    { correct: true, score: 0, rating: 2 },
    { correct: false, score: 0.95, rating: 1 },
    { correct: false, score: 0, rating: 1 },
  ])('correct $correct with score $score rates $rating', async ({ correct, score, rating }) => {
    const { srs, bus, store } = setup();
    srs.attach();

    await bus.emit('attempt.recorded', attempt({ correct, score }));

    expect((await store.listLogs(USER, 'item-1')).map((log) => log.rating)).toEqual([rating]);
  });

  it('rates every item of the attempt once and reuses existing cards', async () => {
    const { srs, bus, store, advance } = setup();
    srs.attach();
    await srs.introduceItems(USER, 'de', ['item-1']);
    await srs.review(USER, 'item-1', 3);
    advance(10 * MINUTE);

    await bus.emit('attempt.recorded', attempt({ itemIds: ['item-1', 'item-2', 'item-2'] }));

    expect((await mustGet(store, 'item-1')).reps).toBe(2);
    expect(await store.listLogs(USER, 'item-1')).toHaveLength(2);
    expect((await mustGet(store, 'item-2')).reps).toBe(1);
    expect(await store.listLogs(USER, 'item-2')).toHaveLength(1);
  });

  it('skips the rating for flashcard attempts but still introduces the item', async () => {
    const { srs, bus, store, reviewed } = setup();
    srs.attach();
    await srs.introduceItems(USER, 'de', ['item-1']);
    const afterReview = await srs.review(USER, 'item-1', 3);
    reviewed.mockClear();

    await bus.emit(
      'attempt.recorded',
      attempt({ exerciseType: 'flashcard', itemIds: ['item-1', 'item-2'] }),
    );

    expect(await store.getCard(USER, 'item-1')).toEqual(afterReview);
    expect(await store.listLogs(USER, 'item-1')).toHaveLength(1);
    expect(await mustGet(store, 'item-2')).toMatchObject({ state: 'new', reps: 0 });
    expect(await store.listLogs(USER, 'item-2')).toEqual([]);
    expect(reviewed).not.toHaveBeenCalled();
  });

  it('does nothing before attach and nothing after unsubscribe', async () => {
    const { srs, bus, store } = setup();

    await bus.emit('attempt.recorded', attempt({ itemIds: ['before'] }));
    const unsubscribe = srs.attach();
    await bus.emit('attempt.recorded', attempt({ itemIds: ['during'] }));
    unsubscribe();
    await bus.emit('attempt.recorded', attempt({ itemIds: ['after'] }));

    expect(await store.getCard(USER, 'before')).toBeNull();
    expect(await store.getCard(USER, 'during')).not.toBeNull();
    expect(await store.getCard(USER, 'after')).toBeNull();
  });

  it('attaches to another bus when one is passed', async () => {
    const { srs, store } = setup();
    const otherBus = createEventBus();
    srs.attach(otherBus);

    await otherBus.emit('attempt.recorded', attempt());

    expect(await store.getCard(USER, 'item-1')).not.toBeNull();
  });
});

describe('failures inside the attempt.recorded handler', () => {
  /** A store whose writes fail for one item id. */
  function storeFailingOn(itemId: string): CardStore {
    const inner = createInMemoryCardStore();
    return {
      ...inner,
      async upsertCard(card) {
        if (card.itemId === itemId) throw new Error('disk on fire');
        await inner.upsertCard(card);
      },
    };
  }

  it('a store failure does not break emit, is reported, and other items still update', async () => {
    const busErrors = vi.fn();
    const bus = createEventBus({ onError: busErrors });
    const { srs, store, onError } = setup({ store: storeFailingOn('bad'), bus });
    const otherListener = vi.fn(async () => {});
    bus.on('attempt.recorded', otherListener);
    srs.attach();

    const emitted = bus.emit('attempt.recorded', attempt({ itemIds: ['bad', 'good'] }));

    await expect(emitted).resolves.toBeUndefined();
    expect(otherListener).toHaveBeenCalledTimes(1);
    // Caught inside core-srs, so the bus never sees a failed handler.
    expect(busErrors).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk on fire' }), {
      userId: USER,
      attemptId: 'attempt-1',
      itemId: 'bad',
    });
    expect(await store.getCard(USER, 'bad')).toBeNull();
    expect((await mustGet(store, 'good')).reps).toBe(1);
  });

  it('an onError that throws is swallowed too', async () => {
    const busErrors = vi.fn();
    const bus = createEventBus({ onError: busErrors });
    const onError = vi.fn(() => {
      throw new Error('reporter broke');
    });
    const { srs } = setup({ store: storeFailingOn('bad'), bus, onError });
    srs.attach();

    await expect(
      bus.emit('attempt.recorded', attempt({ itemIds: ['bad'] })),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(busErrors).not.toHaveBeenCalled();
  });
});

describe('in memory card store', () => {
  it('copies cards on the way in and on the way out', async () => {
    const { srs, store } = setup();
    await srs.introduceItems(USER, 'de', ['item-1']);

    const held = await mustGet(store, 'item-1');
    held.reps = 99;
    const [queued] = await srs.dueQueue(USER, 'de');
    if (queued) queued.reps = 77;

    expect((await mustGet(store, 'item-1')).reps).toBe(0);
  });

  it('upsert replaces the card with the same user and item', async () => {
    const store = createInMemoryCardStore();
    const { srs } = setup({ store });
    await srs.introduceItems(USER, 'de', ['item-1']);
    const card = await mustGet(store, 'item-1');

    await store.upsertCard({ ...card, reps: 4 });

    expect((await mustGet(store, 'item-1')).reps).toBe(4);
    expect(await store.countByState(USER, 'de', new Date(START))).toEqual({
      due: 1,
      byState: { new: 1, learning: 0, review: 0, relearning: 0 },
      mature: 0,
    });
  });
});
