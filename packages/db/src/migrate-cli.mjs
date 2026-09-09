#!/usr/bin/env node
// Applies packages/db/migrations to DATABASE_URL. Node 24 loads the .ts
// modules directly (type stripping), so no build step is needed.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm db:migrate

import { fileURLToPath } from 'node:url';
import { createDb } from './create-db.ts';
import { migrate } from './migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
const db = createDb(url);
try {
  const result = await migrate(db, dir);
  for (const name of result.skipped) console.log(`skip   ${name}`);
  for (const name of result.applied) console.log(`apply  ${name}`);
  console.log(`${result.applied.length} applied, ${result.skipped.length} already applied`);
} finally {
  await db.destroy();
}
