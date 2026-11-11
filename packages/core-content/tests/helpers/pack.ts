// Test packs. `makePack` builds a small valid LanguagePack in code; a test
// breaks one thing in it and looks at the report. `loadGermanPackFromDisk`
// reads the real content/de so the rules run over real content too. It reads
// the files itself: a core box never imports a language box.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CandoInput,
  ExerciseInput,
  ItemInput,
  LanguageCode,
  LanguagePack,
  LanguageRules,
  LessonInput,
  PackManifest,
  UnitInput,
} from '@stufen/contracts';

/** The data of one pack, as plain values a test may change before wrapping them. */
export interface PackData {
  manifest: PackManifest;
  candos: CandoInput[];
  items: ItemInput[];
  units: UnitInput[];
}

const ARTICLES = { m: '', f: '', n: '', plural: '' };

/** Rules that know nothing. core-content never calls them. */
export const stubRules: LanguageRules = {
  articles: { nominative: ARTICLES, accusative: ARTICLES, dative: ARTICLES, genitive: ARTICLES },
  nounGender: () => undefined,
  conjugate: () => undefined,
  normalize: (text) => text,
  classifyError: () => [],
};

function cando(code: string, skill: CandoInput['skill']): CandoInput {
  return {
    key: `nl:cando:${code}`,
    code,
    level: 'A1',
    skill,
    text_en: `Can do ${code}.`,
    source: 'unverified',
  };
}

function item(slug: string, kind: ItemInput['kind'] = 'vocab'): ItemInput {
  return {
    key: `nl:${kind}:${slug}`,
    kind,
    lemma: slug,
    gloss_en: `gloss of ${slug}`,
    level: 'A1',
    source: 'unverified',
    payload: { pos: 'interjection', examples: [{ text: slug, gloss_en: slug }] },
  };
}

function exercise(
  lessonNumber: string,
  ordinal: number,
  type: ExerciseInput['type'],
  candoIds: string[],
  itemIds: string[],
): ExerciseInput {
  return {
    key: `nl:exercise:${lessonNumber}-0${ordinal}`,
    ordinal,
    type,
    skill: 'vocabulary',
    cando_ids: candoIds,
    item_ids: itemIds,
    payload: { front: 'hallo', back: 'hello' },
  };
}

function lesson(
  unitKey: string,
  unitNumber: string,
  ordinal: number,
  slug: string,
  candoIds: string[],
  exercises: ExerciseInput[],
): LessonInput {
  return {
    key: `nl:lesson:${unitNumber}-0${ordinal}`,
    unit_key: unitKey,
    ordinal,
    slug,
    title: `Les ${ordinal}`,
    title_en: `Lesson ${ordinal}`,
    kind: 'core',
    estimated_minutes: 10,
    cando_ids: candoIds,
    exercises,
  };
}

const VOC = 'nl:cando:A1.VOC.01';
const LIS = 'nl:cando:A1.LIS.01';
const REA = 'nl:cando:A1.REA.01';
const HALLO = 'nl:vocab:hallo';
const DAG = 'nl:vocab:dag';
const JA = 'nl:vocab:ja';
const IK_HEET = 'nl:chunk:ik-heet';

/**
 * A valid Dutch pack: 3 descriptors, 4 items, 2 units, 3 lessons, 4 exercises.
 * It validates with no error and no warning. Lessons and exercises of the
 * first unit are listed out of ordinal order on purpose. A new copy per call.
 */
export function makePackData(): PackData {
  const unit1 = 'nl:unit:a1-01-hallo';
  const unit2 = 'nl:unit:a1-02-familie';
  return {
    manifest: {
      code: 'nl',
      version: '0.1.0',
      name: 'Dutch',
      name_native: 'Nederlands',
      levels: ['A1'],
      sources: [],
      checksum: 'sha256:fixture',
    },
    candos: [
      cando('A1.VOC.01', 'vocabulary'),
      cando('A1.LIS.01', 'listening'),
      cando('A1.REA.01', 'reading'),
    ],
    items: [item('hallo'), item('dag'), item('ja'), item('ik-heet', 'chunk')],
    units: [
      {
        key: unit1,
        level: 'A1',
        ordinal: 1,
        slug: 'hallo',
        title: 'Hallo',
        title_en: 'Hello',
        description: 'Greetings.',
        theme: 'personal identification',
        lessons: [
          lesson(
            unit1,
            'a1-01',
            2,
            'ik-heet',
            [VOC, REA],
            [exercise('a1-01-02', 1, 'cloze', [REA], [IK_HEET])],
          ),
          lesson(
            unit1,
            'a1-01',
            1,
            'hallo-dag',
            [VOC, LIS],
            [
              exercise('a1-01-01', 2, 'multiple_choice', [LIS], [DAG, HALLO]),
              exercise('a1-01-01', 1, 'flashcard', [VOC], [HALLO]),
            ],
          ),
        ],
      },
      {
        key: unit2,
        level: 'A1',
        ordinal: 2,
        slug: 'familie',
        title: 'Familie',
        title_en: 'Family',
        theme: 'family',
        lessons: [
          lesson(
            unit2,
            'a1-02',
            1,
            'ja-nee',
            [VOC],
            [exercise('a1-02-01', 1, 'flashcard', [VOC], [JA])],
          ),
        ],
      },
    ],
  };
}

