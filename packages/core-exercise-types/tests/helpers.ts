// Shared test fixtures. No network, no accounts.

import type { ErrorType, GradeContext, LanguageRules } from '@stufen/contracts';

const emptyArticles = { m: '', f: '', n: '', plural: '' };

/**
 * A small stand in for a language pack's rules. normalize lower cases, trims
 * and treats ß as ss. classifyError calls a missing capital letter or a one
 * letter slip spelling, and everything else vocabulary.
 */
export function fakeRules(overrides: Partial<LanguageRules> = {}): LanguageRules {
  return {
    articles: {
      nominative: emptyArticles,
      accusative: emptyArticles,
      dative: emptyArticles,
      genitive: emptyArticles,
    },
    nounGender: () => undefined,
    conjugate: () => undefined,
    normalize: (text) => text.trim().toLowerCase().replaceAll('ß', 'ss'),
    classifyError: (expected, actual): ErrorType[] =>
      Math.abs(expected.length - actual.length) <= 1 && actual.length > 0
        ? ['spelling']
        : ['vocabulary'],
    ...overrides,
  };
}

/** A grade context with the fake rules. */
export function ctxWithRules(overrides: Partial<LanguageRules> = {}): GradeContext {
  return { language: 'de', level: 'A1', languageRules: fakeRules(overrides) };
}

/**
 * A grade context where no language rules are wired. The contract says rules
 * are always there, so this is a deliberate bad input to test the fallback.
 */
export function ctxWithoutRules(): GradeContext {
  return { language: 'de', level: 'A1' } as unknown as GradeContext;
}
