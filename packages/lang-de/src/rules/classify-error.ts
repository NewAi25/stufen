// Names the kind of mistake between an expected answer and a learner answer,
// without AI. The error types and their meaning follow the error type guide in
// docs/10-ai-tutor.md, so rule based and AI graders speak the same language:
//   article     wrong or missing der, ein, kein form
//   case        right article family and gender, wrong case form (dem for den)
//   gender      an article form that the noun's gender does not have (das Tisch)
//   word_order  the same words in another order
//   spelling    small misspelling, missing umlaut, wrong capitalisation
//   vocabulary  a different word
//   other       anything else, such as a wrong verb ending or a missing word
// These are heuristics over two strings. They name the likely error type; they
// do not decide whether an answer is accepted.

import { ERROR_TYPES } from '@stufen/contracts';
import type { ErrorType, Gender } from '@stufen/contracts';
import { isArticleFamily, readDeterminer } from './determiners';
import type { DeterminerReading } from './determiners';
import { normalize, normalizeStrict } from './normalize';

export type ClassifyError = (expected: string, actual: string) => ErrorType[];

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Short words that are words in their own right, so a near miss is not a typo: mein and dein. */
const FUNCTION_WORDS: ReadonlySet<string> = new Set(
  (
    'ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen ' +
    'in an auf aus bei mit nach von zu vor fuer um bis seit im am zum zur vom beim ins ' +
    'wer was wo wie wann warum woher wohin und oder aber denn nicht ja nein hier dort da ' +
    'bin bist ist sind seid habe hast hat habt haben'
  ).split(' '),
);

/** Endings that mark person, number or adjective agreement. */
const INFLECTION_ENDINGS: readonly string[] = [
  '',
  'e',
  'st',
  't',
  'en',
  'est',
  'et',
  'n',
  'er',
  'em',
  'es',
];

/** Words of a text without surrounding punctuation, case kept. */
function tokenize(text: string): string[] {
  return normalizeStrict(text)
    .split(' ')
    .map((token) => token.replace(EDGE_PUNCTUATION, ''))
    .filter((token) => token !== '');
}

/** Edit distance counting insert, delete, replace and swap of neighbours as one step each. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number): number => table[i]?.[j] ?? 0;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      const row = table[i];
      if (row !== undefined) row[j] = best;
    }
  }
  return at(a.length, b.length);
}

/** How many edits still count as a slip of the pen for a word of this length. */
function spellingTolerance(length: number): number {
  if (length <= 3) return 0;
  return length <= 7 ? 1 : 2;
}

function isSpellingSlip(expected: string, actual: string): boolean {
  if (FUNCTION_WORDS.has(actual) || readDeterminer(actual) !== undefined) return false;
  return editDistance(expected, actual) <= spellingTolerance(expected.length);
}

/** True when two words share a stem and differ only in an inflection ending: komme, kommt. */
function differsByEnding(expected: string, actual: string): boolean {
  return INFLECTION_ENDINGS.some((ending) => {
    if (!expected.endsWith(ending)) return false;
    const stem = expected.slice(0, expected.length - ending.length);
    if (stem.length < 2 || !actual.startsWith(stem)) return false;
    const other = actual.slice(stem.length);
    return other !== ending && INFLECTION_ENDINGS.includes(other);
  });
}

const GENDERS: readonly Gender[] = ['m', 'f', 'n'];

/** Names the slip between two different determiner forms in front of the same noun. */
function classifyDeterminers(
  expected: DeterminerReading,
  actual: DeterminerReading,
  gender: Gender | undefined,
): ErrorType {
  if (expected.family !== actual.family) {
    const bothArticles = isArticleFamily(expected.family) && isArticleFamily(actual.family);
    return bothArticles ? 'article' : 'vocabulary';
  }
  if (gender !== undefined && expected.cells.some((cell) => cell.number === gender)) {
    // The noun's gender is known: a form that this gender has in another case is a
    // case slip, a form it does not have at all is a gender slip.
    return actual.cells.some((cell) => cell.number === gender) ? 'case' : 'gender';
  }
  const genderSlip = expected.cells.some((mine) =>
    actual.cells.some(
      (theirs) =>
        theirs.case === mine.case &&
        theirs.number !== mine.number &&
        GENDERS.some((g) => g === mine.number) &&
        GENDERS.some((g) => g === theirs.number),
    ),
  );
  if (genderSlip) return 'gender';
  const caseSlip = expected.cells.some((mine) =>
    actual.cells.some((theirs) => theirs.number === mine.number && theirs.case !== mine.case),
  );
  return caseSlip ? 'case' : 'article';
}

