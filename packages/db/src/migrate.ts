// Migration runner. Plain numbered SQL files, applied in name order, each in
// its own transaction, recorded in schema_migrations. Running it twice is a
// no-op. The executor is a tiny interface so the logic can be tested without
// Postgres; kyselyExecutor adapts a real Kysely instance.
//
// This file has no relative imports on purpose: src/migrate-cli.mjs loads it
// straight into Node 24, which strips types but does not resolve extensionless
// relative paths.

import fs from 'node:fs/promises';
import path from 'node:path';
import { CompiledQuery, type Kysely } from 'kysely';

export interface MigrationFile {
  /** File name, for example 0001_init.sql */
  name: string;
  sql: string;
}

export interface QueryRows {
  rows: Record<string, unknown>[];
}

export interface MigrationExecutor {
  query(sql: string, params?: readonly unknown[]): Promise<QueryRows>;
  transaction<T>(fn: (tx: MigrationExecutor) => Promise<T>): Promise<T>;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

const CREATE_LEDGER = `create table if not exists schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
)`;

/** Validates names and returns the files sorted by name. */
export function orderMigrations(files: readonly MigrationFile[]): MigrationFile[] {
  const seen = new Map<string, string>();
  for (const file of files) {
    const match = MIGRATION_FILE.exec(file.name);
    if (!match) {
      throw new Error(
        `migration "${file.name}" must be named NNNN_snake_case.sql (four digits, underscore, lower case)`,
      );
    }
    const number = match[1] as string;
    const other = seen.get(number);
    if (other) {
      throw new Error(`migrations "${other}" and "${file.name}" share the number ${number}`);
    }
    seen.set(number, file.name);
  }
  return [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Reads every *.sql file in a directory. Other files are ignored. */
export async function readMigrationDir(dir: string): Promise<MigrationFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: MigrationFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.sql') continue;
    files.push({ name: entry.name, sql: await fs.readFile(path.join(dir, entry.name), 'utf8') });
  }
  return orderMigrations(files);
}

/** Applies the missing files in order. Idempotent. */
export async function runMigrations(
  executor: MigrationExecutor,
  files: readonly MigrationFile[],
): Promise<MigrateResult> {
  const ordered = orderMigrations(files);
  await executor.query(CREATE_LEDGER);
  const { rows } = await executor.query('select filename from schema_migrations');
  const done = new Set(rows.map((r) => String(r.filename)));

  const known = new Set(ordered.map((f) => f.name));
  for (const name of done) {
    if (!known.has(name)) {
      throw new Error(
        `migration "${name}" is recorded in schema_migrations but missing from the directory; applied migrations are never removed`,
      );
    }
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of ordered) {
    if (done.has(file.name)) {
      skipped.push(file.name);
      continue;
    }
    await executor.transaction(async (tx) => {
      await tx.query(file.sql);
      await tx.query('insert into schema_migrations (filename) values ($1)', [file.name]);
    });
    applied.push(file.name);
  }
  return { applied, skipped };
}

/** Adapts a Kysely instance (any schema) to the executor interface. */
export function kyselyExecutor<T>(db: Kysely<T>): MigrationExecutor {
  const wrap = (k: Kysely<T>): MigrationExecutor => ({
    async query(sql, params = []) {
      const result = await k.executeQuery(CompiledQuery.raw(sql, [...params]));
      return { rows: result.rows as Record<string, unknown>[] };
    },
    transaction(fn) {
      return k.transaction().execute((trx) => fn(wrap(trx)));
    },
  });
  return wrap(db);
}

/** Reads the directory and applies what is missing. */
export async function migrate<T>(db: Kysely<T>, dir: string): Promise<MigrateResult> {
  return runMigrations(kyselyExecutor(db), await readMigrationDir(dir));
}
