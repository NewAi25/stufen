import { describe, expect, it } from 'vitest';
import type { Gender, ItemInput } from '@stufen/contracts';
import { createGermanPack, defaultContentDir } from '../src/loader';
import { createNounGender } from '../src/rules/gender';

function noun(lemma: string, gender: string | undefined): ItemInput {
  return {
    key: `de:vocab:${lemma.toLowerCase().replace(/\s+/g, '-')}`,
    kind: 'vocab',
    lemma,
    gloss_en: 'test',
    level: 'A1',
    source: 'unverified',
    payload: gender === undefined ? { pos: 'noun' } : { pos: 'noun', gender },
  };
}

describe('createNounGender over the real content/de', () => {
  const items = createGermanPack({ contentDir: defaultContentDir() }).loadItems();
  const nounGender = createNounGender(items);
  const gendered = items.filter(
    (item) => item.kind === 'vocab' && ['m', 'f', 'n'].includes(String(item.payload.gender)),
  );

  it('finds nouns with a gender in the pack', () => {
    expect(gendered.length).toBeGreaterThan(0);
  });

  // A noun may be listed with two genders (der See, die See). Its bare form is
  // then ambiguous, so the bare checks only run for nouns listed once.
  const bareOf = (lemma: string): string => lemma.replace(/^(der|die|das)s+/, '');
  const listedOnce = (lemma: string): boolean =>
    gendered.filter((item) => bareOf(item.lemma).toLowerCase() === bareOf(lemma).toLowerCase())
      .length === 1;

  it('returns the payload gender for every gendered noun as listed', () => {
    for (const item of gendered) {
      if (!listedOnce(item.lemma) && bareOf(item.lemma) === item.lemma) continue;
      expect(nounGender(item.lemma), item.lemma).toBe(item.payload.gender);
      expect(nounGender(`  ${item.lemma}  `), item.lemma).toBe(item.payload.gender);
    }
  });

  it('returns the same gender without the article and in any letter case', () => {
    for (const item of gendered.filter((entry) => listedOnce(entry.lemma))) {
      const bare = bareOf(item.lemma);
      expect(nounGender(bare), bare).toBe(item.payload.gender);
      expect(nounGender(bare.toLowerCase()), bare).toBe(item.payload.gender);
      expect(nounGender(bare.toUpperCase()), bare).toBe(item.payload.gender);
    }
  });

  it('returns undefined for words that are not in the pack', () => {
    expect(nounGender('Quatschwort')).toBeUndefined();
    expect(nounGender('das Quatschwort')).toBeUndefined();
    expect(nounGender('')).toBeUndefined();
  });
});

describe('createNounGender over a small list', () => {
  const nounGender = createNounGender([
    noun('der Tisch', 'm'),
    noun('die Straße', 'f'),
    noun('das Mädchen', 'n'),
    noun('Deutschland', 'n'),
    noun('der See', 'm'),
    noun('die See', 'f'),
    noun('die Leute', undefined),
    noun('das Ding', 'x'),
  ]);

  const cases: [string, Gender | undefined][] = [
    ['der Tisch', 'm'],
    ['Tisch', 'm'],
    ['tisch', 'm'],
    ['den Tisch', 'm'],
    ['einen Tisch', 'm'],
    ['Straße', 'f'],
    ['Strasse', 'f'],
    ['die strasse', 'f'],
    ['Mädchen', 'n'],
    ['Maedchen', 'n'],
    ['Deutschland', 'n'],
    ['der See', 'm'],
    ['die See', 'f'],
    ['See', 'm'],
    ['Leute', undefined],
    ['Ding', undefined],
    ['Stuhl', undefined],
  ];
  it.each(cases)('nounGender("%s") is %s', (lemma, gender) => {
    expect(nounGender(lemma)).toBe(gender);
  });
});
