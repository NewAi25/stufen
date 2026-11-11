// @stufen/lang-de
// German language pack: implements LanguagePack over content/de and holds the German rules the graders need.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md or in this box's README. Nothing else in src/ is public.
// Status: in progress. See docs/07-build-sequence.md.

export { createGermanPack, defaultContentDir } from './loader';
export type { GermanPackOptions } from './loader';

export { germanRules, createConjugate } from './rules/german-rules';
export type { Conjugate } from './rules/german-rules';

export {
  ARTICLE_TABLES,
  CASES,
  DEFINITE_ARTICLES,
  EIN_WORD_ENDINGS,
  INDEFINITE_ARTICLES,
  NEGATIVE_ARTICLES,
  NUMBERS,
  POSSESSIVE_STEMS,
  article,
  possessive,
} from './rules/articles';
export type { ArticleKind, ArticleTable, PossessivePerson } from './rules/articles';

export { equalsLenient, equalsStrict, normalize, normalizeStrict } from './rules/normalize';

export { createNounGender } from './rules/gender';
export type { NounGender } from './rules/gender';

export { conjugate, parsePerson, parseTense, participle, splitSeparable } from './rules/conjugate';
export type { SeparableVerb, Tense } from './rules/conjugate';
export {
  IRREGULAR_PRESENT,
  PARTICIPLES,
  PERSONS,
  SEPARABLE_PREFIXES,
  STEM_CHANGES,
} from './rules/verb-tables';
export type { Auxiliary, ParticipleEntry, Person } from './rules/verb-tables';

export { classifyError, createClassifyError } from './rules/classify-error';
export type { ClassifyError } from './rules/classify-error';
