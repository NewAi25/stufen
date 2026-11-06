import 'server-only';

// Onboarding and settings logic, kept free of Next so it can be tested with a
// real container. The 'use server' files next to the pages call these.

import { ProfileNotFoundError } from '@stufen/core-identity';
import type { ActionResult } from '../../lib/action-result';
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  isActiveLanguage,
  isCefrLevel,
  isLanguageCode,
  LANGUAGE_NAMES,
} from '../../lib/learning-options';
import type { Container } from '../container';

export interface OnboardingInput {
  language: string;
  targetLevel: string;
}

export interface SettingsInput {
  displayName: string;
  uiLocale: string;
  timezone: string;
  dailyGoalMinutes: number;
}

/** Interface languages offered today. */
export const UI_LOCALES: readonly string[] = ['en'];

export const DISPLAY_NAME_MAX_LENGTH = 80;

function fail(message: string, field?: string): ActionResult {
  return field === undefined ? { ok: false, message } : { ok: false, field, message };
}

/** Turns an error from a box into a result. Unknown errors are rethrown. */
function fromBoxError(error: unknown, field?: string): ActionResult {
  if (error instanceof RangeError) return fail(error.message, field);
  if (error instanceof ProfileNotFoundError) {
    return fail('Your profile could not be found. Reload the page and try again.');
  }
  throw error;
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Sets the learner's active language and target level. */
export async function completeOnboarding(
  container: Container,
  userId: string,
  input: OnboardingInput,
): Promise<ActionResult> {
  const { language, targetLevel } = input;
  if (!isLanguageCode(language)) return fail('Choose a language.', 'language');
  if (!isActiveLanguage(language)) {
    return fail(`${LANGUAGE_NAMES[language]} is coming soon. Choose German for now.`, 'language');
  }
  if (!isCefrLevel(targetLevel)) return fail('Choose a level from A1 to C2.', 'targetLevel');

  try {
    await container.identity.ensureProfile(userId);
    await container.identity.setActiveLanguage(userId, language, targetLevel);
  } catch (error) {
    return fromBoxError(error);
  }
  return { ok: true };
}

/** Saves the editable profile fields. */
export async function saveSettings(
  container: Container,
  userId: string,
  input: SettingsInput,
): Promise<ActionResult> {
  if (typeof input.displayName !== 'string') {
    return fail('Enter a name, or leave it empty.', 'displayName');
  }
  const name = input.displayName.trim();
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return fail(`Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`, 'displayName');
  }
  if (!UI_LOCALES.includes(input.uiLocale)) {
    return fail('English is the only interface language for now.', 'uiLocale');
  }
  const timezone = typeof input.timezone === 'string' ? input.timezone.trim() : '';
  if (timezone === '' || !isTimezone(timezone)) {
    return fail('Enter a timezone such as Europe/Berlin.', 'timezone');
  }
  const goal = input.dailyGoalMinutes;
  if (!Number.isInteger(goal) || goal < DAILY_GOAL_MIN || goal > DAILY_GOAL_MAX) {
    return fail(
      `Choose a whole number of minutes from ${DAILY_GOAL_MIN} to ${DAILY_GOAL_MAX}.`,
      'dailyGoalMinutes',
    );
  }

  try {
    await container.identity.updateProfile(userId, {
      // A name of only spaces means no name. The profile stores null for that.
      displayName: name === '' ? null : name,
      uiLocale: input.uiLocale,
      timezone,
      dailyGoalMinutes: goal,
    });
  } catch (error) {
    return fromBoxError(error);
  }
  return { ok: true };
}
