import Link from 'next/link';
import { Card } from '@stufen/ui-kit';
import { LinkButton } from '../components/LinkButton';
import { dueLine, levelLine, streakLine } from '../lib/home-view';
import type { HomeUnit, HomeView } from '../lib/home-view';
import { LANGUAGE_NAMES } from '../lib/learning-options';
import { loadHome } from '../server/actions/home-actions';
import { getContainer } from '../server/container';
import { requireLearner } from '../server/learner';

// Reads the session on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

const KIND_NOTES: Record<string, string> = {
  review: 'Review lesson',
  production: 'Speaking and writing',
  checkpoint: 'Checkpoint',
};

function NextLessonCard({ view }: { view: HomeView }) {
  const lesson = view.nextLesson;
  if (lesson === null) {
    return (
      <Card title="Next lesson" headingLevel={2} as="section">
        <p>You have finished every lesson that is written so far. More lessons are on the way.</p>
      </Card>
    );
  }
  return (
    <Card title="Next lesson" headingLevel={2} as="section">
      <p className="app-muted">
        Unit {lesson.unitOrdinal}: <span lang={view.language}>{lesson.unitTitle}</span>
        {lesson.unitTitleEn === null ? null : ` (${lesson.unitTitleEn})`}
      </p>
      <p className="app-home__lesson-title">
        <span lang={view.language}>{lesson.title}</span>
        {lesson.titleEn === null ? null : <span className="app-muted"> {lesson.titleEn}</span>}
      </p>
      <p className="app-muted">About {lesson.estimatedMinutes} minutes</p>
      <div className="app-actions">
        <LinkButton
          href={`/lesson/${lesson.id}`}
          variant={view.primary === 'lesson' ? 'primary' : 'secondary'}
        >
          Open lesson
        </LinkButton>
      </div>
    </Card>
  );
}

function UnitList({ unit, lang }: { unit: HomeUnit; lang: string }) {
  return (
    <section className="app-unit">
      <h3 className="app-unit__title">
        Unit {unit.ordinal}: <span lang={lang}>{unit.title}</span>
        {unit.titleEn === null ? null : <span className="app-muted"> {unit.titleEn}</span>}
      </h3>
      <ol className="app-unit__lessons">
        {unit.lessons.map((lesson) => (
          <li key={lesson.id} className="app-unit__lesson" data-done={lesson.completed}>
            <span className="app-unit__mark">
              {lesson.completed ? <span aria-hidden="true">✓ </span> : null}
              {lesson.completed ? 'Done' : 'Open'}
            </span>
            <Link href={`/lesson/${lesson.id}`} className="app-unit__link">
              <span lang={lang}>{lesson.title}</span>
              {lesson.titleEn === null ? null : (
                <span className="app-muted"> {lesson.titleEn}</span>
              )}
            </Link>
            <span className="app-muted">
              {KIND_NOTES[lesson.kind] ? `${KIND_NOTES[lesson.kind]}, ` : ''}
              {lesson.estimatedMinutes} min
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function HomePage() {
  const { session, profile, language } = await requireLearner('/');
  const view = await loadHome(getContainer(), session.userId, language);
  // The database stores an empty name for a user who has not set one yet.
  const name = profile.displayName?.trim() || session.email;

  return (
    <div className="flex flex-col gap-6">
      <header className="app-home__header">
        <h1 className="app-page-title">Welcome, {name}</h1>
        <p className="app-home__level">
          {LANGUAGE_NAMES[language]}. {levelLine(view)}
        </p>
      </header>
      <div className="app-home__cards">
        <Card title="Reviews" headingLevel={2} as="section">
          <p>{dueLine(view.reviewsDue)}</p>
          {view.reviewsDue === 0 ? (
            <p className="app-muted">Words from finished lessons come back here.</p>
          ) : (
            <div className="app-actions">
              <LinkButton href="/review" variant="primary">
                Start reviews
              </LinkButton>
            </div>
          )}
        </Card>
        <NextLessonCard view={view} />
        <Card title="Tutor" headingLevel={2} as="section">
          <p className="app-muted">The tutor arrives in the next version.</p>
        </Card>
      </div>
      <p className="app-home__streak">{streakLine(view.streakDays)}</p>
      <section className="flex flex-col gap-4" aria-labelledby="home-units">
        <h2 id="home-units" className="app-step-title">
          {view.level} units and lessons
        </h2>
        {view.units.length === 0 ? (
          <p>No lessons are written for {view.level} yet.</p>
        ) : (
          view.units.map((unit) => <UnitList key={unit.id} unit={unit} lang={view.language} />)
        )}
      </section>
    </div>
  );
}
