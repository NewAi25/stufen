import { describe, expect, it } from 'vitest';
import { equalsLenient, equalsStrict, normalize, normalizeStrict } from '../src/rules/normalize';

describe('normalize', () => {
  const cases: [string, string, string][] = [
    ['trims', '  hallo  ', 'hallo'],
    ['collapses spaces', 'ich   bin \t Anna', 'ich bin anna'],
    ['lower cases', 'Guten Morgen', 'guten morgen'],
    ['strips a final full stop', 'Ich heiße Anna.', 'ich heisse anna'],
    ['strips final question and exclamation marks', 'Wie geht es dir?!', 'wie geht es dir'],
    ['strips final punctuation followed by spaces', 'Danke! ', 'danke'],
    ['keeps inner punctuation', 'Hallo, ich bin Anna.', 'hallo, ich bin anna'],
    ['writes ß as ss', 'Straße', 'strasse'],
    ['writes capital ẞ as ss', 'STRAẞE', 'strasse'],
    ['writes ä as ae', 'Mädchen', 'maedchen'],
    ['writes ö as oe', 'schön', 'schoen'],
    ['writes ü as ue', 'Tschüss', 'tschuess'],
    ['folds capital umlauts', 'Österreich', 'oesterreich'],
    ['leaves ae, oe, ue alone', 'Maedchen', 'maedchen'],
    ['returns empty for only punctuation', ' ?! ', ''],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('composes decomposed umlauts to NFC first', () => {
    const decomposed = `scho${String.fromCharCode(0x308)}n`;
    expect(decomposed).not.toBe('schön');
    expect(normalizeStrict(decomposed)).toBe('schön');
    expect(normalize(decomposed)).toBe('schoen');
  });

  it('is idempotent', () => {
    for (const text of ['Ich heiße Anna.', 'Tschüss!', '  Guten   Abend ']) {
      expect(normalize(normalize(text))).toBe(normalize(text));
    }
  });
});

describe('equalsLenient', () => {
  const equal: [string, string][] = [
    ['Straße', 'Strasse'],
    ['Tschüss', 'tschuess'],
    ['Ich heiße Anna.', 'ich heisse anna'],
    ['schön', 'schoen'],
    ['Guten Morgen!', 'guten  morgen'],
    ['Österreich', 'Oesterreich'],
    ['Maße', 'Masse'],
  ];
  it.each(equal)('"%s" equals "%s"', (a, b) => {
    expect(equalsLenient(a, b)).toBe(true);
  });

  const different: [string, string][] = [
    ['schon', 'schön'],
    ['der Mann', 'den Mann'],
    ['Hallo', 'Hallo Anna'],
  ];
  it.each(different)('"%s" differs from "%s"', (a, b) => {
    expect(equalsLenient(a, b)).toBe(false);
  });
});

describe('equalsStrict', () => {
  it('ignores spacing and final punctuation', () => {
    expect(equalsStrict(' Ich  bin Anna. ', 'Ich bin Anna')).toBe(true);
  });

  const different: [string, string][] = [
    ['das Haus', 'das haus'],
    ['Straße', 'Strasse'],
    ['schön', 'schoen'],
    ['Sie', 'sie'],
    ['Tschüss', 'Tschuss'],
  ];
  it.each(different)('"%s" differs from "%s"', (a, b) => {
    expect(equalsStrict(a, b)).toBe(false);
  });
});
