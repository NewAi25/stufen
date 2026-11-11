// German article tables as data. Standard paradigm, as in any reference
// grammar (for example Duden, Die Grammatik). Rows are cases, columns are the
// three genders in the singular plus one plural column, since German plural
// articles do not vary by gender.

import type { GrammaticalCase, GrammaticalNumber } from '@stufen/contracts';

export type ArticleTable = Record<GrammaticalCase, Record<GrammaticalNumber, string>>;
export type ArticleKind = 'definite' | 'indefinite' | 'negative';

export const CASES: readonly GrammaticalCase[] = ['nominative', 'accusative', 'dative', 'genitive'];
export const NUMBERS: readonly GrammaticalNumber[] = ['m', 'f', 'n', 'plural'];

/** der, die, das. */
export const DEFINITE_ARTICLES: ArticleTable = {
  nominative: { m: 'der', f: 'die', n: 'das', plural: 'die' },
  accusative: { m: 'den', f: 'die', n: 'das', plural: 'die' },
  dative: { m: 'dem', f: 'der', n: 'dem', plural: 'den' },
  genitive: { m: 'des', f: 'der', n: 'des', plural: 'der' },
};

/** ein, eine. The plural has no indefinite article, so the plural cells are empty strings. */
export const INDEFINITE_ARTICLES: ArticleTable = {
  nominative: { m: 'ein', f: 'eine', n: 'ein', plural: '' },
  accusative: { m: 'einen', f: 'eine', n: 'ein', plural: '' },
  dative: { m: 'einem', f: 'einer', n: 'einem', plural: '' },
  genitive: { m: 'eines', f: 'einer', n: 'eines', plural: '' },
};

/** kein, keine. Declines like ein in the singular and has plural forms. */
export const NEGATIVE_ARTICLES: ArticleTable = {
  nominative: { m: 'kein', f: 'keine', n: 'kein', plural: 'keine' },
  accusative: { m: 'keinen', f: 'keine', n: 'kein', plural: 'keine' },
  dative: { m: 'keinem', f: 'keiner', n: 'keinem', plural: 'keinen' },
  genitive: { m: 'keines', f: 'keiner', n: 'keines', plural: 'keiner' },
};

export const ARTICLE_TABLES: Record<ArticleKind, ArticleTable> = {
  definite: DEFINITE_ARTICLES,
  indefinite: INDEFINITE_ARTICLES,
  negative: NEGATIVE_ARTICLES,
};

/** The article for a case and a gender or plural. Empty string for the indefinite plural. */
export function article(
  kind: ArticleKind,
  grammaticalCase: GrammaticalCase,
  genderOrPlural: GrammaticalNumber,
): string {
  return ARTICLE_TABLES[kind][grammaticalCase][genderOrPlural];
}

export type PossessivePerson =
  'ich' | 'du' | 'er' | 'sie' | 'es' | 'wir' | 'ihr' | 'sie_plural' | 'Sie';

/** Possessive stems by owner. They take the endings of kein. */
export const POSSESSIVE_STEMS: Record<PossessivePerson, string> = {
  ich: 'mein',
  du: 'dein',
  er: 'sein',
  sie: 'ihr',
  es: 'sein',
  wir: 'unser',
  ihr: 'euer',
  sie_plural: 'ihr',
  Sie: 'Ihr',
};

/** Endings shared by kein and the possessives (the ein word endings). */
export const EIN_WORD_ENDINGS: ArticleTable = {
  nominative: { m: '', f: 'e', n: '', plural: 'e' },
  accusative: { m: 'en', f: 'e', n: '', plural: 'e' },
  dative: { m: 'em', f: 'er', n: 'em', plural: 'en' },
  genitive: { m: 'es', f: 'er', n: 'es', plural: 'er' },
};

/** Possessive article, for example possessive('ich', 'accusative', 'm') is meinen. */
export function possessive(
  person: PossessivePerson,
  grammaticalCase: GrammaticalCase,
  genderOrPlural: GrammaticalNumber,
): string {
  const stem = POSSESSIVE_STEMS[person];
  const ending = EIN_WORD_ENDINGS[grammaticalCase][genderOrPlural];
  // euer drops its second e before an ending: eure, euren, eurem, eurer, eures.
  if (stem === 'euer' && ending !== '') return `eur${ending}`;
  return `${stem}${ending}`;
}
