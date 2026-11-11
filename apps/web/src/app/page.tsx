import { redirect } from 'next/navigation';
import { Card } from '../components/kit';
import { LANGUAGE_NAMES } from '../lib/learning-options';
import { getContainer } from '../server/container';
import { requireSession } from '../server/session';

// Reads the session on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireSession('/');

  const { identity } = getContainer();
  const profile = await identity.ensureProfile(session.userId);
  const language = profile.activeLanguage;
  if (language === null) redirect('/onboarding');

  const languages = await identity.listLearnerLanguages(session.userId);
  const target = languages.find((row) => row.languageCode === language)?.targetLevel;
  const name = profile.displayName ?? session.email;

  return (
    <div className="flex flex-col gap-6">
      <Card title={`Welcome, ${name}`} headingLevel={1}>
        <p>
          You are learning {LANGUAGE_NAMES[language]}
          {target ? `, with ${target} as your target level.` : '.'}
        </p>
      </Card>
      <Card title="Lessons" headingLevel={2}>
        <p>Lessons arrive in the next phase. Your language and level are saved and ready.</p>
      </Card>
    </div>
  );
}
