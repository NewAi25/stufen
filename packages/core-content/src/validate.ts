// Referential validation of a language pack (P1-02). Reads the pack through the
// LanguagePack interface and writes nothing. The rules are the structural ones
// from docs/09-content-pack-spec.md, "Referential rules": keys, references,
// levels, exercise types and ordinals. Payload shapes are checked against the
// JSON schemas by scripts/validate-content.mjs and by core-exercise-types.
import { CEFR_LEVELS, EXERCISE_TYPES, SKILLS } from '@stufen/contracts';
import type {
  CandoInput,
  ExerciseInput,
  ItemInput,
  LanguageCode,
  LanguagePack,
  LessonInput,
  PackManifest,
  UnitInput,
  ValidationIssue,
  ValidationReport,
} from '@stufen/contracts';
import { candoKey, exerciseKey, lessonKey, unitKey } from './ids';

export type IssueSeverity = 'error' | 'warning';

/** A ValidationIssue that also says how bad it is. Errors block an install, warnings do not. */
export interface PackIssue extends ValidationIssue {
  severity: IssueSeverity;
}

/** The contracts ValidationReport with a severity on every issue. */
export interface PackValidationReport extends ValidationReport {
  errors: PackIssue[];
  warnings: PackIssue[];
}

const ITEM_KINDS: readonly string[] = ['vocab', 'chunk', 'grammar', 'phrase'];
const LESSON_KINDS: readonly string[] = ['core', 'review', 'production', 'checkpoint'];

/** What the checks share while they walk one pack. */
interface Context {
  language: LanguageCode;
  issues: PackIssue[];
  /** Every key seen so far, with the path of the record that owns it. */
  keys: Map<string, string>;
  candoKeys: Set<string>;
  itemKeys: Set<string>;
  /** Descriptor keys some lesson lists in cando_ids. */
  targetedCandos: Set<string>;
  /** Item keys some lesson or exercise refers to. */
  usedItems: Set<string>;
}

function report(
  ctx: Context,
  severity: IssueSeverity,
  file: string,
  path: string,
  message: string,
): void {
  ctx.issues.push({ severity, file, path, message });
}

const error = (ctx: Context, file: string, path: string, message: string): void =>
  report(ctx, 'error', file, path, message);
const warning = (ctx: Context, file: string, path: string, message: string): void =>
  report(ctx, 'warning', file, path, message);

function isOneOf(list: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && list.includes(value);
}

/** The strings of a list field. Anything that is not an array reads as empty. */
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function pad2(value: unknown): string {
  return String(value).padStart(2, '0');
}

/** Runs a pack loader. A loader that throws becomes one error and an empty list. */
function load<T>(ctx: Context, file: string, loader: () => T[]): T[] {
  try {
    const value = loader();
    if (Array.isArray(value)) return value;
    error(ctx, file, '', 'the pack did not return a list');
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    error(ctx, file, '', `the pack could not be loaded: ${reason}`);
  }
  return [];
}

/**
 * Registers a key. Reports a key that is empty, that does not start with
 * `<code>:`, or that another record already owns. Keys are unique across the
 * whole pack, not only within one kind of record.
 */
function claimKey(ctx: Context, file: string, path: string, key: unknown): void {
  if (typeof key !== 'string' || key === '') {
    error(ctx, file, path, 'the record has no key');
    return;
  }
  if (!key.startsWith(`${ctx.language}:`)) {
    error(ctx, file, path, `key ${key} does not start with "${ctx.language}:"`);
  }
  const owner = ctx.keys.get(key);
  if (owner !== undefined) {
    error(ctx, file, path, `duplicate key ${key}, already used by ${owner}`);
    return;
  }
  ctx.keys.set(key, path);
}

function checkLevel(ctx: Context, file: string, path: string, level: unknown): void {
  if (!isOneOf(CEFR_LEVELS, level)) {
    error(ctx, file, `${path}.level`, `level ${JSON.stringify(level)} is not a CEFR level`);
  }
}

// ---------------------------------------------------------------
// Manifest, descriptors, items
// ---------------------------------------------------------------

