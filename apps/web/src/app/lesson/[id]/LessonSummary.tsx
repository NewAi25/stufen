import { Card } from '@stufen/ui-kit';
import { LinkButton } from '../../../components/LinkButton';
import { reviewSentence, scoreSentence, selfCheckSentence } from '../../../lib/lesson-summary';
import type { LessonSummaryView } from '../../../lib/lesson-view';

/** Shown after the last exercise. One primary link, to the next lesson. */
export function LessonSummary({ summary }: { summary: LessonSummaryView }) {
  const lang = summary.language === '' ? undefined : summary.language;
  const selfChecks = selfCheckSentence(summary.selfChecked);
  return (
    <Card title="Lesson finished" headingLevel={1}>
      <p lang={lang} className="app-lesson-summary__title">
        {summary.lessonTitle}
      </p>
      <p>{scoreSentence(summary)}</p>
      {selfChecks === null ? null : <p>{selfChecks}</p>}
      <p>{reviewSentence(summary.newReviewItems)}</p>
      <div className="app-actions">
        {summary.next === null ? (
          <LinkButton href="/" variant="primary">
            Back to home
          </LinkButton>
        ) : (
          <>
            <LinkButton href={`/lesson/${summary.next.id}`} variant="primary">
              Next lesson: <span lang={lang}>{summary.next.title}</span>
            </LinkButton>
            <LinkButton href="/">Back to home</LinkButton>
          </>
        )}
      </div>
    </Card>
  );
}
