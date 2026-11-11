import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CEFR_LEVELS } from '@stufen/contracts';
import { createGermanPack, defaultContentDir } from '../src/loader';

const tempDirs: string[] = [];

/** Writes a minimal pack into a fresh temp directory and returns its path. */
function makeTempPack(itemLines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stufen-lang-de-'));
  tempDirs.push(dir);
  const manifest = {
    code: 'de',
    version: '9.9.9',
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
  fs.writeFileSync(path.join(dir, 'items', 'A1.jsonl'), itemLines.join('\n'));
  return dir;
}

function itemLine(slug: string, lemma: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    key: `de:vocab:${slug}`,
    kind: 'vocab',
    lemma,
    gloss_en: slug,
    level: 'A1',
    source: 'unverified',
    payload,
  });
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('defaultContentDir', () => {
  it('points at content/de of this repo', () => {
    const dir = defaultContentDir();
    expect(path.basename(dir)).toBe('de');
    expect(path.basename(path.dirname(dir))).toBe('content');
    expect(fs.existsSync(path.join(dir, 'pack.json'))).toBe(true);
  });
});

describe('createGermanPack over the real content/de', () => {
  const pack = createGermanPack({ contentDir: defaultContentDir() });

  it('reads the manifest', () => {
    const manifest = pack.loadManifest();
    expect(manifest.code).toBe('de');
    expect(pack.code).toBe('de');
    expect(pack.version).toBe(manifest.version);
    expect(pack.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest).not.toHaveProperty('$schema');
  });

  it('loads at least one cando, each with a de key', () => {
    const candos = pack.loadCandos();
    expect(candos.length).toBeGreaterThan(0);
    for (const cando of candos) expect(cando.key.startsWith('de:cando:')).toBe(true);
  });

  it('loads at least one item, each with a payload object', () => {
    const items = pack.loadItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.key.startsWith('de:')).toBe(true);
      expect(typeof item.payload).toBe('object');
    }
  });

  it('loads units with their lessons, every lesson with exercises', () => {
    const units = pack.loadUnits();
    expect(units.length).toBeGreaterThan(0);
    const lessons = units.flatMap((unit) => unit.lessons);
    expect(lessons.length).toBeGreaterThan(0);
    for (const unit of units) {
      expect(unit.lessons.length).toBeGreaterThan(0);
      for (const lesson of unit.lessons) {
        expect(lesson.unit_key).toBe(unit.key);
        expect(lesson.exercises.length).toBeGreaterThan(0);
        expect(lesson).not.toHaveProperty('$schema');
      }
    }
  });

  it('maps the ramp to one immersion mode per level', () => {
    expect(Object.keys(pack.immersionRamp).sort()).toEqual([...CEFR_LEVELS].sort());
    for (const level of CEFR_LEVELS) {
      expect(['en', 'mixed', 'target']).toContain(pack.immersionRamp[level]);
    }
    expect(pack.immersionRamp.A1).toBe('en');
  });

  it('has exam formats with sections and a German voice', () => {
    expect(pack.examFormats.length).toBeGreaterThan(0);
    for (const format of pack.examFormats) expect(format.sections.length).toBeGreaterThan(0);
    expect(pack.tts.locale).toBe('de-DE');
    expect(pack.tts.voiceHint.length).toBeGreaterThan(0);
  });
});

describe('createGermanPack over a temp directory', () => {
  it('skips blank lines and tolerates a pack without candos or units', () => {
    const dir = makeTempPack([itemLine('haus', 'das Haus', { gender: 'n' }), '', '   ', '']);
    const pack = createGermanPack({ contentDir: dir });
    expect(pack.version).toBe('9.9.9');
    expect(pack.loadItems().map((item) => item.lemma)).toEqual(['das Haus']);
    expect(pack.loadCandos()).toEqual([]);
    expect(pack.loadUnits()).toEqual([]);
    expect(pack.immersionRamp.A1).toBe('en');
    expect(pack.immersionRamp.C2).toBe('target');
    expect(pack.tts.locale).toBe('de-DE');
  });

  it('reads lessons in the order unit.json lists them, not in file name order', () => {
    const dir = makeTempPack([]);
    const unitDir = path.join(dir, 'units', 'A1', '01-test');
    fs.mkdirSync(unitDir, { recursive: true });
    const lesson = (name: string): string =>
      JSON.stringify({ key: `de:lesson:${name}`, exercises: [{ key: `de:exercise:${name}` }] });
    fs.writeFileSync(path.join(unitDir, 'lesson-01.json'), lesson('one'));
    fs.writeFileSync(path.join(unitDir, 'lesson-02.json'), lesson('two'));
    fs.writeFileSync(
      path.join(unitDir, 'unit.json'),
      JSON.stringify({ key: 'de:unit:a1-01-test', lessons: ['lesson-02.json', 'lesson-01.json'] }),
    );
    fs.mkdirSync(path.join(dir, 'units', 'notes'));
    const units = createGermanPack({ contentDir: dir }).loadUnits();
    expect(units.map((unit) => unit.key)).toEqual(['de:unit:a1-01-test']);
    const keys = units.flatMap((unit) => unit.lessons.map((entry) => entry.key));
    expect(keys).toEqual(['de:lesson:two', 'de:lesson:one']);
    expect(units[0]?.lessons[0]?.exercises).toHaveLength(1);
  });

  it('fails clearly when a listed lesson file is missing', () => {
    const dir = makeTempPack([]);
    const unitDir = path.join(dir, 'units', 'A1', '01-test');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(
      path.join(unitDir, 'unit.json'),
      JSON.stringify({ lessons: ['lesson-09.json'] }),
    );
    expect(() => createGermanPack({ contentDir: dir }).loadUnits()).toThrow(/lesson-09.json/);
  });

  it('names the file and the line number of a broken jsonl line', () => {
    const good = itemLine('haus', 'das Haus', { gender: 'n' });
    const dir = makeTempPack([good, '', '{"key": "de:vocab:kaputt", ', good]);
    expect(() => createGermanPack({ contentDir: dir }).loadItems()).toThrow(/A1\.jsonl line 3/);
  });

  it('rejects a line that is valid JSON but not an object', () => {
    const dir = makeTempPack([itemLine('haus', 'das Haus', { gender: 'n' }), '[1, 2]']);
    expect(() => createGermanPack({ contentDir: dir })).toThrow(/A1\.jsonl line 2/);
  });

  it('rejects a manifest for another language', () => {
    const dir = makeTempPack([]);
    const file = path.join(dir, 'pack.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"de"', '"nl"'));
    expect(() => createGermanPack({ contentDir: dir })).toThrow(/expected "de"/);
  });
});
