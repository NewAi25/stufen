// Behaviour of core-feedback (P0-20). Acceptance check from
// docs/07-build-sequence.md: `submit` without `userId` inserts a row and emits
// `feedback.submitted`. Everything runs in memory: no network, no filesystem.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { FeedbackItem } from '@stufen/contracts';
import { createFeedback, createInMemoryFeedbackStore, FeedbackValidationError } from '../src/index';
import { runFeedbackStoreContract } from './store-contract';

type SubmitInput = Parameters<ReturnType<typeof createFeedback>['submit']>[0];

const START = Date.parse('2026-11-05T10:00:00.000Z');

/** One service wired to a fresh store and bus, with a clock and ids the test controls. */
function setup() {
  const store = createInMemoryFeedbackStore();
  const bus = createEventBus();
  const submitted = vi.fn(async () => {});
  bus.on('feedback.submitted', submitted);

  let time = START;
  let lastId = 0;
  const feedback = createFeedback({
    store,
    bus,
    now: () => new Date(time),
    newId: () => `fb-${++lastId}`,
  });

  return {
    store,
    bus,
    submitted,
    feedback,
    /** Moves the injected clock forward. */
    advance(ms: number) {
      time += ms;
    },
  };
}

const valid: SubmitInput = {
  userId: 'user-1',
  kind: 'bug',
  page: '/learn/de/lesson/a1-01',
  message: 'The audio button does nothing.',
};

/** Builds an input that breaks the types on purpose, the way a browser could. */
function withOverride(override: Record<string, unknown>): SubmitInput {
  return { ...valid, ...override } as SubmitInput;
}

