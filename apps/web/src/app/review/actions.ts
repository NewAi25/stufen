'use server';

import { revalidatePath } from 'next/cache';
import { NOT_SIGNED_IN_MESSAGE } from '../../lib/action-result';
import type { RateOutcome, ReviewQueueView } from '../../lib/review-view';
import { loadReviewQueue, rateReviewCard } from '../../server/actions/review-actions';
import { getContainer } from '../../server/container';
import { getLearner } from '../../server/learner';

/** Rates one card of the signed in learner. Ratings: 1 again, 2 hard, 3 good, 4 easy. */
export async function rateCard(itemId: string, rating: number): Promise<RateOutcome> {
  const learner = await getLearner();
  if (!learner) return { ok: false, message: NOT_SIGNED_IN_MESSAGE };
  if (typeof itemId !== 'string') {
    return { ok: false, message: 'This card is not in your reviews. Reload the page.' };
  }
  const outcome = await rateReviewCard(
    getContainer(),
    learner.session.userId,
    learner.language,
    itemId,
    rating,
  );
  // The due count on home changes with every rating.
  if (outcome.ok) revalidatePath('/');
  return outcome;
}

/** The next cards that are due, for when the screen has shown all it was given. */
export async function loadMoreCards(): Promise<ReviewQueueView | null> {
  const learner = await getLearner();
  if (!learner) return null;
  return loadReviewQueue(getContainer(), learner.session.userId, learner.language);
}