function checkManifest(ctx: Context, pack: LanguagePack): void {
  const file = 'pack.json';
  let manifest: PackManifest;
  try {
    manifest = pack.loadManifest();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    error(ctx, file, '', `the manifest could not be loaded: ${reason}`);
    return;
  }
  if (manifest.code !== pack.code) {
    error(
      ctx,
      file,
      'code',
      `manifest code ${JSON.stringify(manifest.code)} is not the pack code "${pack.code}"`,
    );
  }
  if (manifest.version !== pack.version) {
    error(
      ctx,
      file,
      'version',
      `manifest version ${JSON.stringify(manifest.version)} is not the pack version "${pack.version}"`,
    );
  }
  const levels: unknown[] = Array.isArray(manifest.levels) ? manifest.levels : [];
  levels.forEach((level, index) => {
    if (!isOneOf(CEFR_LEVELS, level)) {
      error(ctx, file, `levels[${index}]`, `level ${JSON.stringify(level)} is not a CEFR level`);
    }
  });
  if (typeof manifest.checksum !== 'string' || manifest.checksum === '') {
    error(ctx, file, 'checksum', 'the manifest has no checksum');
  } else if (manifest.checksum === 'pending') {
    warning(ctx, file, 'checksum', 'the checksum is still "pending"');
  }
}

function checkCandos(ctx: Context, candos: CandoInput[]): void {
  candos.forEach((cando, index) => {
    const key = candoKey(ctx.language, cando);
    const file = `candos/${String(cando.level)}.json`;
    const path = `candos[${key || index}]`;
    claimKey(ctx, file, path, key);
    ctx.candoKeys.add(key);
    checkLevel(ctx, file, path, cando.level);
    if (!isOneOf(SKILLS, cando.skill)) {
      error(
        ctx,
        file,
        `${path}.skill`,
        `skill ${JSON.stringify(cando.skill)} is not a known skill`,
      );
    }
    if (typeof cando.code !== 'string' || cando.code === '') {
      error(ctx, file, `${path}.code`, 'the descriptor has no code');
    } else if (key !== `${ctx.language}:cando:${cando.code}`) {
      error(ctx, file, `${path}.key`, `key ${key} is not ${ctx.language}:cando:${cando.code}`);
    }
  });
}

function checkItems(ctx: Context, items: ItemInput[]): void {
  items.forEach((item, index) => {
    const file = `items/${String(item.level)}.jsonl`;
    const path = `items[${item.key || index}]`;
    claimKey(ctx, file, path, item.key);
    if (typeof item.key === 'string') ctx.itemKeys.add(item.key);
    checkLevel(ctx, file, path, item.level);
    if (!isOneOf(ITEM_KINDS, item.kind)) {
      error(ctx, file, `${path}.kind`, `kind ${JSON.stringify(item.kind)} is not an item kind`);
    }
  });
}

/** Reports every entry of a reference list that is not a key in `known`. */
function checkReferences(
  ctx: Context,
  file: string,
  path: string,
  refs: string[],
  known: Set<string>,
  what: 'descriptor' | 'item',
): void {
  refs.forEach((ref, index) => {
    if (!known.has(ref)) {
      error(ctx, file, `${path}[${index}]`, `${what} ${ref} does not exist in the pack`);
    }
  });
}

/** Reports an ordinal that is not a whole number above zero, or that a sibling already has. */
function checkOrdinal(
  ctx: Context,
  file: string,
  path: string,
  ordinal: unknown,
  seen: Map<number, string>,
  parent: string,
): void {
  if (typeof ordinal !== 'number' || !Number.isInteger(ordinal) || ordinal < 1) {
    error(
      ctx,
      file,
      `${path}.ordinal`,
      `ordinal ${JSON.stringify(ordinal)} is not a whole number from 1`,
    );
    return;
  }
  const owner = seen.get(ordinal);
  if (owner !== undefined) {
    error(
      ctx,
      file,
      `${path}.ordinal`,
      `ordinal ${ordinal} is used twice in ${parent}, also by ${owner}`,
    );
    return;
  }
  seen.set(ordinal, path);
}

