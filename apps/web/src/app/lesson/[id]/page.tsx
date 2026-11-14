import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { openLesson } from '../../../server/actions/lesson-actions';
import { getContainer } from '../../../server/container';
import { requireSession } from '../../../server/session';
import { LessonPlayer } from './LessonPlayer';

// Reads the session on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Lesson | Stufen' };

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/lesson/${encodeURIComponent(id)}`);

  // Starts the session or resumes the learner's unfinished one. The session
  // is looked up by user id, so nobody opens another learner's session.
  const view = await openLesson(getContainer(), session.userId, id);
  if (view === null) notFound();

  return <LessonPlayer initial={view} />;
}
