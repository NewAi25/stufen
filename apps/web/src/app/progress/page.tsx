import type { Metadata } from 'next';
import { Card, LevelMap } from '@stufen/ui-kit';
import { LinkButton } from '../../components/LinkButton';
import { estimateLine, EVIDENCE_NAMES } from '../../lib/progress-view';
import { loadProgress } from '../../server/actions/progress-actions';
import { getContainer } from '../../server/container';
import { requireLearner } from '../../server/learner';

// Reads the session and the evidence on every request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Progress | Stufen' };

// Only strings go to the LevelMap, which is a client component. Its other
// labels are functions and keep their English defaults.
const MAP_LABELS = {
  noDescriptors: 'The content for this level is not written yet.',
  checkpointLocked: 'The checkpoint is not open yet. Checkpoints arrive in a later version.',
  names: EVIDENCE_NAMES,
};

export default async function ProgressPage() {
  const { session, language } = await requireLearner('/progress');
  const container = getContainer();
  const view = await loadProgress(container, session.userId, language);
  const next = await container.curriculum.nextLessonFor(session.userId, language);

  return (
    <div className="flex flex-col gap-6">
      <header className="app-home__header">
        <h1 className="app-page-title">Progress</h1>
        <p className="app-home__level">{estimateLine(view)}</p>
      </header>
      <Card as="section" title="How a level is reached" headingLevel={2}>
        <p>
          A can do statement is mastered with at least 6 checked attempts, correct answers in 2
          different exercise types and at least 80 percent of the last 10 right. Speaking and
          writing also need a graded sample. A level needs 80 percent of its statements, every
          speaking and writing statement, and its checkpoint.
        </p>
        <p className="app-muted">
          Self checks do not count yet. The tutor grades speaking and writing in a later version, so
          no level can be reached before then.
        </p>
        {view.hasEvidence ? null : <p>Evidence appears here as you complete exercises.</p>}
        {next === null ? null : (
          <div className="app-actions">
            <LinkButton href={`/lesson/${next.id}`} variant="primary">
              {view.hasEvidence ? 'Open next lesson' : 'Start first lesson'}
            </LinkButton>
          </div>
        )}
      </Card>
      <LevelMap
        levels={view.levels}
        labels={MAP_LABELS}
        headingLevel={2}
        {...(view.workingTowards === null ? {} : { defaultExpanded: [view.workingTowards] })}
      />
    </div>
  );
}
