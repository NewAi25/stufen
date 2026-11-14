import 'server-only';

// The review flow, kept free of Next so it can be tested with a real
// container. The review page (row P1-20) and its server actions call these.

import type { LanguageCode, ReviewRating } from '@stufen/contracts';
import { CardNotFoundError } from '@stufen/core-srs';
import { cardViewFor } from '../../lib/review-view';
import type { RateOutcome, ReviewQueueView } from '../../lib/review-view';
import type { Container } from '../container';

/** How many cards one load hands to the screen. The screen asks again when it runs out. */
export const REVIEW_BATCH = 20;

/**
 * The cards that are due now, oldest due date first, each with its item from
 * the content pack. A card whose item is no longer in the pack is left out.
 */
export async function loadReviewQueue(
  container: Container,
  userId: string,
  language: LanguageCode,
  limit: number = REVIEW_BATCH,
): Promise<ReviewQueueView> {
  await container.ready;
  const [cards, stats] = await Promise.all([
    container.srs.dueQueue(userId, language, limit),
    container.srs.stats(userId, language),
  ]);
  const items = await container.getItems(cards.map((card) => card.itemId));
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    language,
    cards: cards.flatMap((card) => {
      const item = byId.get(card.itemId);
      return item === undefined ? [] : [cardViewFor(item)];
    }),
    due: stats.due,
  };
}

function isRating(value: unknown): value is ReviewRating {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/**
 * Rates one card: 1 again, 2 hard, 3 good, 4 easy. The review box schedules
 * it and writes the log. Answers with how many cards are still due and when
 * this one comes back.
 */
export async function rateReviewCard(
  container: Container,
  userId: string,
  language: LanguageCode,
  itemId: string,
  rating: unknown,
): Promise<RateOutcome> {
  if (!isRating(rating)) return { ok: false, message: 'Choose a rating from 1 to 4.' };
  try {
    const card = await container.srs.review(userId, itemId, rating);
    const stats = await container.srs.stats(userId, language);
    return { ok: true, due: stats.due, nextDue: card.due };
  } catch (error) {
    if (error instanceof CardNotFoundError) {
      return { ok: false, message: 'This card is not in your reviews. Reload the page.' };
    }
    throw error;
  }
}
