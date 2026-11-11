// The behaviour every CardStore adapter must show, written against the port
// only. Not a test file itself: store-contract.memory.test.ts runs it for the
// in memory store and postgres-store.integration.test.ts for Postgres.
//
// One thing is shaped by Postgres on purpose: ids come from the harness.
// Postgres needs a real user with a profile and a real item in the right
// language; the in memory store takes any id.
//
// Every comparison is exact. The numbers are picked to be awkward (many
// digits, no short binary form), because both adapters must hand back
// exactly the number that was written.
import { beforeAll, describe, expect, it } from 'vitest';
import type { LanguageCode } from '@stufen/contracts';
import { MATURE_STABILITY_DAYS } from '../src/store';
import type { CardStore, ReviewLogEntry, StoredReviewCard } from '../src/index';

export interface CardStoreHarness {
  store: CardStore;
  /** A fresh user the store may hold cards for (Postgres: users and profiles rows exist). */
  newUserId(): Promise<string>;
  /** A fresh item in this language (Postgres: a row in items exists). */
  newItemId(language: LanguageCode): Promise<string>;
}

const NOW = new Date('2026-11-11T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** ISO time `hours` away from NOW. Negative is the past. */
const at = (hours: number): string => new Date(NOW.getTime() + hours * HOUR).toISOString();

function cardFor(
  userId: string,
  itemId: string,
  language: LanguageCode,
  overrides: Partial<StoredReviewCard> = {},
): StoredReviewCard {
  return {
    userId,
    itemId,
    language,
    stability: 0,
    difficulty: 0,
    due: at(-1),
    lastReview: null,
    reps: 0,
    lapses: 0,
    state: 'new',
    scheduledDays: 0,
    learningSteps: 0,
    ...overrides,
  };
}

export function runCardStoreContract(
  name: string,
  makeHarness: () => CardStoreHarness | Promise<CardStoreHarness>,
): void {
  describe(`CardStore contract: ${name}`, () => {
    let store: CardStore;
    let newUserId: () => Promise<string>;
    let newItemId: (language: LanguageCode) => Promise<string>;

    beforeAll(async () => {
      const harness = await makeHarness();
      store = harness.store;
      newUserId = () => harness.newUserId();
      newItemId = (language) => harness.newItemId(language);
    });

    /** Stores one card for a fresh item and returns what was stored. */
    async function seed(
      userId: string,
      language: LanguageCode,
      overrides: Partial<StoredReviewCard> = {},
    ): Promise<StoredReviewCard> {
      const card = cardFor(userId, await newItemId(language), language, overrides);
      await store.upsertCard(card);
      return card;
    }

    describe('getCard and upsertCard', () => {
      it('getCard returns null for an item that was never introduced', async () => {
        expect(await store.getCard(await newUserId(), await newItemId('nl'))).toBeNull();
      });

      it('a new card with default values round trips', async () => {
        const card = cardFor(await newUserId(), await newItemId('nl'), 'nl');

        await store.upsertCard(card);

        expect(await store.getCard(card.userId, card.itemId)).toEqual(card);
      });

      it('every field of a reviewed card round trips', async () => {
        const card = cardFor(await newUserId(), await newItemId('fr'), 'fr', {
          stability: 15.69105055,
          difficulty: 6.48830527,
          due: at(72),
          lastReview: at(-6),
          reps: 7,
          lapses: 2,
          state: 'relearning',
          scheduledDays: 0.1 + 0.2,
          learningSteps: 1,
        });

        await store.upsertCard(card);

        expect(await store.getCard(card.userId, card.itemId)).toEqual(card);
      });

      it('upsertCard replaces the card with the same user and item', async () => {
        const userId = await newUserId();
        const first = await seed(userId, 'nl', { lastReview: at(-2), learningSteps: 1 });
        const second: StoredReviewCard = {
          ...first,
          stability: 21.00000001,
          difficulty: 1 / 3,
          due: at(240),
          lastReview: null,
          reps: 3,
          lapses: 1,
          state: 'review',
          scheduledDays: 10,
          learningSteps: 0,
        };

        await store.upsertCard(second);

        expect(await store.getCard(userId, first.itemId)).toEqual(second);
        expect(await store.listDue(userId, 'nl', new Date(at(1000)), 10)).toEqual([second]);
      });

      it('keeps the cards of two users for the same item apart', async () => {
        const itemId = await newItemId('nl');
        const mine = cardFor(await newUserId(), itemId, 'nl', { reps: 1 });
        const theirs = cardFor(await newUserId(), itemId, 'nl', { reps: 9 });

        await store.upsertCard(mine);
        await store.upsertCard(theirs);

        expect(await store.getCard(mine.userId, itemId)).toEqual(mine);
        expect(await store.getCard(theirs.userId, itemId)).toEqual(theirs);
      });
    });

    describe('listDue', () => {
      it('returns cards due at or before now, oldest due first', async () => {
        const userId = await newUserId();
        const later = await seed(userId, 'nl', { due: at(-1) });
        const oldest = await seed(userId, 'nl', { due: at(-48) });
        const exactlyNow = await seed(userId, 'nl', { due: NOW.toISOString() });
        await seed(userId, 'nl', { due: at(1) });

        expect(await store.listDue(userId, 'nl', NOW, 10)).toEqual([oldest, later, exactlyNow]);
      });

      it('orders cards with the same due by item id', async () => {
        const userId = await newUserId();
        const cards = [
          await seed(userId, 'nl', { due: at(-3) }),
          await seed(userId, 'nl', { due: at(-3) }),
          await seed(userId, 'nl', { due: at(-3) }),
        ];
        const first = await seed(userId, 'nl', { due: at(-4) });
        const byItemId = [...cards].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));

        expect(await store.listDue(userId, 'nl', NOW, 10)).toEqual([first, ...byItemId]);
      });

      it('respects the limit and keeps the oldest', async () => {
        const userId = await newUserId();
        const third = await seed(userId, 'fr', { due: at(-1) });
        const first = await seed(userId, 'fr', { due: at(-3) });
        const second = await seed(userId, 'fr', { due: at(-2) });

        expect(await store.listDue(userId, 'fr', NOW, 2)).toEqual([first, second]);
        expect(await store.listDue(userId, 'fr', NOW, 3)).toEqual([first, second, third]);
        expect(await store.listDue(userId, 'fr', NOW, 0)).toEqual([]);
      });

      it('keeps languages apart', async () => {
        const userId = await newUserId();
        const dutch = await seed(userId, 'nl');
        const french = await seed(userId, 'fr');

        expect(await store.listDue(userId, 'nl', NOW, 10)).toEqual([dutch]);
        expect(await store.listDue(userId, 'fr', NOW, 10)).toEqual([french]);
        expect(await store.listDue(userId, 'de', NOW, 10)).toEqual([]);
      });

      it('keeps users apart', async () => {
        const mine = await seed(await newUserId(), 'nl');
        const theirs = await seed(await newUserId(), 'nl');

        expect(await store.listDue(mine.userId, 'nl', NOW, 10)).toEqual([mine]);
        expect(await store.listDue(theirs.userId, 'nl', NOW, 10)).toEqual([theirs]);
      });
    });

    describe('countByState', () => {
      it('is all zeros for a user with no cards', async () => {
        expect(await store.countByState(await newUserId(), 'nl', NOW)).toEqual({
          due: 0,
          byState: { new: 0, learning: 0, review: 0, relearning: 0 },
          mature: 0,
        });
      });

      it('counts due cards, cards per state and mature cards of one language', async () => {
        const userId = await newUserId();
        const young = MATURE_STABILITY_DAYS - 0.5;
        await seed(userId, 'nl', { state: 'new', due: at(-1) });
        await seed(userId, 'nl', { state: 'new', due: at(5) });
        await seed(userId, 'nl', { state: 'learning', due: NOW.toISOString() });
        await seed(userId, 'nl', { state: 'relearning', due: at(2), stability: 40 });
        await seed(userId, 'nl', { state: 'review', due: at(-2), stability: young });
        await seed(userId, 'nl', {
          state: 'review',
          due: at(99),
          stability: MATURE_STABILITY_DAYS,
        });
        await seed(userId, 'nl', { state: 'review', due: at(-9), stability: 64.5 });
        // Another language and another user must not show up in the counts.
        await seed(userId, 'fr', { state: 'review', due: at(-1), stability: 90 });
        await seed(await newUserId(), 'nl', { state: 'learning', due: at(-1) });

        expect(await store.countByState(userId, 'nl', NOW)).toEqual({
          due: 4,
          byState: { new: 2, learning: 1, review: 3, relearning: 1 },
          mature: 2,
        });
        expect(await store.countByState(userId, 'fr', NOW)).toEqual({
          due: 1,
          byState: { new: 0, learning: 0, review: 1, relearning: 0 },
          mature: 1,
        });
      });
    });

    describe('insertLog and listLogs', () => {
      it('listLogs is empty for a card with no reviews', async () => {
        expect(await store.listLogs(await newUserId(), await newItemId('nl'))).toEqual([]);
      });

      it('returns the logs of one card, oldest first, with every field', async () => {
        const userId = await newUserId();
        const card = await seed(userId, 'nl');
        const other = await seed(userId, 'nl');
        const base = { userId, itemId: card.itemId };
        const first: ReviewLogEntry = {
          ...base,
          rating: 1,
          reviewedAt: at(-30),
          elapsedDays: 0,
          scheduledDays: 0,
          stateBefore: 'new',
        };
        const second: ReviewLogEntry = {
          ...base,
          rating: 3,
          reviewedAt: at(-18),
          elapsedDays: 10 / (24 * 60),
          scheduledDays: 1 / 3,
          stateBefore: 'learning',
        };
        const third: ReviewLogEntry = {
          ...base,
          rating: 4,
          reviewedAt: at(-1),
          elapsedDays: 17.123456789,
          scheduledDays: 16,
          stateBefore: 'review',
        };
        const elsewhere: ReviewLogEntry = { ...first, itemId: other.itemId, rating: 2 };

        // Written out of order: the order that comes back is by reviewedAt.
        for (const log of [second, elsewhere, third, first]) await store.insertLog(log);

        expect(await store.listLogs(userId, card.itemId)).toEqual([first, second, third]);
        expect(await store.listLogs(userId, other.itemId)).toEqual([elsewhere]);
      });
    });
  });
}
