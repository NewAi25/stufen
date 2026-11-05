// Unit test, no database. Checks the hand written table map in src/schema.ts
// against migrations/0001_init.sql, which is the source of truth.
//
// The type level checks (expectTypeOf) are enforced by the type checker:
// `pnpm exec tsc -p tsconfig.json --noEmit` from the repo root fails if one of
// them is wrong. Vitest runs them as no-ops.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TABLE_NAMES } from '../src/index';
import type { DB, NewRow, Row, RowPatch, TableName } from '../src/index';

const read = (relative: string) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// Line comments removed, so the rollback block at the bottom is not parsed.
const migration = read('../migrations/0001_init.sql')
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

describe('TABLE_NAMES against 0001_init.sql', () => {
  it('finds the tables in the migration', () => {
    expect(sqlTables.size).toBe(27);
    expect(sqlTables.has('users')).toBe(true);
    expect(sqlTables.has('feature_flags')).toBe(true);
  });

  it('lists exactly the tables the migration creates', () => {
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

describe('table interfaces against 0001_init.sql', () => {
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
  type TablesIn0001 =
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
    | 'feature_flags';

  it('has one key per table in 0001 and nothing else', () => {
    expectTypeOf<keyof DB>().toEqualTypeOf<TablesIn0001>();
    expectTypeOf<TableName>().toEqualTypeOf<TablesIn0001>();
    expectTypeOf<(typeof TABLE_NAMES)[number]>().toEqualTypeOf<TablesIn0001>();
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
    // A check constraint is a union, so a wrong value does not compile.
    expectTypeOf<{ status: 'archived' }>().not.toExtend<RowPatch<'languages'>>();
    expectTypeOf<{ status: 'hidden' }>().toExtend<RowPatch<'languages'>>();
  });

  it('runs', () => {
    // Keeps this block visible in the report; the checks above are types only.
    expect(TABLE_NAMES.length).toBe(27);
  });
});
