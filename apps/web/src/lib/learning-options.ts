// What the onboarding and settings screens offer. Shared by server and client
// code, so it lives outside src/server.

import { CEFR_LEVELS, LANGUAGE_CODES } from '@stufen/contracts';
import type { CefrLevel, LanguageCode } from '@stufen/contracts';

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  de: 'German',
  nl: 'Dutch',
  fr: 'French',
};

/** Languages a learner can start today. The others are shown as coming soon. */
export const ACTIVE_LANGUAGES: readonly LanguageCode[] = ['de'];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return (LANGUAGE_CODES as readonly unknown[]).includes(value);
}

export function isCefrLevel(value: unknown): value is CefrLevel {
  return (CEFR_LEVELS as readonly unknown[]).includes(value);
}

export function isActiveLanguage(value: LanguageCode): boolean {
  return ACTIVE_LANGUAGES.includes(value);
}

/** One plain line per level, shortened from docs/14-levels-in-real-life.md. */
export const LEVEL_MEANINGS: Record<CefrLevel, string> = {
  A1: 'Use everyday phrases, introduce yourself and get by when people speak slowly.',
  A2: 'Handle routine tasks such as shopping, and describe your background in simple terms.',
  B1: 'Deal with most travel situations and talk about experiences, plans and opinions.',
  B2: 'Follow complex texts and talk with native speakers fluently, without strain.',
  C1: 'Use the language flexibly for social, academic and professional purposes.',
  C2: 'Understand almost everything with ease and express fine shades of meaning.',
};

export const DAILY_GOAL_MIN = 5;
export const DAILY_GOAL_MAX = 120;
