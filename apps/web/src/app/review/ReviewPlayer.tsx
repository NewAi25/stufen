'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, FlashcardExercise } from '@stufen/ui-kit';
import type { FlashcardValue } from '@stufen/ui-kit';
import { LinkButton } from '../../components/LinkButton';
import { cardDetails, REVIEW_RATINGS, tallySentence } from '../../lib/review-view';
import type {
  ReviewCardView,
  ReviewQueueView,
  ReviewRatingName,
  ReviewTally,
} from '../../lib/review-view';
import { loadMoreCards, rateCard } from './actions';

const NOT_SAVED = 'That rating was not saved. Try again.';

/** A time of day today, or the day with the time when it is later than today. */
function whenText(iso: string): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (when.toDateString() === new Date().toDateString()) return time;
  const day = when.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  return `${time} on ${day}`;
}

export interface ReviewPlayerProps {
  initial: ReviewQueueView;
  /** Where the empty state leads. Null when every lesson is done. */
  nextLessonId: string | null;
}

export function ReviewPlayer({ initial, nextLessonId }: ReviewPlayerProps) {
  const [queue, setQueue] = useState<ReviewCardView[]>(initial.cards);
  const [due, setDue] = useState(initial.due);
  const [value, setValue] = useState<FlashcardValue | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState<ReviewTally>({ again: 0, hard: 0, good: 0, easy: 0 });
  // The earliest time a card rated in this visit comes back.
  const [comesBack, setComesBack] = useState<string | null>(null);

  const card = queue[0];
  const reviewed = REVIEW_RATINGS.reduce((sum, rating) => sum + tally[rating], 0);

  async function rate(current: ReviewCardView, rating: ReviewRatingName): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    setValue({ rating });
    try {
      const outcome = await rateCard(current.itemId, REVIEW_RATINGS.indexOf(rating) + 1);
      if (!outcome.ok) {
        setValue(null);
        return setError(outcome.message);
      }
      setTally((now) => ({ ...now, [rating]: now[rating] + 1 }));
      setComesBack((now) => (now === null || outcome.nextDue < now ? outcome.nextDue : now));
      let rest = queue.filter((entry) => entry.itemId !== current.itemId);
      let left = outcome.due;
      // The screen holds one batch. When it is through, it asks for the next.
      if (rest.length === 0 && left > 0) {
        const more = await loadMoreCards();
        rest = more?.cards ?? [];
        left = more?.due ?? 0;
      }
      setQueue(rest);
      setDue(rest.length === 0 ? 0 : Math.max(left, rest.length));
      setValue(null);
    } catch {
      setValue(null);
      setError(NOT_SAVED);
    } finally {
      setPending(false);
    }
  }

  if (card === undefined) {
    const back =
      comesBack === null ? null : `A card you rated comes back at ${whenText(comesBack)}.`;
    return (
      <Card title={reviewed === 0 ? 'Reviews' : 'Reviews done'} headingLevel={1}>
        <p>{reviewed === 0 ? 'Nothing due right now.' : tallySentence(tally)}</p>
        {back === null ? null : <p>{back}</p>}
        {reviewed === 0 ? (
          <p className="app-muted">Words from the lessons you finish come here for review.</p>
        ) : null}
        <div className="app-actions">
          {nextLessonId === null ? (
            <LinkButton href="/" variant="primary">
              Back to home
            </LinkButton>
          ) : (
            <>
              <LinkButton href={`/lesson/${nextLessonId}`} variant="primary">
                Go to next lesson
              </LinkButton>
              <LinkButton href="/">Back to home</LinkButton>
            </>
          )}
        </div>
      </Card>
    );
  }

  const details = cardDetails(card);
  return (
    <div className="app-lesson">
      <header className="app-review__bar">
        <Link href="/" className="app-lesson__exit">
          Back to home
        </Link>
        <h1 className="app-page-title">Review</h1>
        <span className="app-lesson__count" role="status">
          {due === 1 ? '1 card left' : `${due} cards left`}
        </span>
      </header>
      <FlashcardExercise
        key={card.itemId}
        payload={{
          front: card.lemma,
          back: card.gloss,
          ...(details === '' ? {} : { hint: details }),
        }}
        value={value}
        onChange={(next) => void rate(card, next.rating)}
        disabled={pending}
        lang={initial.language}
      />
      {error === null ? null : (
        <p className="app-form-error" role="alert">
          {error}
        </p>
      )}
      <p className="app-muted">Space shows the answer. Keys 1 to 4 rate it.</p>
    </div>
  );
}
