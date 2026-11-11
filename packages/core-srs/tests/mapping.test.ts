// Round trip of the mapping between the stored card and the ts-fsrs card.
// If a field is dropped or renamed on either side, one of these fails.
import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { ReviewState } from '@stufen/contracts';
import { fromFsrsCard, fromFsrsState, toFsrsCard, toFsrsGrade, toFsrsState } from '../src/mapping';
import type { StoredReviewCard } from '../src/store';

const identity = { userId: 'user-1', itemId: 'item-1', language: 'de' as const };
const NOW = new Date('2026-11-06T10:00:00.000Z');

describe('mapping', () => {
  it('stored card to ts-fsrs and back gives the same stored card', () => {
    const stored: StoredReviewCard = {
      ...identity,
      stability: 12.5,
      difficulty: 4.25,
      due: '2026-11-20T10:00:00.000Z',
      lastReview: '2026-11-06T10:00:00.000Z',
      reps: 7,
      lapses: 2,
      state: 'review',
      scheduledDays: 14,
      learningSteps: 0,
    };

    expect(fromFsrsCard(toFsrsCard(stored), identity)).toEqual(stored);
  });

  it('a never reviewed card keeps lastReview null and has no last_review key', () => {
    const fresh = fromFsrsCard(createEmptyCard(NOW), identity);

    expect(fresh).toEqual<StoredReviewCard>({
      ...identity,
      stability: 0,
      difficulty: 0,
      due: NOW.toISOString(),
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new',
      scheduledDays: 0,
      learningSteps: 0,
    });
    expect('last_review' in toFsrsCard(fresh)).toBe(false);
    expect(fromFsrsCard(toFsrsCard(fresh), identity)).toEqual(fresh);
  });

  it('ts-fsrs card to stored and back gives the same ts-fsrs card', () => {
    const scheduler = fsrs({ enable_fuzz: false });
    // A card in the learning steps, so learning_steps and last_review are set.
    const learning = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good).card;
    expect(learning.learning_steps).toBeGreaterThan(0);

    expect(toFsrsCard(fromFsrsCard(learning, identity))).toEqual(learning);
  });

  it('maps every state both ways', () => {
    const pairs: [ReviewState, State][] = [
      ['new', State.New],
      ['learning', State.Learning],
      ['review', State.Review],
      ['relearning', State.Relearning],
    ];
    for (const [ours, theirs] of pairs) {
      expect(toFsrsState(ours)).toBe(theirs);
      expect(fromFsrsState(theirs)).toBe(ours);
    }
  });

  it('maps ratings 1 to 4 to again, hard, good, easy', () => {
    expect(toFsrsGrade(1)).toBe(Rating.Again);
    expect(toFsrsGrade(2)).toBe(Rating.Hard);
    expect(toFsrsGrade(3)).toBe(Rating.Good);
    expect(toFsrsGrade(4)).toBe(Rating.Easy);
  });
});
