// install-pack.ts
//
// Validates a language pack and installs it into the database in DATABASE_URL.
//
//   pnpm pack:install de              validate, install, print the counts
//   pnpm pack:install de --dry-run    validate and build the snapshot, write nothing
//
// Exit 0 when the pack is installed (or the dry run is clean), 1 when the pack
// has errors or the install failed, 2 for a usage or configuration problem.
// Installing the same pack twice keeps every id: ids are derived from the
// pack keys, and rows are updated in place.
//
// This file wires boxes directly and never imports apps/web. The function
// installPackInto is exported so a test can take the same path as the CLI.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createEventBus, LANGUAGE_CODES } from '@stufen/contracts';
import type {
  CurriculumSnapshot,
  InstallReport,
  LanguageCode,
  LanguagePack,
} from '@stufen/contracts';
import { createContent, createPostgresContentStore } from '@stufen/core-content';
import type { PackIssue, PackValidationReport } from '@stufen/core-content';
import { createPostgresCurriculumStore } from '@stufen/core-curriculum';
import { createDb } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createGermanPack } from '@stufen/lang-de';

/** How many warnings the table shows unless --all-warnings is given. */
const WARNING_LIMIT = 20;

export interface InstallPackOptions {
  db: Database;
  language: LanguageCode;
  /** Validate and build the snapshot, write nothing. */
  dryRun?: boolean;
  /** Folder that holds the language folders. Default: content/ of this repo. */
  contentRoot?: string;
  /** Print every warning instead of the first few. */
  allWarnings?: boolean;
  /** Where lines go. Default: console.log. */
  log?: (line: string) => void;
}

export interface SnapshotCounts {
  candos: number;
  items: number;
  units: number;
  lessons: number;
  exercises: number;
}

export interface InstallPackOutcome {
  ok: boolean;
  dryRun: boolean;
  validation: PackValidationReport;
  /** Null when the pack was refused. */
  counts: SnapshotCounts | null;
  /** SHA-256 over every id of the snapshot, sorted. The same pack gives the same value. */
  idsDigest: string | null;
  /** Null on a dry run and when the pack was refused. */
  install: InstallReport | null;
  /** The active version in the database after the run. */
  activeVersion: string | null;
}

/** The pack for a language. Only German exists today. */
function packFor(language: LanguageCode, contentRoot: string | undefined): LanguagePack {
  if (language === 'de') {
    return createGermanPack(
      contentRoot === undefined ? {} : { contentDir: path.resolve(contentRoot, 'de') },
    );
  }
  throw new UsageError(`There is no pack for "${language}" yet. Available: de.`);
}

export class UsageError extends Error {}

function countsOf(snapshot: CurriculumSnapshot): SnapshotCounts {
  const lessons = snapshot.units.flatMap((unit) => unit.lessons);
  return {
    candos: snapshot.candos.length,
    items: snapshot.items.length,
    units: snapshot.units.length,
    lessons: lessons.length,
    exercises: lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0),
  };
}

function idsOf(snapshot: CurriculumSnapshot): string[] {
  const lessons = snapshot.units.flatMap((unit) => unit.lessons);
  return [
    ...snapshot.candos.map((cando) => cando.id),
    ...snapshot.items.map((item) => item.id),
    ...snapshot.units.map((unit) => unit.id),
    ...lessons.map((lesson) => lesson.id),
    ...lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id)),
  ].sort();
}

function digestOf(ids: readonly string[]): string {
  return `sha256:${createHash('sha256').update(ids.join('\n')).digest('hex')}`;
}

