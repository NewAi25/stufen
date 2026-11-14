import { describe, expect, it } from 'vitest';
import { loadReviewQueue, rateReviewCard } from '../src/server/actions/review-actions';
import { createContainer } from '../src/server/container';
import { cardDetails, cardViewFor, tallySentence } from '../src/lib/review-view';
import { memoryConfig } from './helpers/config';
import { finishWholeLesson, firstLesson } from './helpers/finish-lesson';

// The functions behind /review, on the real container with in memory stores.
// The queue is asked for with a limit far above any lesson, so no count of
// items is written down here.
const ALL = 10_000;

async function setup() {
  const container = createContainer(memoryConfig());
  const session = await container.auth.createDevSession('learner@stufen.local');
  const lesson = await firstLesson(container);
  return { container, userId: session.userId, lesson };
}

describe('loadReviewQueue', () => {
  it('is empty for a learner who has finished no lesson', async () => {
    const { container, userId } = await setup();
    expect(await loadReviewQueue(container, userId, 'de')).toEqual({
      language: 'de',
      cards: [],
      due: 0,
    });
  });

  it('holds the items a finished lesson introduces, each with its item', async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const queue = await loadReviewQueue(container, userId, 'de', ALL);
    const introduced = lesson.introducesItemIds ?? [];
    expect(introduced.length).toBeGreaterThan(0);

    // Every introduced item has a card. The ones no exercise rated are due now.
    const dueIds = new Set(queue.cards.map((card) => card.itemId));
    let unrated = 0;
    for (const itemId of introduced) {
      const card = await container.stores.cards.getCard(userId, itemId);
      expect(card, `card for ${itemId}`).not.toBeNull();
      if (card?.state !== 'new') continue;
      unrated += 1;
      expect(dueIds.has(itemId), `${itemId} is due`).toBe(true);
    }
    expect(unrated).toBeGreaterThan(0);
    expect(queue.due).toBe(queue.cards.length);
    expect(queue.due).toBe((await container.srs.stats(userId, 'de')).due);

    const items = await container.getItems(queue.cards.map((card) => card.itemId));
    for (const card of queue.cards) {
      const item = items.find((entry) => entry.id === card.itemId);
      expect(card.lemma).toBe(item?.lemma);
      expect(card.gloss).toBe(item?.glossEn);
      expect(card.lemma).not.toBe('');
      expect(card.gloss).not.toBe('');
    }
    expect(JSON.parse(JSON.stringify(queue))).toEqual(queue);
  });

  it('hands out at most the limit and still counts every due card', async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const all = await loadReviewQueue(container, userId, 'de', ALL);
    const one = await loadReviewQueue(container, userId, 'de', 1);
    expect(one.cards).toEqual(all.cards.slice(0, 1));
    expect(one.due).toBe(all.due);
  });
});

describe('rateReviewCard', () => {
  it('moves a rated card out of the due queue and writes a review log', async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const before = await loadReviewQueue(container, userId, 'de', ALL);
    const card = before.cards[0];
    if (!card) throw new Error('nothing is due after the first lesson');
    const logsBefore = await container.stores.cards.listLogs(userId, card.itemId);

    const outcome = await rateReviewCard(container, userId, 'de', card.itemId, 3);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.due).toBe(before.due - 1);
    expect(new Date(outcome.nextDue).getTime()).toBeGreaterThan(Date.now());

    const after = await loadReviewQueue(container, userId, 'de', ALL);
    expect(after.cards.map((entry) => entry.itemId)).not.toContain(card.itemId);
    expect(after.due).toBe(before.due - 1);
    const logs = await container.stores.cards.listLogs(userId, card.itemId);
    expect(logs).toHaveLength(logsBefore.length + 1);
    expect(logs.at(-1)?.rating).toBe(3);
    expect(await container.stores.events.count('item.reviewed')).toBeGreaterThan(0);
  });

  it('refuses a rating outside 1 to 4 and an item without a card', async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const queue = await loadReviewQueue(container, userId, 'de', ALL);
    const card = queue.cards[0];
    if (!card) throw new Error('nothing is due after the first lesson');

    for (const rating of [0, 5, 2.5, '3', null]) {
      expect((await rateReviewCard(container, userId, 'de', card.itemId, rating)).ok).toBe(false);
    }
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await rateReviewCard(container, userId, 'de', unknown, 3)).ok).toBe(false);
    expect((await loadReviewQueue(container, userId, 'de', ALL)).due).toBe(queue.due);
  });

  it("never rates another learner's card", async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const queue = await loadReviewQueue(container, userId, 'de', ALL);
    const card = queue.cards[0];
    if (!card) throw new Error('nothing is due after the first lesson');
    const other = (await container.auth.createDevSession('other@stufen.local')).userId;

    expect((await rateReviewCard(container, other, 'de', card.itemId, 4)).ok).toBe(false);
    expect((await loadReviewQueue(container, other, 'de', ALL)).cards).toEqual([]);
    expect((await loadReviewQueue(container, userId, 'de', ALL)).due).toBe(queue.due);
  });
});

describe('the card of an item', () => {
  const base = {
    id: 'i1',
    languageCode: 'de' as const,
    key: 'de:vocab:name',
    level: 'A1' as const,
    frequencyRank: null,
    packVersion: '1.0.0',
  };

  it('shows gender, plural and one example for a noun', () => {
    const card = cardViewFor({
      ...base,
      kind: 'vocab',
      lemma: 'der Name',
      glossEn: 'name',
      payload: {
        pos: 'noun',
        gender: 'm',
        plural: 'die Namen',
        examples: [{ text: 'Mein Name ist Anna.', gloss_en: 'My name is Anna.' }],
      },
    });
    expect(card).toEqual({
      itemId: 'i1',
      lemma: 'der Name',
      gloss: 'name',
      example: { text: 'Mein Name ist Anna.', glossEn: 'My name is Anna.' },
      gender: 'masculine',
      plural: 'die Namen',
    });
    expect(cardDetails(card)).toBe(
      'Gender: masculine. Plural: die Namen. Example: Mein Name ist Anna. (My name is Anna.)',
    );
  });

  it('leaves out what the payload does not have', () => {
    const card = cardViewFor({
      ...base,
      kind: 'phrase',
      lemma: 'Hallo!',
      glossEn: 'Hello!',
      payload: { plural: 'none' },
    });
    expect(card).toMatchObject({ example: null, gender: null, plural: null });
    expect(cardDetails(card)).toBe('');
    expect(
      cardViewFor({ ...base, kind: 'vocab', lemma: 'x', glossEn: 'y', payload: null }),
    ).toEqual({ itemId: 'i1', lemma: 'x', gloss: 'y', example: null, gender: null, plural: null });
  });

  it('sums a review session up in one sentence', () => {
    expect(tallySentence({ again: 3, hard: 0, good: 9, easy: 2 })).toBe(
      '14 reviewed. 3 again, 9 good, 2 easy.',
    );
  });
});
