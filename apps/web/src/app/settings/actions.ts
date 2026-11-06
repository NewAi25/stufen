'use server';

import { revalidatePath } from 'next/cache';
import { NOT_SIGNED_IN, type ActionResult } from '../../lib/action-result';
import { saveSettings, type SettingsInput } from '../../server/actions/identity-actions';
import { getContainer } from '../../server/container';
import { getSession } from '../../server/session';

/** Saves the profile fields from the settings form. */
export async function submitSettings(input: SettingsInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return NOT_SIGNED_IN;

  const result = await saveSettings(getContainer(), session.userId, input);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
