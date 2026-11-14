import 'server-only';

import { redirect } from 'next/navigation';
import type { AuthSession, LanguageCode, Profile } from '@stufen/contracts';
import { getContainer } from './container';
import { getSession, requireSession } from './session';

/** A signed in learner who has chosen a language. */
export interface Learner {
  session: AuthSession;
  profile: Profile;
  language: LanguageCode;
}

/**
 * The learner for a page of the daily loop. Nobody signed in: redirect to
 * sign in, remembering `path`. No language chosen yet: redirect to onboarding.
 */
export async function requireLearner(path: string): Promise<Learner> {
  const session = await requireSession(path);
  const profile = await getContainer().identity.ensureProfile(session.userId);
  if (profile.activeLanguage === null) redirect('/onboarding');
  return { session, profile, language: profile.activeLanguage };
}

/** The same for a server action, which answers instead of redirecting. Null when either is missing. */
export async function getLearner(): Promise<Learner | null> {
  const session = await getSession();
  if (!session) return null;
  const profile = await getContainer().identity.ensureProfile(session.userId);
  if (profile.activeLanguage === null) return null;
  return { session, profile, language: profile.activeLanguage };
}
