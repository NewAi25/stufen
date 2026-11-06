'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { NOT_SIGNED_IN, type ActionResult } from '../../lib/action-result';
import { completeOnboarding, type OnboardingInput } from '../../server/actions/identity-actions';
import { getContainer } from '../../server/container';
import { getSession } from '../../server/session';

/** Sets the active language, then sends the learner home. */
export async function submitOnboarding(input: OnboardingInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NOT_SIGNED_IN;

  const result = await completeOnboarding(getContainer(), session.userId, input);
  if (!result.ok) return result;

  revalidatePath('/', 'layout');
  redirect('/');
}
