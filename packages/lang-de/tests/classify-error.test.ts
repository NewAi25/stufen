import { describe, expect, it } from 'vitest';
import type { ErrorType, ItemInput } from '@stufen/contracts';
import { classifyError, createClassifyError, editDistance } from '../src/rules/classify-error';
import { readDeterminer } from '../src/rules/determiners';
import { createNounGender } from '../src/rules/gender';

type Pair = [expected: string, actual: string, types: ErrorType[]];

describe('classifyError without a noun lexicon', () => {
  const pairs: Pair[] = [
    // nothing to report
    ['Ich bin Anna.', ' Ich bin  Anna ', []],
    ['Hallo, ich bin Anna', 'Hallo ich bin Anna', []],
    // spelling: capitalisation, umlauts, small slips, spacing
    ['Ich heiße Anna.', 'ich heiße anna', ['spelling']],
    ['das Haus', 'das haus', ['spelling']],
    ['Tschüss', 'Tschuss', ['spelling']],
    ['schön', 'schon', ['spelling']],
    ['Straße', 'Strase', ['spelling']],
    ['Guten Morgen', 'Guten Morgan', ['spelling']],
    ['Ich komme aus Deutschland', 'Ich komme aus Deutschlant', ['spelling']],
    ['Auf Wiedersehen', 'Aufwiedersehen', ['spelling']],
    // gender: an article of another gender in the same case
    ['der Tisch', 'das Tisch', ['gender']],
    ['eine Frau', 'ein Frau', ['gender']],
    ['Das ist die Stadt', 'Das ist der Stadt', ['gender']],
    // case: the same gender, another case form
    ['Ich sehe den Mann', 'Ich sehe der Mann', ['case']],
    ['mit dem Bus', 'mit den Bus', ['case']],
    ['Ich habe einen Hund', 'Ich habe einem Hund', ['case']],
    // article: another article family, or no article
    ['Das ist ein Tisch', 'Das ist der Tisch', ['article']],
    ['Ich habe keinen Hund', 'Ich habe einen Hund', ['article']],
    ['Das ist der Tisch', 'Das ist Tisch', ['article']],
    // word order
    ['Ich komme aus Indien', 'Aus Indien ich komme', ['word_order']],
    ['Heute gehe ich nach Hause', 'Heute ich gehe nach Hause', ['word_order']],
    ['Wie heißen Sie?', 'Heißen Sie wie?', ['word_order']],
    // vocabulary: another word
    ['Ich wohne in Berlin', 'Ich arbeite in Berlin', ['vocabulary']],
    ['Guten Morgen', 'Guten Abend', ['vocabulary']],
    ['Das ist meine Mutter', 'Das ist deine Mutter', ['vocabulary']],
    ['Ich komme aus Berlin', 'Ich komme von Berlin', ['vocabulary']],
    ['Wie geht es dir?', 'Wie geht es mir?', ['vocabulary']],
    // other: verb ending, missing words, nothing written
    ['Ich komme aus Indien', 'Ich kommt aus Indien', ['other']],
    ['Du bist Anna', 'Du bin Anna', ['other']],
    ['Ich wohne in Berlin', 'Ich wohne Berlin', ['other']],
    ['Ich heiße Anna', 'Anna', ['other']],
    ['Hallo', '', ['other']],
    // more than one slip, reported in the order of ERROR_TYPES
    ['Ich sehe den Mann', 'Ich sehe der Man', ['case', 'spelling']],
    ['Das ist der Tisch', 'Das ist das Stuhl', ['gender', 'vocabulary']],
  ];

  it('has at least 25 pairs', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(25);
  });

  it.each(pairs)('expected "%s", got "%s": %j', (expected, actual, types) => {
    expect(classifyError(expected, actual)).toEqual(types);
  });
});

describe('classifyError with the gender of the noun known', () => {
  const noun = (lemma: string, gender: string): ItemInput => ({
    key: `de:vocab:${lemma.replace(/\s+/g, '-').toLowerCase()}`,
    kind: 'vocab',
    lemma,
    gloss_en: 'test',
    level: 'A1',
    source: 'unverified',
    payload: { pos: 'noun', gender },
  });
  const classify = createClassifyError(
    createNounGender([
      noun('der Tisch', 'm'),
      noun('der Hund', 'm'),
      noun('die Frau', 'f'),
      noun('die Stadt', 'f'),
      noun('das Kind', 'n'),
    ]),
  );

  const pairs: Pair[] = [
    // a form the noun's gender does not have: gender
    ['der Tisch', 'die Tisch', ['gender']],
    ['das Kind', 'der Kind', ['gender']],
    ['Das ist mein Hund', 'Das ist meine Hund', ['gender']],
    ['der kleine Tisch', 'das kleine Tisch', ['gender']],
    // a form the noun's gender has in another case: case
    ['mit der Frau', 'mit die Frau', ['case']],
    ['Ich habe einen Hund', 'Ich habe ein Hund', ['case']],
    ['Das ist die Stadt', 'Das ist der Stadt', ['case']],
    ['mit dem Kind', 'mit das Kind', ['case']],
    // a noun the lexicon does not know falls back to the table only reading
    ['der Stuhl', 'das Stuhl', ['gender']],
    ['Ich sehe den Stuhl', 'Ich sehe der Stuhl', ['case']],
  ];
  it.each(pairs)('expected "%s", got "%s": %j', (expected, actual, types) => {
    expect(classify(expected, actual)).toEqual(types);
  });
});

describe('helpers', () => {
  const distances: [string, string, number][] = [
    ['haus', 'haus', 0],
    ['haus', 'hau', 1],
    ['haus', 'maus', 1],
    ['haus', 'huas', 1],
    ['', 'ja', 2],
    ['morgen', 'abend', 5],
  ];
  it.each(distances)('editDistance("%s", "%s") is %i', (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance);
    expect(editDistance(b, a)).toBe(distance);
  });

  const families: [string, string | undefined][] = [
    ['der', 'definite'],
    ['des', 'definite'],
    ['einem', 'indefinite'],
    ['keiner', 'negative'],
    ['meinen', 'possessive:mein'],
    ['ihre', 'possessive:ihr'],
    ['unserem', 'possessive:unser'],
    ['eure', 'possessive:euer'],
    ['euer', 'possessive:euer'],
    ['eins', undefined],
    ['tisch', undefined],
  ];
  it.each(families)('readDeterminer("%s") is in family %s', (word, family) => {
    expect(readDeterminer(word)?.family).toBe(family);
  });

  it('lists every cell a form can fill', () => {
    expect(readDeterminer('den')?.cells).toEqual([
      { case: 'accusative', number: 'm' },
      { case: 'dative', number: 'plural' },
    ]);
    expect(readDeterminer('einen')?.cells).toEqual([{ case: 'accusative', number: 'm' }]);
  });
});
