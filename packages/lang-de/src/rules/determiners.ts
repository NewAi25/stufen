// Reads a word as a determiner form: which family it belongs to (der, ein,
// kein or a possessive stem) and which cells of the paradigm it can fill.
// classify-error.ts uses this to tell a case slip from a gender slip.

import type { GrammaticalCase, GrammaticalNumber } from '@stufen/contracts';
import { CASES, DEFINITE_ARTICLES, EIN_WORD_ENDINGS, NUMBERS, POSSESSIVE_STEMS } from './articles';

export interface Cell {
  case: GrammaticalCase;
  number: GrammaticalNumber;
}

export interface DeterminerReading {
  /** definite, indefinite, negative, or possessive:<stem>. */
  family: string;
  cells: Cell[];
}

/** Ein word stems with their family. euer is handled apart because it shortens to eur. */
const EIN_WORD_STEMS: readonly (readonly [stem: string, family: string])[] = [
  ['ein', 'indefinite'],
  ['kein', 'negative'],
  ...[...new Set(Object.values(POSSESSIVE_STEMS).map((stem) => stem.toLowerCase()))]
    .filter((stem) => stem !== 'euer')
    .map((stem) => [stem, `possessive:${stem}`] as const),
];

function allCells(): Cell[] {
  return CASES.flatMap((grammaticalCase) =>
    NUMBERS.map((number) => ({ case: grammaticalCase, number })),
  );
}

function einWordCells(ending: string, withPlural: boolean): Cell[] {
  return allCells().filter(
    (cell) =>
      EIN_WORD_ENDINGS[cell.case][cell.number] === ending &&
      (withPlural || cell.number !== 'plural'),
  );
}

/** Reads a lower case word as a determiner, or returns undefined. */
export function readDeterminer(word: string): DeterminerReading | undefined {
  const definite = allCells().filter((cell) => DEFINITE_ARTICLES[cell.case][cell.number] === word);
  if (definite.length > 0) return { family: 'definite', cells: definite };

  for (const [stem, family] of EIN_WORD_STEMS) {
    if (!word.startsWith(stem)) continue;
    const cells = einWordCells(word.slice(stem.length), family !== 'indefinite');
    if (cells.length > 0) return { family, cells };
  }

  // euer keeps its e only without an ending: euer, eure, euren, eurem, eurer, eures.
  if (word === 'euer') return { family: 'possessive:euer', cells: einWordCells('', true) };
  if (word.startsWith('eur') && word.length > 3) {
    const cells = einWordCells(word.slice(3), true);
    if (cells.length > 0) return { family: 'possessive:euer', cells };
  }
  return undefined;
}

/** True for der, ein and kein forms: the words the error type "article" is about. */
export function isArticleFamily(family: string): boolean {
  return family === 'definite' || family === 'indefinite' || family === 'negative';
}
