import { describe, expect, it } from 'vitest';
import {
  orderMigrations,
  runMigrations,
  type MigrationExecutor,
  type MigrationFile,
} from '../src/migrate';

// In memory stand in for Postgres: remembers applied names, logs every
// statement, and marks transaction boundaries.
function fakeExecutor(alreadyApplied: string[] = []) {
  const applied = new Set(alreadyApplied);
  const log: string[] = [];
  const executor: MigrationExecutor = {
    async query(sql, params = []) {
      log.push(sql);
      if (sql.startsWith('select filename')) {
        return { rows: [...applied].map((filename) => ({ filename })) };
      }
      if (sql.startsWith('insert into schema_migrations')) {
        applied.add(String(params[0]));
      }
      return { rows: [] };
    },
    async transaction(fn) {
      log.push('begin');
      const out = await fn(executor);
      log.push('commit');
      return out;
    },
  };
  return { executor, applied, log };
}

const files: MigrationFile[] = [
  { name: '0003_streaks.sql', sql: 'create table streaks ()' },
  { name: '0001_init.sql', sql: 'create table users ()' },
  { name: '0002_auth.sql', sql: 'create table sessions ()' },
];

describe('orderMigrations', () => {
  it('sorts by file name regardless of input order', () => {
    expect(orderMigrations(files).map((f) => f.name)).toEqual([
      '0001_init.sql',
      '0002_auth.sql',
      '0003_streaks.sql',
    ]);
  });

  it('rejects names that are not NNNN_snake_case.sql', () => {
    expect(() => orderMigrations([{ name: 'init.sql', sql: '' }])).toThrow(/must be named/);
    expect(() => orderMigrations([{ name: '1_init.sql', sql: '' }])).toThrow(/must be named/);
    expect(() => orderMigrations([{ name: '0001_Init.sql', sql: '' }])).toThrow(/must be named/);
  });

  it('rejects two files with the same number', () => {
    expect(() =>
      orderMigrations([
        { name: '0001_a.sql', sql: '' },
        { name: '0001_b.sql', sql: '' },
      ]),
    ).toThrow(/share the number 0001/);
  });
});

describe('runMigrations', () => {
  it('creates the ledger, then applies every file in order, one transaction each', async () => {
    const { executor, applied, log } = fakeExecutor();
    const result = await runMigrations(executor, files);

    expect(result.applied).toEqual(['0001_init.sql', '0002_auth.sql', '0003_streaks.sql']);
    expect(result.skipped).toEqual([]);
    expect([...applied]).toEqual(['0001_init.sql', '0002_auth.sql', '0003_streaks.sql']);

    expect(log[0]).toMatch(/create table if not exists schema_migrations/);
    expect(log[1]).toBe('select filename from schema_migrations');
    expect(log.slice(2)).toEqual([
      'begin',
      'create table users ()',
      'insert into schema_migrations (filename) values ($1)',
      'commit',
      'begin',
      'create table sessions ()',
      'insert into schema_migrations (filename) values ($1)',
      'commit',
      'begin',
      'create table streaks ()',
      'insert into schema_migrations (filename) values ($1)',
      'commit',
    ]);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const { executor, log } = fakeExecutor();
    await runMigrations(executor, files);
    const before = log.length;

    const second = await runMigrations(executor, files);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['0001_init.sql', '0002_auth.sql', '0003_streaks.sql']);
    expect(log.slice(before)).toEqual([
      expect.stringMatching(/create table if not exists schema_migrations/),
      'select filename from schema_migrations',
    ]);
  });

  it('applies only the files that are missing from the ledger', async () => {
    const { executor, log } = fakeExecutor(['0001_init.sql']);
    const result = await runMigrations(executor, files);
    expect(result.applied).toEqual(['0002_auth.sql', '0003_streaks.sql']);
    expect(result.skipped).toEqual(['0001_init.sql']);
    expect(log).not.toContain('create table users ()');
  });

  it('fails when the ledger names a file that no longer exists', async () => {
    const { executor } = fakeExecutor(['0001_init.sql', '0009_gone.sql']);
    await expect(runMigrations(executor, files)).rejects.toThrow(/0009_gone.sql/);
  });

  it('stops at the first failing migration and records nothing for it', async () => {
    const { executor, applied } = fakeExecutor();
    const broken: MigrationFile[] = [
      { name: '0001_init.sql', sql: 'create table users ()' },
      { name: '0002_bad.sql', sql: 'boom' },
      { name: '0003_after.sql', sql: 'create table after ()' },
    ];
    const original = executor.query.bind(executor);
    executor.query = async (sql, params) => {
      if (sql === 'boom') throw new Error('syntax error');
      return original(sql, params);
    };
    await expect(runMigrations(executor, broken)).rejects.toThrow(/syntax error/);
    expect([...applied]).toEqual(['0001_init.sql']);
  });
});
