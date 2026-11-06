// Unit test, no database. Checks the hand written table map in src/schema.ts
// against every *.sql file in migrations/, which are the source of truth.
// `create table` statements are read, plus columns added later with
// `alter table <name> add column`. Views are not tables and are not in DB.
//
// The type level checks (expectTypeOf) are enforced by the type checker:
// `pnpm exec tsc -p tsconfig.json --noEmit` from the repo root fails if one of
// them is wrong. Vitest runs them as no-ops.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TABLE_NAMES } from '../src/index';
import type { DB, NewRow, Row, RowPatch, TableName } from '../src/index';

const read = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// Every migration file, in the order the runner applies them.
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => path.extname(name) === '.sql')
  .sort();

// Line comments removed, so the rollback block at the bottom of each file is
// not parsed.
const migration = migrationFiles
  .map((name) => read(`../migrations/${name}`))
  .join('\n')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');
const schemaSource = read('../src/schema.ts');

const CONSTRAINT_WORDS = new Set(['primary', 'unique', 'check', 'foreign', 'constraint']);

/** table name -> column names, in file order, from every `create table`. */
function tablesInMigration(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const createTable =
    /create table\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(createTable)) {
    const name = match[1] as string;
    const columns: string[] = [];
    for (const line of (match[2] as string).split('\n')) {
      const word = /^\s*([a-z_][a-z0-9_]*)\s/i.exec(line)?.[1];
      if (word && !CONSTRAINT_WORDS.has(word.toLowerCase())) columns.push(word);
    }
    tables.set(name, columns);
  }
  // Columns added later with `alter table <name> add column <column>`.
  const addColumn =
    /alter table\s+([a-z_][a-z0-9_]*)\s+add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/gi;
  for (const match of sql.matchAll(addColumn)) {
    tables.get(match[1] as string)?.push(match[2] as string);
  }
  return tables;
}

/** interface name -> property names, in file order, from src/schema.ts. */
function interfacesInSchema(source: string): Map<string, string[]> {
  const interfaces = new Map<string, string[]>();
  for (const match of source.matchAll(/export interface (\w+) \{\n([\s\S]*?)\n\}/g)) {
    const props = [...(match[2] as string).matchAll(/^ {2}(\w+)\??: /gm)].map(
      (m) => m[1] as string,
    );
    interfaces.set(match[1] as string, props);
  }
  return interfaces;
}