describe('submit', () => {
  it('acceptance: without a userId it inserts a row and emits feedback.submitted', async () => {
    const { feedback, store, submitted } = setup();

    await feedback.submit({ kind: 'idea', page: '/home', message: 'Add a dark theme.' });

    const rows = await store.listAll();
    expect(rows).toEqual<FeedbackItem[]>([
      {
        id: 'fb-1',
        userId: null,
        kind: 'idea',
        page: '/home',
        message: 'Add a dark theme.',
        rating: null,
        context: null,
        status: 'new',
        createdAt: '2026-11-05T10:00:00.000Z',
      },
    ]);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledWith({ feedbackId: 'fb-1', kind: 'idea' });
  });

  it('treats userId null and userId undefined as anonymous too', async () => {
    const { feedback, store, submitted } = setup();

    await feedback.submit({ ...valid, userId: null });
    await feedback.submit({ ...valid, userId: undefined });

    const rows = await store.listAll();
    expect(rows.map((row) => row.userId)).toEqual([null, null]);
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it('stores every field of a signed in submit and gives the row status new', async () => {
    const { feedback, store, submitted } = setup();

    await feedback.submit({
      userId: 'user-1',
      kind: 'rating',
      page: '/progress',
      message: 'Good so far.',
      rating: 4,
      context: { level: 'A1', lessonId: 'a1-01', viewport: { width: 390, height: 844 } },
    });

    expect(await store.listAll()).toEqual<FeedbackItem[]>([
      {
        id: 'fb-1',
        userId: 'user-1',
        kind: 'rating',
        page: '/progress',
        message: 'Good so far.',
        rating: 4,
        context: { level: 'A1', lessonId: 'a1-01', viewport: { width: 390, height: 844 } },
        status: 'new',
        createdAt: '2026-11-05T10:00:00.000Z',
      },
    ]);
    expect(submitted).toHaveBeenCalledWith({ feedbackId: 'fb-1', kind: 'rating' });
  });

  it('trims the message and the page, and stores a missing page as an empty string', async () => {
    const { feedback, store } = setup();

    await feedback.submit({ userId: 'user-1', kind: 'bug', message: '  Typo in unit 2.  ' });
    await feedback.submit({ ...valid, page: '  /review  ' });

    const [second, first] = await store.listAll();
    expect(first?.message).toBe('Typo in unit 2.');
    expect(first?.page).toBe('');
    expect(second?.page).toBe('/review');
  });

  it('stores a copy of the context, so later changes by the caller do not reach the row', async () => {
    const { feedback, store } = setup();
    const context = { browser: 'Firefox', tags: ['a'] };

    await feedback.submit({ ...valid, context });
    context.browser = 'changed';
    context.tags.push('b');

    const [row] = await store.listAll();
    expect(row?.context).toEqual({ browser: 'Firefox', tags: ['a'] });
  });

  it('works with the default clock and id source', async () => {
    const store = createInMemoryFeedbackStore();
    const feedback = createFeedback({ store, bus: createEventBus() });

    await feedback.submit(valid);
    await feedback.submit(valid);

    const rows = await store.listAll();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).not.toBe(rows[1]?.id);
    expect(rows[0]?.id).not.toBe('');
    expect(Number.isNaN(Date.parse(rows[0]?.createdAt ?? ''))).toBe(false);
  });
});

describe('submit validation', () => {
  const longContext = { a: 'x'.repeat(7993) }; // serialises to 8001 characters
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const rejected: Array<[rule: string, override: Record<string, unknown>, field: string]> = [
    ['kind is not a FeedbackKind', { kind: 'praise' }, 'kind'],
    ['kind is missing', { kind: undefined }, 'kind'],
    ['kind is an inherited object key', { kind: 'toString' }, 'kind'],
    ['message is empty', { message: '' }, 'message'],
    ['message is only whitespace', { message: '   \n ' }, 'message'],
    ['message is not a string', { message: 42 }, 'message'],
    ['message is longer than 4000 characters', { message: 'x'.repeat(4001) }, 'message'],
    ['rating is missing when kind is rating', { kind: 'rating' }, 'rating'],
    ['rating is null when kind is rating', { kind: 'rating', rating: null }, 'rating'],
    ['rating is below 1', { rating: 0 }, 'rating'],
    ['rating is above 5', { rating: 6 }, 'rating'],
    ['rating is not a whole number', { rating: 3.5 }, 'rating'],
    ['rating is not a number', { rating: '4' }, 'rating'],
    ['rating is NaN', { rating: Number.NaN }, 'rating'],
    ['page is longer than 300 characters', { page: `/${'p'.repeat(300)}` }, 'page'],
    ['page is not a string', { page: 7 }, 'page'],
    ['context serialises to more than 8000 characters', { context: longContext }, 'context'],
    ['context cannot be serialised', { context: circular }, 'context'],
    ['context is an array', { context: ['a'] }, 'context'],
    ['context is not an object', { context: 'browser=Firefox' }, 'context'],
    ['context serialises to something that is not an object', { context: new Date(0) }, 'context'],
    ['userId is an empty string', { userId: '' }, 'userId'],
    ['userId is only whitespace', { userId: '  ' }, 'userId'],
    ['userId is not a string', { userId: 12 }, 'userId'],
  ];

  it.each(rejected)('rejects when %s', async (_rule, override, field) => {
    const { feedback, store, submitted } = setup();

    const error: unknown = await feedback.submit(withOverride(override)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FeedbackValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'FeedbackValidationError', field });
    // A rejected submit leaves no trace.
    expect(await store.listAll()).toEqual([]);
    expect(submitted).not.toHaveBeenCalled();
  });

  const accepted: Array<[rule: string, override: Record<string, unknown>]> = [
    ['every FeedbackKind: bug', { kind: 'bug' }],
    ['every FeedbackKind: idea', { kind: 'idea' }],
    ['every FeedbackKind: confusing', { kind: 'confusing' }],
    ['every FeedbackKind: rating, with a rating', { kind: 'rating', rating: 3 }],
    ['every FeedbackKind: other', { kind: 'other' }],
    ['a message of exactly 4000 characters', { message: 'x'.repeat(4000) }],
    ['a message of one character', { message: 'x' }],
    ['a message of 4000 characters plus outer spaces', { message: ` ${'x'.repeat(4000)} ` }],
    ['rating 1', { rating: 1 }],
    ['rating 5', { rating: 5 }],
    ['no rating when kind is not rating', { rating: undefined }],
    ['a page of exactly 300 characters', { page: 'p'.repeat(300) }],
    ['a context of exactly 8000 characters', { context: { a: 'x'.repeat(7992) } }],
    ['an empty context', { context: {} }],
    ['a null context', { context: null }],
    // docs/06-ui-ux.md section 8: the message is required except when kind is rating.
    ['an empty message when kind is rating', { kind: 'rating', rating: 5, message: '' }],
  ];

  it.each(accepted)('accepts %s', async (_rule, override) => {
    const { feedback, store, submitted } = setup();

    await expect(feedback.submit(withOverride(override))).resolves.toBeUndefined();

    expect(await store.listAll()).toHaveLength(1);
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});

describe('listMine', () => {
  it('returns a signed in submit to the user who sent it', async () => {
    const { feedback } = setup();

    await feedback.submit(valid);

    const mine = await feedback.listMine('user-1');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id: 'fb-1',
      userId: 'user-1',
      message: 'The audio button does nothing.',
    });
  });

  it('returns only the rows of the user who asks', async () => {
    const { feedback } = setup();

    await feedback.submit({ ...valid, userId: 'user-1', message: 'From one.' });
    await feedback.submit({ ...valid, userId: 'user-2', message: 'From two.' });

    expect((await feedback.listMine('user-1')).map((row) => row.message)).toEqual(['From one.']);
    expect((await feedback.listMine('user-2')).map((row) => row.message)).toEqual(['From two.']);
    expect(await feedback.listMine('user-3')).toEqual([]);
  });

  it('never returns anonymous rows, whatever id is asked for', async () => {
    const { feedback, store } = setup();

    await feedback.submit({ kind: 'bug', message: 'Anonymous one.' });
    await feedback.submit({ ...valid, userId: null, message: 'Anonymous two.' });
    await feedback.submit({ ...valid, userId: 'user-1', message: 'Signed in.' });

    expect(await store.listAll()).toHaveLength(3);
    expect((await feedback.listMine('user-1')).map((row) => row.message)).toEqual(['Signed in.']);
    expect(await feedback.listMine('user-2')).toEqual([]);
    for (const probe of ['', '  ', 'null', 'undefined', null, undefined]) {
      expect(await feedback.listMine(probe as string)).toEqual([]);
    }
  });

  it('returns newest first, using the injected clock', async () => {
    const { feedback, advance } = setup();

    await feedback.submit({ ...valid, message: 'first' });
    advance(60_000);
    await feedback.submit({ ...valid, message: 'second' });
    advance(60_000);
    await feedback.submit({ ...valid, message: 'third' });

    const mine = await feedback.listMine('user-1');
    expect(mine.map((row) => row.message)).toEqual(['third', 'second', 'first']);
    expect(mine.map((row) => row.createdAt)).toEqual([
      '2026-11-05T10:02:00.000Z',
      '2026-11-05T10:01:00.000Z',
      '2026-11-05T10:00:00.000Z',
    ]);
  });

  it('orders by the clock, not by the order of the inserts', async () => {
    const { feedback, advance } = setup();

    await feedback.submit({ ...valid, message: 'written at ten' });
    advance(-3_600_000);
    await feedback.submit({ ...valid, message: 'written at nine' });

    const mine = await feedback.listMine('user-1');
    expect(mine.map((row) => row.message)).toEqual(['written at ten', 'written at nine']);
  });

  it('puts the later insert first when two rows share a timestamp', async () => {
    const { feedback } = setup();

    await feedback.submit({ ...valid, message: 'first' });
    await feedback.submit({ ...valid, message: 'second' });

    const mine = await feedback.listMine('user-1');
    expect(mine.map((row) => row.message)).toEqual(['second', 'first']);
  });
});