// ---------------------------------------------------------------
// Units, lessons, exercises
// ---------------------------------------------------------------

function checkExercise(
  ctx: Context,
  file: string,
  lessonPath: string,
  lessonKeyValue: string,
  lessonCandos: Set<string>,
  exercise: ExerciseInput,
  ordinals: Map<number, string>,
): void {
  // An exercise is known by its own key. Without one it is its place in the lesson.
  const hasKey = typeof exercise.key === 'string' && exercise.key !== '';
  const key = hasKey ? exercise.key : exerciseKey(lessonKeyValue, exercise);
  const path = `${lessonPath}.exercises[${key}]`;
  claimKey(ctx, file, path, key);
  checkOrdinal(ctx, file, path, exercise.ordinal, ordinals, `lesson ${lessonKeyValue}`);
  if (!isOneOf(EXERCISE_TYPES, exercise.type)) {
    error(
      ctx,
      file,
      `${path}.type`,
      `exercise type ${JSON.stringify(exercise.type)} is not a known exercise type`,
    );
  }
  if (!isOneOf(SKILLS, exercise.skill)) {
    error(
      ctx,
      file,
      `${path}.skill`,
      `skill ${JSON.stringify(exercise.skill)} is not a known skill`,
    );
  }
  const candoRefs = strings(exercise.cando_ids);
  if (candoRefs.length === 0) {
    error(ctx, file, `${path}.cando_ids`, 'the exercise targets no descriptor');
  }
  checkReferences(ctx, file, `${path}.cando_ids`, candoRefs, ctx.candoKeys, 'descriptor');
  candoRefs.forEach((ref, index) => {
    if (ctx.candoKeys.has(ref) && !lessonCandos.has(ref)) {
      warning(
        ctx,
        file,
        `${path}.cando_ids[${index}]`,
        `descriptor ${ref} is not listed in cando_ids of lesson ${lessonKeyValue}`,
      );
    }
  });
  const itemRefs = strings(exercise.item_ids);
  checkReferences(ctx, file, `${path}.item_ids`, itemRefs, ctx.itemKeys, 'item');
  for (const ref of itemRefs) ctx.usedItems.add(ref);
}

function checkLesson(
  ctx: Context,
  unitDir: string,
  unitPath: string,
  unit: UnitInput,
  lesson: LessonInput,
  ordinals: Map<number, string>,
  slugs: Map<string, string>,
): void {
  const key = lessonKey(ctx.language, unit, lesson);
  const file = `${unitDir}/lesson-${pad2(lesson.ordinal)}.json`;
  const path = `${unitPath}.lessons[${key}]`;
  const unitKeyValue = unitKey(ctx.language, unit);
  claimKey(ctx, file, path, key);
  checkOrdinal(ctx, file, path, lesson.ordinal, ordinals, `unit ${unitKeyValue}`);
  if (lesson.unit_key !== unitKeyValue) {
    error(
      ctx,
      file,
      `${path}.unit_key`,
      `unit_key ${JSON.stringify(lesson.unit_key)} is not ${unitKeyValue}`,
    );
  }
  if (!isOneOf(LESSON_KINDS, lesson.kind)) {
    error(ctx, file, `${path}.kind`, `kind ${JSON.stringify(lesson.kind)} is not a lesson kind`);
  }
  const slugOwner = slugs.get(lesson.slug);
  if (slugOwner !== undefined) {
    error(ctx, file, `${path}.slug`, `slug ${lesson.slug} is used twice in unit ${unitKeyValue}`);
  } else {
    slugs.set(lesson.slug, path);
  }

  const candoRefs = strings(lesson.cando_ids);
  if (candoRefs.length === 0) {
    error(ctx, file, `${path}.cando_ids`, 'the lesson targets no descriptor');
  }
  checkReferences(ctx, file, `${path}.cando_ids`, candoRefs, ctx.candoKeys, 'descriptor');
  for (const ref of candoRefs) ctx.targetedCandos.add(ref);

  const introduced = strings(lesson.introduces_item_ids);
  checkReferences(ctx, file, `${path}.introduces_item_ids`, introduced, ctx.itemKeys, 'item');
  for (const ref of introduced) ctx.usedItems.add(ref);

  if (!Array.isArray(lesson.exercises)) {
    error(ctx, file, `${path}.exercises`, 'the lesson has no exercises list');
    return;
  }
  const lessonCandos = new Set(candoRefs);
  const exerciseOrdinals = new Map<number, string>();
  for (const exercise of lesson.exercises) {
    checkExercise(ctx, file, path, key, lessonCandos, exercise, exerciseOrdinals);
  }
}