/** table name -> interface name, read from the body of `interface DB`. */
function tableInterfaces(source: string): Map<string, string> {
  const body = /export interface DB \{\n([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
  const map = new Map<string, string>();
  for (const m of body.matchAll(/^ {2}(\w+): (\w+);/gm)) map.set(m[1] as string, m[2] as string);
  return map;
}

const sqlTables = tablesInMigration(migration);

describe('TABLE_NAMES against the migrations', () => {
  it('reads every file in migrations/, not only the first', () => {
    expect(migrationFiles.slice(0, 2)).toEqual(['0001_init.sql', '0002_auth.sql']);
  });

  it('finds the tables in the migrations', () => {
    expect(sqlTables.size).toBe(30);
    // from 0001
    expect(sqlTables.has('users')).toBe(true);
    expect(sqlTables.has('feature_flags')).toBe(true);
    // from 0002
    expect(sqlTables.has('sessions')).toBe(true);
    expect(sqlTables.has('accounts')).toBe(true);
    expect(sqlTables.has('verifications')).toBe(true);
  });

  it('lists exactly the tables the migrations create', () => {
    expect([...TABLE_NAMES].sort()).toEqual([...sqlTables.keys()].sort());
  });

  it('lists each table once', () => {
    expect(new Set(TABLE_NAMES).size).toBe(TABLE_NAMES.length);
  });

  it('does not list schema_migrations, which belongs to the runner', () => {
    expect((TABLE_NAMES as readonly string[]).includes('schema_migrations')).toBe(false);
    expect(sqlTables.has('schema_migrations')).toBe(false);
  });
});

describe('table interfaces against the migrations', () => {
  const interfaces = interfacesInSchema(schemaSource);
  const byTable = tableInterfaces(schemaSource);

  it('DB maps every table to an interface', () => {
    expect([...byTable.keys()].sort()).toEqual([...sqlTables.keys()].sort());
  });

  it.each([...sqlTables.entries()])('%s has the same columns in the same order', (table, cols) => {
    const interfaceName = byTable.get(table);
    expect(interfaceName, `no entry for ${table} in interface DB`).toBeDefined();
    expect(interfaces.get(interfaceName as string)).toEqual(cols);
  });
});

describe('DB at compile time', () => {
  type TablesInMigrations =
    | 'users'
    | 'languages'
    | 'cefr_levels'
    | 'cando_descriptors'
    | 'units'
    | 'lessons'
    | 'content_pack_versions'
    | 'items'
    | 'exercises'
    | 'profiles'
    | 'learner_languages'
    | 'lesson_sessions'
    | 'attempts'
    | 'review_cards'
    | 'review_logs'
    | 'cando_mastery'
    | 'level_estimates'
    | 'streaks'
    | 'assessments'
    | 'tutor_conversations'
    | 'tutor_messages'
    | 'writing_submissions'
    | 'speech_recordings'
    | 'feedback'
    | 'events'
    | 'entitlements'
    | 'feature_flags'
    // 0002_auth.sql
    | 'sessions'
    | 'accounts'
    | 'verifications';

  it('has one key per table in the migrations and nothing else', () => {
    expectTypeOf<keyof DB>().toEqualTypeOf<TablesInMigrations>();
    expectTypeOf<TableName>().toEqualTypeOf<TablesInMigrations>();
    expectTypeOf<(typeof TABLE_NAMES)[number]>().toEqualTypeOf<TablesInMigrations>();
  });

  it('types selected rows the way the pg driver returns them', () => {
    expectTypeOf<Row<'profiles'>['id']>().toEqualTypeOf<string>();
    expectTypeOf<Row<'profiles'>['created_at']>().toEqualTypeOf<Date>();
    expectTypeOf<Row<'profiles'>['display_name']>().toEqualTypeOf<string | null>();
    expectTypeOf<Row<'attempts'>['score']>().toEqualTypeOf<string>();
    expectTypeOf<Row<'lesson_sessions'>['score']>().toEqualTypeOf<string | null>();
    expectTypeOf<Row<'lesson_sessions'>['completed_at']>().toEqualTypeOf<Date | null>();
    expectTypeOf<Row<'streaks'>['last_active_date']>().toEqualTypeOf<Date | null>();
    expectTypeOf<Row<'lessons'>['cando_ids']>().toEqualTypeOf<string[]>();
    expectTypeOf<Row<'cando_mastery'>['exercise_types_seen']>().toEqualTypeOf<string[]>();
    expectTypeOf<Row<'review_cards'>['stability']>().toEqualTypeOf<number>();
    expectTypeOf<Row<'sessions'>['expires_at']>().toEqualTypeOf<Date>();
    expectTypeOf<Row<'sessions'>['ip_address']>().toEqualTypeOf<string | null>();
    expectTypeOf<Row<'accounts'>['refresh_token_expires_at']>().toEqualTypeOf<Date | null>();
    expectTypeOf<Row<'verifications'>['value']>().toEqualTypeOf<string>();
    expectTypeOf<Row<'exercises'>['skill']>().toEqualTypeOf<
      | 'reading'
      | 'listening'
      | 'spoken_production'
      | 'spoken_interaction'
      | 'writing'
      | 'mediation'
      | 'grammar'
      | 'vocabulary'
    >();
  });

  it('makes defaulted and nullable columns optional on insert, the rest required', () => {
    // users: only email has neither a default nor a null.
    expectTypeOf<{ email: string }>().toExtend<NewRow<'users'>>();
    expectTypeOf<Record<never, never>>().not.toExtend<NewRow<'users'>>();
    // attempts: numeric takes a number or a string, timestamps a Date or a string.
    expectTypeOf<{
      user_id: string;
      exercise_type: string;
      correct: boolean;
      score: number;
      created_at: string;
    }>().toExtend<NewRow<'attempts'>>();
    expectTypeOf<{ user_id: string; exercise_type: string; correct: boolean }>().not.toExtend<
      NewRow<'attempts'>
    >();
    // sessions: id and the two timestamps have defaults, the rest is required.
    expectTypeOf<{ user_id: string; token: string; expires_at: Date }>().toExtend<
      NewRow<'sessions'>
    >();
    expectTypeOf<{ user_id: string; token: string }>().not.toExtend<NewRow<'sessions'>>();
    // accounts: every token column is nullable, so the user and two ids suffice.
    expectTypeOf<{ user_id: string; account_id: string; provider_id: string }>().toExtend<
      NewRow<'accounts'>
    >();
    expectTypeOf<{ identifier: string; value: string; expires_at: string }>().toExtend<
      NewRow<'verifications'>
    >();
    // A check constraint is a union, so a wrong value does not compile.
    expectTypeOf<{ status: 'archived' }>().not.toExtend<RowPatch<'languages'>>();
    expectTypeOf<{ status: 'hidden' }>().toExtend<RowPatch<'languages'>>();
  });

  it('runs', () => {
    // Keeps this block visible in the report; the checks above are types only.
    expect(TABLE_NAMES.length).toBe(30);
  });
});
