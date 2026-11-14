import type { Metadata } from 'next';
import { loadReviewQueue } from '../../server/actions/review-actions';
import { getContainer } from '../../server/container';
import { requireLearner } from '../../server/learner';
import { ReviewPlayer } from './ReviewPlayer';

// Reads the session and the due queue on every request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Review | Stufen' };

export default async function ReviewPage() {
  const { session, language } = await requireLearner('/review');
  const container = getContainer();
  const queue = await loadReviewQueue(container, session.userId, language);
  const next = await container.curriculum.nextLessonFor(session.userId, language);

  return <ReviewPlayer initial={queue} nextLessonId={next?.id ?? null} />;
}