describe('setStatus', () => {
  it('changes the status and returns the updated row', async () => {
    const { feedback } = setup();
    await feedback.submit(valid);

    const updated = await feedback.setStatus('fb-1', 'planned');

    expect(updated).toMatchObject({ id: 'fb-1', status: 'planned' });
    expect((await feedback.listMine('user-1'))[0]?.status).toBe('planned');
  });

  it('accepts every FeedbackStatus', async () => {
    const { feedback } = setup();
    await feedback.submit(valid);

    for (const status of ['seen', 'planned', 'done', 'wontfix', 'new'] as const) {
      expect((await feedback.setStatus('fb-1', status))?.status).toBe(status);
    }
  });

  it('returns null for an unknown id', async () => {
    const { feedback } = setup();

    expect(await feedback.setStatus('missing', 'seen')).toBeNull();
  });

  it('rejects a status that is not a FeedbackStatus and leaves the row alone', async () => {
    const { feedback } = setup();
    await feedback.submit(valid);

    const error: unknown = await feedback
      .setStatus('fb-1', 'archived' as 'seen')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FeedbackValidationError);
    expect(error).toMatchObject({ field: 'status' });
    expect((await feedback.listMine('user-1'))[0]?.status).toBe('new');
  });

  it('does not emit feedback.submitted', async () => {
    const { feedback, submitted } = setup();
    await feedback.submit(valid);
    submitted.mockClear();

    await feedback.setStatus('fb-1', 'seen');

    expect(submitted).not.toHaveBeenCalled();
  });
});

