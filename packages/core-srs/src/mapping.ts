// The one place where ts-fsrs shapes meet this box's stored shapes. Every
// field is mapped by name, in both directions, so a change in either shape
// shows up here as a compile error. Nothing outside core-srs sees ts-fsrs
// types (ADR-005).
import { Rating, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import type { LanguageCode, ReviewRating, ReviewState } from '@stufen/contracts';
import type { StoredReviewCard } from './store';

/** The part of a stored card that ts-fsrs knows nothing about. */
export interface CardIdentity {
  userId: string;
  itemId: string;
  language: LanguageCode;
}

const STATE_TO_FSRS: Record<ReviewState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_FROM_FSRS: Record<State, ReviewState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const GRADE_OF: Record<ReviewRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

export function toFsrsState(state: ReviewState): State {
  return STATE_TO_FSRS[state];
}

export function fromFsrsState(state: State): ReviewState {
  return STATE_FROM_FSRS[state];
}

/** 1 again, 2 hard, 3 good, 4 easy. */
export function toFsrsGrade(rating: ReviewRating): Grade {
  return GRADE_OF[rating];
}

/** Stored card to the ts-fsrs card. ISO strings become Date objects. */
export function toFsrsCard(stored: StoredReviewCard): Card {
  const card: Card = {
    due: new Date(stored.due),
    stability: stored.stability,
    difficulty: stored.difficulty,
    scheduled_days: stored.scheduledDays,
    learning_steps: stored.learningSteps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: toFsrsState(stored.state),
  };
  // ts-fsrs leaves last_review absent on a card that was never reviewed.
  if (stored.lastReview !== null) card.last_review = new Date(stored.lastReview);
  return card;
}

/** ts-fsrs card back to the stored card. Date objects become ISO strings. */
export function fromFsrsCard(card: Card, identity: CardIdentity): StoredReviewCard {
  return {
    userId: identity.userId,
    itemId: identity.itemId,
    language: identity.language,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    reps: card.reps,
    lapses: card.lapses,
    state: fromFsrsState(card.state),
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
  };
}
