// Noun gender lookup built from the pack's own vocab items. German gender is
// lexical, so it is data: an item states it in payload.gender and nothing here
// guesses it from word endings.

import type { Gender, ItemInput } from '@stufen/contracts';
import { normalize } from './normalize';

export type NounGender = (lemma: string) => Gender | undefined;

const GENDERS: readonly Gender[] = ['m', 'f', 'n'];

/** Gender signalled by a nominative singular definite article in front of a lemma. */
const ARTICLE_GENDER: Record<string, Gender> = { der: 'm', die: 'f', das: 'n' };

/** Articles a caller may leave in front of the noun. They are dropped before lookup. */
const LEADING_ARTICLE = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+/u;

function isGender(value: unknown): value is Gender {
  return GENDERS.some((gender) => gender === value);
}

/** Splits "die Stadt" into the article and the lookup key "stadt". */
function splitLemma(lemma: string): { article: string | undefined; key: string } {
  const text = normalize(lemma);
  const match = LEADING_ARTICLE.exec(text);
  if (match === null) return { article: undefined, key: text };
  return { article: match[1], key: text.slice(match[0].length) };
}

/**
 * Builds `nounGender` from vocab items that carry payload.gender. The lookup is
 * case insensitive, treats ß and ss and umlaut spellings as equal, and accepts
 * the lemma with or without an article. A noun listed with two genders (der
 * See, die See) answers with the gender of the article given, else the first
 * one listed.
 */
export function createNounGender(items: readonly ItemInput[]): NounGender {
  const lookup = new Map<string, Gender[]>();
  for (const item of items) {
    if (item.kind !== 'vocab') continue;
    const gender = item.payload.gender;
    if (!isGender(gender)) continue;
    const { key } = splitLemma(item.lemma);
    if (key === '') continue;
    const known = lookup.get(key) ?? [];
    if (!known.includes(gender)) known.push(gender);
    lookup.set(key, known);
  }

  return (lemma: string): Gender | undefined => {
    const { article, key } = splitLemma(lemma);
    const genders = lookup.get(key);
    if (genders === undefined) return undefined;
    const hinted = article === undefined ? undefined : ARTICLE_GENDER[article];
    if (hinted !== undefined && genders.includes(hinted)) return hinted;
    return genders[0];
  };
}
