// Row P1-41: a React Server Component must be able to import the interactive
// components from the package entry. That works only when every file that
// needs the browser starts with the 'use client' directive.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(testsDir, '..', 'src');
const componentsDir = path.join(srcDir, 'components');

const DIRECTIVE = /^['"]use client['"];?$/;

/** Named value imports from `react` and `react-dom`. Type imports are skipped. */
function runtimeImports(source: string): string[] {
  const names: string[] = [];
  const pattern = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"](react|react-dom)['"]/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) continue;
    for (const part of (match[2] ?? '').split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0] ?? '';
      if (name !== '' && !name.startsWith('type ')) names.push(name);
    }
  }
  return names;
}

/** True when the file calls a React hook or renders through a portal. */
function needsClient(source: string): boolean {
  const imported = runtimeImports(source).some(
    (name) => /^use[A-Z]/.test(name) || name === 'createPortal',
  );
  const viaNamespace = /\bReact(DOM)?\.(use[A-Z]\w*|createPortal)\b/.test(source);
  return imported || viaNamespace;
}

function startsWithDirective(source: string): boolean {
  const firstLine = source.split(/\r?\n/)[0] ?? '';
  return DIRECTIVE.test(firstLine.trim());
}

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

const componentFiles = fs
  .readdirSync(componentsDir)
  .filter((name) => /\.tsx?$/.test(name))
  .sort();

/** The files that must be client modules whatever the import scan says. */
const INTERACTIVE = [
  'Choice.tsx',
  'FeedbackFab.tsx',
  'RatingInput.tsx',
  'Sheet.tsx',
  'TextArea.tsx',
  'TextInput.tsx',
  'Toast.tsx',
];

describe('client directives', () => {
  it('finds the component files', () => {
    expect(componentFiles.length).toBeGreaterThanOrEqual(11);
    for (const name of INTERACTIVE) expect(componentFiles).toContain(name);
  });

  it.each(componentFiles)(
    '%s starts with the directive when it uses a hook or a portal',
    (name) => {
      const source = read(path.join(componentsDir, name));
      if (needsClient(source)) expect(startsWithDirective(source)).toBe(true);
    },
  );

  it.each(INTERACTIVE)('%s is a client module', (name) => {
    expect(startsWithDirective(read(path.join(componentsDir, name)))).toBe(true);
  });

  it('a file without the directive uses no hook and no portal', () => {
    const plain = componentFiles.filter(
      (name) => !startsWithDirective(read(path.join(componentsDir, name))),
    );
    expect(plain).toEqual(['Button.tsx', 'Card.tsx', 'Progress.tsx', 'cx.ts']);
    for (const name of plain) expect(needsClient(read(path.join(componentsDir, name)))).toBe(false);
  });

  it('keeps the entry and the tokens free of the directive so tokens work on the server', () => {
    for (const name of ['index.ts', 'tokens.ts']) {
      expect(read(path.join(srcDir, name))).not.toMatch(/['"]use client['"]/);
    }
  });

  it('the scan itself tells a hook import from a type import', () => {
    expect(needsClient("import { useId } from 'react';")).toBe(true);
    expect(needsClient("import { createPortal } from 'react-dom';")).toBe(true);
    expect(needsClient("import { createElement } from 'react';")).toBe(false);
    expect(needsClient("import type { useId } from 'react';")).toBe(false);
    expect(startsWithDirective("// note\n'use client';")).toBe(false);
  });
});