describe('createInMemoryFeedbackStore', () => {
  const row: FeedbackItem = {
    id: 'a',
    userId: 'user-1',
    kind: 'bug',
    page: '/home',
    message: 'One.',
    rating: null,
    context: { level: 'A1' },
    status: 'new',
    createdAt: '2026-11-05T10:00:00.000Z',
  };

  it('rejects a second insert with the same id', async () => {
    const store = createInMemoryFeedbackStore();
    await store.insert(row);

    await expect(store.insert({ ...row, message: 'Again.' })).rejects.toThrow('already exists');
    expect(await store.listAll()).toHaveLength(1);
  });

  it('listAll includes anonymous rows and filters by status and kind', async () => {
    const store = createInMemoryFeedbackStore();
    await store.insert(row);
    await store.insert({ ...row, id: 'b', userId: null, kind: 'idea' });
    await store.insert({ ...row, id: 'c', userId: 'user-2', kind: 'idea' });
    await store.updateStatus('c', 'done');

    expect((await store.listAll()).map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect((await store.listAll({ kind: 'idea' })).map((item) => item.id)).toEqual(['c', 'b']);
    expect((await store.listAll({ status: 'new' })).map((item) => item.id)).toEqual(['b', 'a']);
    expect((await store.listAll({ kind: 'idea', status: 'done' })).map((item) => item.id)).toEqual([
      'c',
    ]);
    expect(await store.listAll({ kind: 'rating' })).toEqual([]);
  });

  it('listByUser never returns anonymous rows', async () => {
    const store = createInMemoryFeedbackStore();
    await store.insert({ ...row, id: 'anon', userId: null });
    await store.insert(row);

    expect((await store.listByUser('user-1')).map((item) => item.id)).toEqual(['a']);
    expect(await store.listByUser(null as unknown as string)).toEqual([]);
  });

  it('hands out copies, so changing a returned row does not change the store', async () => {
    const store = createInMemoryFeedbackStore();
    const mine = { ...row, context: { level: 'A1' } };
    await store.insert(mine);
    mine.message = 'changed after insert';

    const [read] = await store.listAll();
    if (!read) throw new Error('expected one row');
    read.status = 'done';
    read.context = { level: 'C2' };

    expect(await store.listAll()).toEqual([row]);
  });

  it('keeps two stores apart', async () => {
    const one = createInMemoryFeedbackStore();
    const two = createInMemoryFeedbackStore();
    await one.insert(row);

    expect(await two.listAll()).toEqual([]);
  });
});

// The behaviour shared with the Postgres adapter, see tests/store-contract.ts.
runFeedbackStoreContract('in memory', createInMemoryFeedbackStore, () => crypto.randomUUID());