function clip(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 3)}...`;
}

/** The issues as a plain text table, errors first. */
export function issueTable(report: PackValidationReport, allWarnings = false): string[] {
  const shownWarnings = allWarnings ? report.warnings : report.warnings.slice(0, WARNING_LIMIT);
  const issues: PackIssue[] = [...report.errors, ...shownWarnings];
  if (issues.length === 0) return ['No issues.'];

  const rows = issues.map((issue) => [
    issue.severity,
    clip(issue.file === '' ? '(pack)' : issue.file, 48),
    clip(issue.path === '' ? '(pack)' : issue.path, 60),
    issue.message,
  ]);
  const header = ['severity', 'file', 'path', 'message'];
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, column) =>
        column === cells.length - 1 ? cell : cell.padEnd(widths[column] ?? 0),
      )
      .join(' | ');

  const lines = [line(header), widths.map((width) => '-'.repeat(width)).join('-|-')];
  for (const row of rows) lines.push(line(row));
  const hidden = report.warnings.length - shownWarnings.length;
  if (hidden > 0) lines.push(`... and ${hidden} more warnings. Pass --all-warnings to list them.`);
  return lines;
}

/** Every id the store holds for the language, read back after an install. */
async function storedIds(
  store: ReturnType<typeof createPostgresCurriculumStore>,
  language: LanguageCode,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const cando of await store.listCandos(language)) ids.add(cando.id);
  for (const item of await store.listItems(language)) ids.add(item.id);
  for (const unit of await store.listUnits(language)) {
    ids.add(unit.id);
    for (const summary of await store.listLessonSummaries(unit.id)) {
      ids.add(summary.id);
      const lesson = await store.getLesson(summary.id);
      for (const exercise of lesson?.exercises ?? []) ids.add(exercise.id);
    }
  }
  return ids;
}

/** Validates, then installs unless it is a dry run. Never closes `db`. */
export async function installPackInto(options: InstallPackOptions): Promise<InstallPackOutcome> {
  const { db, language } = options;
  const dryRun = options.dryRun ?? false;
  const log = options.log ?? ((line: string) => console.log(line));

  const curriculumStore = createPostgresCurriculumStore(db);
  const content = createContent({
    store: createPostgresContentStore(db),
    writer: curriculumStore,
    bus: createEventBus(),
  });
  content.registerPack(packFor(language, options.contentRoot));

  const validation = await content.validatePack(language);
  log(`Pack ${validation.language} ${validation.version}`);
  log(`Validation: ${validation.errors.length} errors, ${validation.warnings.length} warnings`);
  for (const line of issueTable(validation, options.allWarnings)) log(line);

  if (!validation.ok) {
    log('Refused: the pack has errors. Nothing was written.');
    const activeVersion = await content.activePackVersion(language);
    return {
      ok: false,
      dryRun,
      validation,
      counts: null,
      idsDigest: null,
      install: null,
      activeVersion,
    };
  }

  const snapshot = await content.buildSnapshot(language);
  const counts = countsOf(snapshot);
  const ids = idsOf(snapshot);
  const idsDigest = digestOf(ids);
  const countLine = (value: SnapshotCounts): string =>
    `candos ${value.candos}, items ${value.items}, units ${value.units}, ` +
    `lessons ${value.lessons}, exercises ${value.exercises}`;

  if (dryRun) {
    log(`Dry run: snapshot built, nothing written. ${countLine(counts)}`);
    log(`Ids: ${ids.length}, digest ${idsDigest}`);
    const activeVersion = await content.activePackVersion(language);
    log(`Active version in the database: ${activeVersion ?? 'none'}`);
    return { ok: true, dryRun, validation, counts, idsDigest, install: null, activeVersion };
  }

  const install = await content.installPack(language);
  log(`Installed: status ${install.status}. ${countLine(install)}`);
  const stored = await storedIds(curriculumStore, language);
  const missing = ids.filter((id) => !stored.has(id));
  log(`Ids: ${ids.length}, digest ${idsDigest}`);
  log(
    missing.length === 0
      ? `Read back: all ${ids.length} ids are stored (${stored.size} rows for ${language}).`
      : `Read back: ${missing.length} ids are missing, for example ${missing[0] ?? ''}.`,
  );
  const activeVersion = await content.activePackVersion(language);
  log(`Active version: ${activeVersion ?? 'none'}`);
  const ok = install.status === 'active' && missing.length === 0;
  return { ok, dryRun, validation, counts, idsDigest, install, activeVersion };
}

const USAGE = 'Usage: pnpm pack:install <language> [--dry-run] [--all-warnings]';

interface CliArgs {
  language: LanguageCode;
  dryRun: boolean;
  allWarnings: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const words = argv.filter((arg) => !arg.startsWith('--'));
  for (const flag of flags) {
    if (flag !== '--dry-run' && flag !== '--all-warnings') {
      throw new UsageError(`Unknown option ${flag}. ${USAGE}`);
    }
  }
  const [language, ...rest] = words;
  if (language === undefined || rest.length > 0) throw new UsageError(USAGE);
  if (!(LANGUAGE_CODES as readonly string[]).includes(language)) {
    throw new UsageError(`"${language}" is not a language code. ${USAGE}`);
  }
  return {
    language: language as LanguageCode,
    dryRun: flags.has('--dry-run'),
    allWarnings: flags.has('--all-warnings'),
  };
}

/** The CLI. Returns the exit code and always closes the pool it opened. */
export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    console.error('DATABASE_URL is not set. Point it at a migrated PostgreSQL database.');
    return 2;
  }
  const contentRoot = env.STUFEN_CONTENT_DIR?.trim();

  const db = createDb(url);
  try {
    const outcome = await installPackInto({
      db,
      language: args.language,
      dryRun: args.dryRun,
      allWarnings: args.allWarnings,
      ...(contentRoot ? { contentRoot } : {}),
    });
    return outcome.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    // The message only. A connection error could otherwise print the URL.
    console.error(`Install failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await db.destroy();
  }
}

const entry = process.argv[1];
if (entry !== undefined && pathToFileURL(path.resolve(entry)).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
