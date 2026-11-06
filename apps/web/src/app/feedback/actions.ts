'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '../../lib/action-result';
import { submitFeedbackFor, type FeedbackInput } from '../../server/actions/feedback-actions';
import { getContainer } from '../../server/container';
import { getSession } from '../../server/session';

/** Stores feedback from the FeedbackFab. Works signed out: the row has no user. */
export async function submitFeedback(input: FeedbackInput): Promise<ActionResult> {
  const session = await getSession();
  const result = await submitFeedbackFor(getContainer(), session, input);
  if (result.ok) revalidatePath('/feedback');
  return result;
}