function checkUnits(ctx: Context, units: UnitInput[]): void {
  // Unit ordinals are unique within a level, unit slugs within the language.
  const ordinalsByLevel = new Map<string, Map<number, string>>();
  const slugs = new Map<string, string>();
  for (const unit of units) {
    const key = unitKey(ctx.language, unit);
    const unitDir = `units/${String(unit.level)}/${pad2(unit.ordinal)}-${unit.slug}`;
    const file = `${unitDir}/unit.json`;
    const path = `units[${key}]`;
    claimKey(ctx, file, path, key);
    checkLevel(ctx, file, path, unit.level);

    const level = String(unit.level);
    const ordinals = ordinalsByLevel.get(level) ?? new Map<number, string>();
    ordinalsByLevel.set(level, ordinals);
    checkOrdinal(ctx, file, path, unit.ordinal, ordinals, `level ${level}`);

    const slugOwner = slugs.get(unit.slug);
    if (slugOwner !== undefined) {
      error(ctx, file, `${path}.slug`, `slug ${unit.slug} is used twice, also by ${slugOwner}`);
    } else {
      slugs.set(unit.slug, path);
    }

    if (!Array.isArray(unit.lessons)) {
      error(ctx, file, `${path}.lessons`, 'the unit has no lessons list');
      continue;
    }
    const lessonOrdinals = new Map<number, string>();
    const lessonSlugs = new Map<string, string>();
    for (const lesson of unit.lessons) {
      checkLesson(ctx, unitDir, path, unit, lesson, lessonOrdinals, lessonSlugs);
    }
  }
}

/** Warnings only: content nothing points at yet. */
function checkUnused(ctx: Context, candos: CandoInput[], items: ItemInput[]): void {
  for (const cando of candos) {
    const key = candoKey(ctx.language, cando);
    if (!ctx.targetedCandos.has(key)) {
      warning(
        ctx,
        `candos/${String(cando.level)}.json`,
        `candos[${key}]`,
        `no lesson targets descriptor ${key}`,
      );
    }
  }
  for (const item of items) {
    if (typeof item.key === 'string' && !ctx.usedItems.has(item.key)) {
      warning(
        ctx,
        `items/${String(item.level)}.jsonl`,
        `items[${item.key}]`,
        `no lesson uses item ${item.key}`,
      );
    }
  }
}

/**
 * Checks one pack and returns what it found. Never writes and never throws for
 * bad content: a loader that throws is reported as an error in the report.
 * `ok` is true when there is no issue of severity error.
 */
export function validatePackData(pack: LanguagePack): PackValidationReport {
  const ctx: Context = {
    language: pack.code,
    issues: [],
    keys: new Map(),
    candoKeys: new Set(),
    itemKeys: new Set(),
    targetedCandos: new Set(),
    usedItems: new Set(),
  };
  checkManifest(ctx, pack);
  const candos = load(ctx, 'candos', () => pack.loadCandos());
  const items = load(ctx, 'items', () => pack.loadItems());
  const units = load(ctx, 'units', () => pack.loadUnits());
  checkCandos(ctx, candos);
  checkItems(ctx, items);
  checkUnits(ctx, units);
  checkUnused(ctx, candos, items);

  const errors = ctx.issues.filter((issue) => issue.severity === 'error');
  const warnings = ctx.issues.filter((issue) => issue.severity === 'warning');
  return { language: pack.code, version: pack.version, ok: errors.length === 0, errors, warnings };
}
