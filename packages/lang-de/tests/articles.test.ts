import { describe, expect, it } from 'vitest';
import type { GrammaticalCase, GrammaticalNumber } from '@stufen/contracts';
import {
  ARTICLE_TABLES,
  CASES,
  NUMBERS,
  POSSESSIVE_STEMS,
  article,
  possessive,
} from '../src/rules/articles';
import type { ArticleKind, PossessivePerson } from '../src/rules/articles';

// Each row: case, then masculine, feminine, neuter, plural. Written out by hand
// from the standard paradigm so the test does not copy the table under test.
type Row = [GrammaticalCase, string, string, string, string];

const EXPECTED: Record<ArticleKind, Row[]> = {
  definite: [
    ['nominative', 'der', 'die', 'das', 'die'],
    ['accusative', 'den', 'die', 'das', 'die'],
    ['dative', 'dem', 'der', 'dem', 'den'],
    ['genitive', 'des', 'der', 'des', 'der'],
  ],
  indefinite: [
    ['nominative', 'ein', 'eine', 'ein', ''],
    ['accusative', 'einen', 'eine', 'ein', ''],
    ['dative', 'einem', 'einer', 'einem', ''],
    ['genitive', 'eines', 'einer', 'eines', ''],
  ],
  negative: [
    ['nominative', 'kein', 'keine', 'kein', 'keine'],
    ['accusative', 'keinen', 'keine', 'kein', 'keine'],
    ['dative', 'keinem', 'keiner', 'keinem', 'keinen'],
    ['genitive', 'keines', 'keiner', 'keines', 'keiner'],
  ],
};

function cells(rows: Row[]): [GrammaticalCase, GrammaticalNumber, string][] {
  return rows.flatMap(([grammaticalCase, m, f, n, plural]) => [
    [grammaticalCase, 'm', m] as [GrammaticalCase, GrammaticalNumber, string],
    [grammaticalCase, 'f', f] as [GrammaticalCase, GrammaticalNumber, string],
    [grammaticalCase, 'n', n] as [GrammaticalCase, GrammaticalNumber, string],
    [grammaticalCase, 'plural', plural] as [GrammaticalCase, GrammaticalNumber, string],
  ]);
}

describe('article tables', () => {
  for (const kind of ['definite', 'indefinite', 'negative'] as const) {
    it.each(cells(EXPECTED[kind]))(`${kind} %s %s is "%s"`, (grammaticalCase, number, form) => {
      expect(article(kind, grammaticalCase, number)).toBe(form);
      expect(ARTICLE_TABLES[kind][grammaticalCase][number]).toBe(form);
    });
  }

  it('covers four cases and four columns in every table', () => {
    expect(CASES).toHaveLength(4);
    expect(NUMBERS).toHaveLength(4);
    for (const table of Object.values(ARTICLE_TABLES)) {
      expect(Object.keys(table).sort()).toEqual([...CASES].sort());
      for (const row of Object.values(table)) {
        expect(Object.keys(row).sort()).toEqual([...NUMBERS].sort());
      }
    }
  });
});

describe('possessives', () => {
  const stems: [PossessivePerson, string][] = [
    ['ich', 'mein'],
    ['du', 'dein'],
    ['er', 'sein'],
    ['sie', 'ihr'],
    ['es', 'sein'],
    ['wir', 'unser'],
    ['ihr', 'euer'],
    ['sie_plural', 'ihr'],
    ['Sie', 'Ihr'],
  ];
  it.each(stems)('stem for %s is %s', (person, stem) => {
    expect(POSSESSIVE_STEMS[person]).toBe(stem);
    expect(possessive(person, 'nominative', 'm')).toBe(stem);
  });

  const meinRows: Row[] = [
    ['nominative', 'mein', 'meine', 'mein', 'meine'],
    ['accusative', 'meinen', 'meine', 'mein', 'meine'],
    ['dative', 'meinem', 'meiner', 'meinem', 'meinen'],
    ['genitive', 'meines', 'meiner', 'meines', 'meiner'],
  ];
  it.each(cells(meinRows))('mein %s %s is "%s"', (grammaticalCase, number, form) => {
    expect(possessive('ich', grammaticalCase, number)).toBe(form);
  });

  const euerRows: Row[] = [
    ['nominative', 'euer', 'eure', 'euer', 'eure'],
    ['accusative', 'euren', 'eure', 'euer', 'eure'],
    ['dative', 'eurem', 'eurer', 'eurem', 'euren'],
    ['genitive', 'eures', 'eurer', 'eures', 'eurer'],
  ];
  it.each(cells(euerRows))('euer %s %s is "%s"', (grammaticalCase, number, form) => {
    expect(possessive('ihr', grammaticalCase, number)).toBe(form);
  });

  it('declines unser, Ihr and ihr with full endings', () => {
    expect(possessive('wir', 'accusative', 'm')).toBe('unseren');
    expect(possessive('wir', 'nominative', 'f')).toBe('unsere');
    expect(possessive('Sie', 'dative', 'f')).toBe('Ihrer');
    expect(possessive('sie', 'accusative', 'm')).toBe('ihren');
    expect(possessive('sie_plural', 'dative', 'plural')).toBe('ihren');
  });
});
