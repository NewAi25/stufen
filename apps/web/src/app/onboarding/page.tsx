import type { Metadata } from 'next';
import { getContainer } from '../../server/container';
import { requireSession } from '../../server/session';
import { OnboardingForm } from './OnboardingForm';

// Reads the session on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Get started | Stufen' };

const DEFAULT_LANGUAGE = 'de';
const DEFAULT_TARGET_LEVEL = 'B1';

export default async function OnboardingPage() {
  const session = await requireSession('/onboarding');

  const { identity } = getContainer();
  const profile = await identity.ensureProfile(session.userId);
  const languages = await identity.listLearnerLanguages(session.userId);
  const current = languages.find((row) => row.languageCode === profile.activeLanguage);

  return (
    <OnboardingForm
      initialLanguage={profile.activeLanguage ?? DEFAULT_LANGUAGE}
      initialLevel={current?.targetLevel ?? DEFAULT_TARGET_LEVEL}
    />
  );
}
