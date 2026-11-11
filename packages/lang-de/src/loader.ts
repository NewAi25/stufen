// Loader for the German content pack. Reads content/de from disk with
// synchronous fs calls, so it runs on the server only. It parses and shapes the
// files; schema and referential checks belong to core-content.validatePack.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEFR_LEVELS } from '@stufen/contracts';
import type {
  CandoInput,
  CefrLevel,
  ExamFormat,
  ImmersionMode,
  ItemInput,
  LanguagePack,
  LessonInput,
  PackManifest,
  UnitInput,
} from '@stufen/contracts';
import { germanRules } from './rules/german-rules';

export interface GermanPackOptions {
  /** Directory holding pack.json. Defaults to the repo's content/de. */
  contentDir?: string;
}

const DEFAULT_TTS = { locale: 'de-DE', voiceHint: 'neutral' };
const IMMERSION_MODES: readonly ImmersionMode[] = ['en', 'mixed', 'target'];

/** content/de of this repo, resolved from this file (packages/lang-de/src). */
export function defaultContentDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'content', 'de');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Removes a leading byte order mark (code point 0xFEFF) left by some editors. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (cause) {
    throw new Error(`lang-de: cannot read ${file}`, { cause });
  }
  try {
    return JSON.parse(stripBom(text));
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`lang-de: invalid JSON in ${file}: ${reason}`, { cause });
  }
}

function readObject(file: string): Record<string, unknown> {
  const value = readJson(file);
  if (!isRecord(value)) throw new Error(`lang-de: ${file} must hold a JSON object`);
  return value;
}

function readArray(file: string): unknown[] {
  const value = readJson(file);
  if (!Array.isArray(value)) throw new Error(`lang-de: ${file} must hold a JSON array`);
  return value;
}

/** Drops the editor only `$schema` key so the object matches the contracts shape. */
function withoutSchema(value: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schema, ...rest } = value;
  void _schema;
  return rest;
}

/** File or directory names in `dir`, sorted, empty when `dir` does not exist. */
function listNames(dir: string, kind: 'file' | 'dir', extension = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => (kind === 'dir' ? entry.isDirectory() : entry.isFile()))
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(extension))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function isCefrLevel(value: string): value is CefrLevel {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}

/** Orders level named entries (A1.json, A2) along the CEFR scale, unknown names last. */
function byLevel(a: string, b: string): number {
  const rank = (name: string): number => {
    const index = (CEFR_LEVELS as readonly string[]).indexOf(name.slice(0, 2));
    return index === -1 ? CEFR_LEVELS.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b, 'en');
}

function loadManifestFrom(contentDir: string): PackManifest {
  const file = path.join(contentDir, 'pack.json');
  const manifest = withoutSchema(readObject(file));
  if (manifest.code !== 'de') {
    throw new Error(`lang-de: ${file} has code ${JSON.stringify(manifest.code)}, expected "de"`);
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`lang-de: ${file} has no version`);
  }
  return manifest as unknown as PackManifest;
}

function loadCandosFrom(contentDir: string): CandoInput[] {
  const dir = path.join(contentDir, 'candos');
  const files = listNames(dir, 'file', '.json').sort(byLevel);
  return files.flatMap((name) => readArray(path.join(dir, name)) as CandoInput[]);
}

