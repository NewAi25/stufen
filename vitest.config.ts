// Shared Vitest configuration for the whole repo.
//
// Run from the repo root (`pnpm test`): every box under packages/ and apps/
// becomes a named project, and only files under that box's tests/ folder run.
// Run from inside a box (`pnpm --filter <box> test`): Vitest finds this file by
// walking up, keeps the box as root, and runs only that box's tests/ folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const atRepoRoot = path.resolve(process.cwd()) === repoRoot;

const boxTests = ['tests/**/*.test.ts', 'tests/**/*.test.tsx'];

function boxProjects() {
  const projects = [];
  for (const parent of ['packages', 'apps']) {
    const parentDir = path.join(repoRoot, parent);
    if (!fs.existsSync(parentDir)) continue;
    for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(parentDir, entry.name);
      const pkgFile = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgFile)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { name?: string };
      projects.push({
        extends: true as const,
        test: {
          name: pkg.name ?? `${parent}/${entry.name}`,
          root: dir,
          include: boxTests,
        },
      });
    }
  }
  return projects;
}

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    ...(atRepoRoot ? { projects: boxProjects() } : { include: boxTests }),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: path.join(repoRoot, 'coverage'),
      include: ['packages/*/src/**', 'apps/*/src/**'],
    },
  },
});
