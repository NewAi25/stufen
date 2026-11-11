import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ItemInput } from '@stufen/contracts';
import * as langDe from '../src/index';
import {
  DEFINITE_ARTICLES,
  PERSONS,
  conjugate,
  createGermanPack,
  defaultContentDir,
  germanRules,
  participle,
} from '../src/index';

function vocab(lemma: string, payload: Record<string, unknown>): ItemInput {
  return {
    key: `de:vocab:${lemma.replace(/\s+/g, '-').toLowerCase()}`,
    kind: 'vocab',
    lemma,
    gloss_en: 'test',
    level: 'A1',
    source: 'unverified',
    payload,
  };
}

describe('public surface', () => {
  const names = [
    'createGermanPack',
    'defaultContentDir',
    'germanRules',
    'article',
    'possessive',
    'normalize',
    'equalsLenient',
    'equalsStrict',
    'createNounGender',
    'conjugate',
    'participle',
    'splitSeparable',
    'classifyError',
    'createClassifyError',
  ] as const;
  it.each(names)('exports the function %s', (name) => {
    expect(typeof langDe[name]).toBe('function');
  });

  const tables = [
    'DEFINITE_ARTICLES',
    'INDEFINITE_ARTICLES',
    'NEGATIVE_ARTICLES',
    'POSSESSIVE_STEMS',
    'IRREGULAR_PRESENT',
    'STEM_CHANGES',
    'PARTICIPLES',
    'SEPARABLE_PREFIXES',
  ] as const;
  it.each(tables)('exports the table %s', (name) => {
    expect(typeof langDe[name]).toBe('object');
  });
});

describe('germanRules', () => {
  const rules = germanRules([
    vocab('der Tisch', { pos: 'noun', gender: 'm' }),
    vocab('die Frau', { pos: 'noun', gender: 'f' }),
    vocab('backen', { pos: 'verb', forms: { '2sg': 'bäckst', '3sg': 'bäckt' } }),
  ]);

  it('carries the definite article table', () => {
    expect(rules.articles).toBe(DEFINITE_ARTICLES);
    expect(rules.articles.dative.plural).toBe('den');
  });

  it('knows the gender of the nouns it was given', () => {
    expect(rules.nounGender('Tisch')).toBe('m');
    expect(rules.nounGender('die Frau')).toBe('f');
    expect(rules.nounGender('Stuhl')).toBeUndefined();
  });

  it('conjugates by rule and lets listed pack forms win', () => {
    expect(rules.conjugate('fahren', 'du', 'present')).toBe('fährst');
    expect(rules.conjugate('aufstehen', 'ich', 'present')).toBe('stehe auf');
    expect(rules.conjugate('fahren', 'wir', 'perfekt')).toBe('sind gefahren');
    expect(rules.conjugate('backen', 'du', 'present')).toBe('bäckst');
    expect(rules.conjugate('backen', 'ich', 'present')).toBe('backe');
    expect(rules.conjugate('backen', 'du', 'futur')).toBeUndefined();
  });

  it('normalises and classifies with the noun lexicon', () => {
    expect(rules.normalize('Ich heiße Anna.')).toBe('ich heisse anna');
    expect(rules.classifyError('mit der Frau', 'mit die Frau')).toEqual(['case']);
    expect(rules.classifyError('der Tisch', 'die Tisch')).toEqual(['gender']);
    expect(rules.classifyError('der Tisch', 'der Tisch')).toEqual([]);
  });
});

describe('the pack returned by createGermanPack', () => {
  const pack = createGermanPack({ contentDir: defaultContentDir() });
  const items = pack.loadItems();
  const verbs = items.filter((item) => item.kind === 'vocab' && item.payload.pos === 'verb');

  it('has rules assembled from its own items', () => {
    const gendered = items.filter((item) => ['m', 'f', 'n'].includes(String(item.payload.gender)));
    expect(gendered.length).toBeGreaterThan(0);
    const listedOnce = gendered.filter(
      (item) => gendered.filter((other) => other.lemma === item.lemma).length === 1,
    );
    for (const item of listedOnce) {
      expect(pack.rules.nounGender(item.lemma), item.lemma).toBe(item.payload.gender);
    }
    expect(pack.rules.articles.nominative.m).toBe('der');
    expect(pack.rules.normalize('Tschüss!')).toBe('tschuess');
    expect(pack.rules.conjugate('sein', 'ich', 'present')).toBe('bin');
    expect(pack.rules.classifyError('Guten Morgen', 'Guten Abend')).toEqual(['vocabulary']);
  });

  // The content states present forms for its verbs. The rule engine has to
  // agree with every one of them. A failure here names a verb that must be
  // added to src/rules/verb-tables.ts, or a form in content/de that is wrong.
  it('conjugates every verb of the pack the way the content states it', () => {
    const mismatches: string[] = [];
    for (const item of verbs) {
      const forms = item.payload.forms;
      if (typeof forms !== 'object' || forms === null) continue;
      const stated = forms as Record<string, unknown>;
      for (const person of PERSONS) {
        const form = stated[person];
        if (typeof form !== 'string') continue;
        const byRule = conjugate(item.lemma, person, 'present');
        if (byRule !== form)
          mismatches.push(`${item.lemma} ${person}: rule ${byRule}, pack ${form}`);
        expect(pack.rules.conjugate(item.lemma, person, 'present')).toBe(form);
      }
      const listed = participle(item.lemma);
      const statedParticiple = stated.past_participle;
      if (listed !== undefined && typeof statedParticiple === 'string') {
        if (listed.participle !== statedParticiple) {
          mismatches.push(
            `${item.lemma} participle: rule ${listed.participle}, pack ${statedParticiple}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('a pack in a temp directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stufen-lang-de-rules-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('builds its rules from the items in that directory', () => {
    const manifest = {
      code: 'de',
      version: '1.2.3',
      name: 'German',
      name_native: 'Deutsch',
      levels: ['A1'],
      sources: [],
      checksum: 'pending',
    };
    fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, 'ramp.json'), JSON.stringify({ A1: { instructions: 'en' } }));
    fs.writeFileSync(path.join(dir, 'exam-formats.json'), '[]');
    fs.mkdirSync(path.join(dir, 'items'));
    const line = JSON.stringify(vocab('das Fenster', { pos: 'noun', gender: 'n' }));
    fs.writeFileSync(path.join(dir, 'items', 'A1.jsonl'), `${line}\n`);

    const pack = createGermanPack({ contentDir: dir });
    expect(pack.rules.nounGender('Fenster')).toBe('n');
    expect(pack.rules.nounGender('Tisch')).toBeUndefined();
    expect(pack.rules.classifyError('das Fenster', 'der Fenster')).toEqual(['gender']);
  });
});