/** Parses one JSON lines file. Blank lines are skipped, a bad line throws with file and line. */
export function parseJsonLines(file: string): Record<string, unknown>[] {
  const text = stripBom(fs.readFileSync(file, 'utf8'));
  const records: Record<string, unknown>[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') return;
    const where = `${file} line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`lang-de: invalid JSON in ${where}: ${reason}`, { cause });
    }
    if (!isRecord(value)) throw new Error(`lang-de: ${where} must hold a JSON object`);
    records.push(value);
  });
  return records;
}

function loadItemsFrom(contentDir: string): ItemInput[] {
  const dir = path.join(contentDir, 'items');
  const files = listNames(dir, 'file', '.jsonl').sort(byLevel);
  return files.flatMap((name) => parseJsonLines(path.join(dir, name)) as unknown as ItemInput[]);
}

function loadLesson(file: string): LessonInput {
  const lesson = withoutSchema(readObject(file));
  if (!Array.isArray(lesson.exercises)) {
    throw new Error(`lang-de: ${file} has no exercises array`);
  }
  return lesson as unknown as LessonInput;
}

function loadUnit(unitDir: string): UnitInput {
  const file = path.join(unitDir, 'unit.json');
  const unit = withoutSchema(readObject(file));
  const lessonFiles: unknown = unit.lessons;
  if (!Array.isArray(lessonFiles)) throw new Error(`lang-de: ${file} has no lessons array`);
  const lessons = lessonFiles.map((name) => {
    if (typeof name !== 'string' || name !== path.basename(name)) {
      throw new Error(`lang-de: ${file} lists a lesson that is not a file name in its folder`);
    }
    return loadLesson(path.join(unitDir, name));
  });
  return { ...unit, lessons } as unknown as UnitInput;
}

function loadUnitsFrom(contentDir: string): UnitInput[] {
  const root = path.join(contentDir, 'units');
  const units: UnitInput[] = [];
  for (const level of listNames(root, 'dir').filter(isCefrLevel).sort(byLevel)) {
    for (const folder of listNames(path.join(root, level), 'dir')) {
      const unitDir = path.join(root, level, folder);
      if (fs.existsSync(path.join(unitDir, 'unit.json'))) units.push(loadUnit(unitDir));
    }
  }
  return units;
}

/**
 * Maps ramp.json to the contracts shape. The file holds a language per channel
 * (instructions, feedback, tutor); the contract has one mode per level, so the
 * instruction language is used. A missing level falls back to full immersion.
 */
function loadRampFrom(contentDir: string): Record<CefrLevel, ImmersionMode> {
  const file = path.join(contentDir, 'ramp.json');
  const raw = readObject(file);
  const modeFor = (level: CefrLevel): ImmersionMode => {
    const entry = raw[level];
    if (entry === undefined) return 'target';
    const mode = isRecord(entry) ? entry.instructions : entry;
    const known = IMMERSION_MODES.find((candidate) => candidate === mode);
    if (known === undefined) {
      throw new Error(`lang-de: ${file} has no valid instructions mode for ${level}`);
    }
    return known;
  };
  return {
    A1: modeFor('A1'),
    A2: modeFor('A2'),
    B1: modeFor('B1'),
    B2: modeFor('B2'),
    C1: modeFor('C1'),
    C2: modeFor('C2'),
  };
}

function loadExamFormatsFrom(contentDir: string): ExamFormat[] {
  return readArray(path.join(contentDir, 'exam-formats.json')) as ExamFormat[];
}

/** Builds the German LanguagePack over a content directory. Server only. */
export function createGermanPack(options: GermanPackOptions = {}): LanguagePack {
  const contentDir = path.resolve(options.contentDir ?? defaultContentDir());
  const manifest = loadManifestFrom(contentDir);
  return {
    code: 'de',
    version: manifest.version,
    loadManifest: () => loadManifestFrom(contentDir),
    loadCandos: () => loadCandosFrom(contentDir),
    loadItems: () => loadItemsFrom(contentDir),
    loadUnits: () => loadUnitsFrom(contentDir),
    rules: germanRules(loadItemsFrom(contentDir)),
    immersionRamp: loadRampFrom(contentDir),
    examFormats: loadExamFormatsFrom(contentDir),
    tts: {
      locale: manifest.tts?.locale ?? manifest.locale ?? DEFAULT_TTS.locale,
      voiceHint: manifest.tts?.voiceHint ?? DEFAULT_TTS.voiceHint,
    },
  };
}