/** Wraps pack data in the LanguagePack interface. Loaders hand out copies. */
export function toPack(data: PackData, code: LanguageCode = data.manifest.code): LanguagePack {
  return {
    code,
    version: data.manifest.version,
    loadManifest: () => structuredClone(data.manifest),
    loadCandos: () => structuredClone(data.candos),
    loadItems: () => structuredClone(data.items),
    loadUnits: () => structuredClone(data.units),
    rules: stubRules,
    immersionRamp: { A1: 'en', A2: 'en', B1: 'mixed', B2: 'target', C1: 'target', C2: 'target' },
    examFormats: [],
    tts: { voiceHint: 'neutral', locale: `${code}-test` },
  };
}

/** The valid fixture, with `change` applied to its data first. */
export function makePack(change?: (data: PackData) => void): LanguagePack {
  const data = makePackData();
  change?.(data);
  return toPack(data);
}

// ---------------------------------------------------------------
// The real German pack, read from content/de
// ---------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
/** content/de of this repo, seen from packages/core-content/tests/helpers. */
export const GERMAN_CONTENT_DIR = path.resolve(here, '..', '..', '..', '..', 'content', 'de');

function readText(file: string): string {
  const text = fs.readFileSync(file, 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readJson(file: string): unknown {
  return JSON.parse(readText(file));
}

/** Drops the editor only `$schema` key. */
function record(value: unknown, file: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${file} must hold a JSON object`);
  }
  const { $schema: _schema, ...rest } = value as Record<string, unknown>;
  void _schema;
  return rest;
}

function names(dir: string, kind: 'file' | 'dir', extension = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => (kind === 'dir' ? entry.isDirectory() : entry.isFile()))
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(extension))
    .sort();
}

function readUnit(unitDir: string): UnitInput {
  const unitFile = path.join(unitDir, 'unit.json');
  const unit = record(readJson(unitFile), unitFile);
  const files = Array.isArray(unit.lessons) ? unit.lessons : [];
  const lessons = files.map((name) => {
    const file = path.join(unitDir, String(name));
    return record(readJson(file), file);
  });
  return { ...unit, lessons } as unknown as UnitInput;
}

/** Reads one pack directory into plain pack data. Files are read once, here. */
export function readPackDataFromDisk(contentDir: string): PackData {
  const manifestFile = path.join(contentDir, 'pack.json');
  const manifest = record(readJson(manifestFile), manifestFile) as unknown as PackManifest;

  const candoDir = path.join(contentDir, 'candos');
  const candos = names(candoDir, 'file', '.json').flatMap(
    (name) => readJson(path.join(candoDir, name)) as CandoInput[],
  );

  const itemDir = path.join(contentDir, 'items');
  const items = names(itemDir, 'file', '.jsonl').flatMap((name) =>
    readText(path.join(itemDir, name))
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as ItemInput),
  );

  const unitRoot = path.join(contentDir, 'units');
  const units = names(unitRoot, 'dir').flatMap((level) =>
    names(path.join(unitRoot, level), 'dir')
      .map((folder) => path.join(unitRoot, level, folder))
      .filter((unitDir) => fs.existsSync(path.join(unitDir, 'unit.json')))
      .map(readUnit),
  );

  return { manifest, candos, items, units };
}

/** The German pack as a LanguagePack with stub rules, without importing lang-de. */
export function loadGermanPackFromDisk(): LanguagePack {
  return toPack(readPackDataFromDisk(GERMAN_CONTENT_DIR));
}