/** Gender of the first capitalised word after position `index`, looking at most three words ahead. */
function genderOfNounAfter(
  tokens: readonly string[],
  index: number,
  nounGender: ((lemma: string) => Gender | undefined) | undefined,
): Gender | undefined {
  if (nounGender === undefined) return undefined;
  for (const token of tokens.slice(index + 1, index + 4)) {
    if (token !== token.toLocaleLowerCase('de-DE')) return nounGender(token);
  }
  return undefined;
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, index) => word === b[index]);
}

function withoutArticles(words: readonly string[]): string[] {
  return words.filter((word) => {
    const reading = readDeterminer(word);
    return reading === undefined || !isArticleFamily(reading.family);
  });
}

/** Answers of different length: a missing article, a spacing slip (Gutenmorgen), or something else. */
function classifyUnequalLength(expected: readonly string[], actual: readonly string[]): ErrorType {
  if (sameWords(withoutArticles(expected), withoutArticles(actual))) return 'article';
  return expected.join('') === actual.join('') ? 'spelling' : 'other';
}

/**
 * Builds classifyError. With `nounGender` (from the pack's items) an article
 * slip in front of a known noun is told apart more reliably: a form the noun's
 * gender has in another case is `case`, a form it never has is `gender`.
 */
export function createClassifyError(
  nounGender?: (lemma: string) => Gender | undefined,
): ClassifyError {
  return (expected: string, actual: string): ErrorType[] => {
    const expectedTokens = tokenize(expected);
    const actualTokens = tokenize(actual);
    if (sameWords(expectedTokens, actualTokens)) return [];

    const expectedWords = expectedTokens.map(normalize);
    const actualWords = actualTokens.map(normalize);
    // Only capitalisation, ß or ss, or umlaut spelling differs.
    if (sameWords(expectedWords, actualWords)) return ['spelling'];
    if (expectedWords.length !== actualWords.length) {
      return [classifyUnequalLength(expectedWords, actualWords)];
    }
    if (sameWords([...expectedWords].sort(), [...actualWords].sort())) return ['word_order'];

    const found = new Set<ErrorType>();
    expectedWords.forEach((word, index) => {
      const other = actualWords[index];
      const token = expectedTokens[index];
      const otherToken = actualTokens[index];
      if (other === undefined || token === undefined || otherToken === undefined) return;
      if (word === other) return;
      const expectedReading = readDeterminer(word);
      const actualReading = readDeterminer(other);
      if (expectedReading !== undefined && actualReading !== undefined) {
        const gender = genderOfNounAfter(expectedTokens, index, nounGender);
        found.add(classifyDeterminers(expectedReading, actualReading, gender));
        return;
      }
      // A capital inside the sentence marks a noun; nouns do not take verb endings.
      // Endings are compared on the real spelling, so that schön and schon do not
      // look like schoen with another ending.
      const lower = token.toLocaleLowerCase('de-DE');
      const nounLike = index > 0 && token !== lower;
      const endingOnly = differsByEnding(lower, otherToken.toLocaleLowerCase('de-DE'));
      if (!nounLike && endingOnly) found.add('other');
      else if (isSpellingSlip(word, other)) found.add('spelling');
      else found.add('vocabulary');
    });
    return found.size === 0 ? ['other'] : ERROR_TYPES.filter((type) => found.has(type));
  };
}

/** classifyError without a noun lexicon. germanRules(items) builds one that knows the pack's nouns. */
export const classifyError: ClassifyError = createClassifyError();
