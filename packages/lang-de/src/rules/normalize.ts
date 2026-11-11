// Text normalisation for comparing learner answers with expected answers.
//
// Lenient compare forgives what a learner without a German keyboard cannot
// type: ss for ß and ae, oe, ue for ä, ö, ü. It also forgives capitalisation
// and a missing full stop. Strict compare keeps case and umlauts, because
// German nouns are capitalised and "schon" and "schön" are different words.

const FINAL_PUNCTUATION = /[\s.!?…,;:]+$/u;
const WHITESPACE = /\s+/gu;

const LENIENT_FOLDS: readonly (readonly [RegExp, string])[] = [
  [/ß/g, 'ss'],
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
];

/** Trims, collapses whitespace, composes to NFC and drops final punctuation. Keeps case and umlauts. */
export function normalizeStrict(text: string): string {
  return text
    .normalize('NFC')
    .replace(WHITESPACE, ' ')
    .trim()
    .replace(FINAL_PUNCTUATION, '')
    .trim();
}

/**
 * Lenient form of a text: the strict form, lower cased with German rules, with
 * ß written as ss and ä, ö, ü written as ae, oe, ue. Two texts that differ only
 * in those respects normalise to the same string.
 */
export function normalize(text: string): string {
  let result = normalizeStrict(text).toLocaleLowerCase('de-DE');
  for (const [pattern, replacement] of LENIENT_FOLDS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** True when the texts match apart from case, final punctuation, spacing, ß or ss, and umlaut spelling. */
export function equalsLenient(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

/** True when the texts match apart from spacing and final punctuation. Case and umlauts matter. */
export function equalsStrict(a: string, b: string): boolean {
  return normalizeStrict(a) === normalizeStrict(b);
}
