#!/usr/bin/env node
// check-boundaries.mjs
//
// Verifies that no box imports another box's internals.
//
// Rules (see docs/02-architecture.md):
//   contracts  -> nothing
//   core-*     -> contracts only
//   lang-*     -> contracts only
//   ui-kit     -> contracts only
//   surface    -> anything (apps/web)
//
// A box may only import what its module.json depends_on lists, and that list
// must itself obey the structural rules above. Imports of another box must go
// through the package root (@stufen/<box>), never a subpath. Relative imports
// must stay inside the box's own directory. "peers" in module.json are
// informational (runtime registration) and do not grant import permission.
//
// Exit 0 on pass, 1 on failure. No dependencies. Node 24.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '@stufen/';
const BOX_ROOTS = ['packages', 'apps'];
const SRC_EXT = new Set(['.ts', '.tsx']);

// ---------- discovery ----------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function discoverBoxes() {
  const boxes = [];
  for (const rootName of BOX_ROOTS) {
    const rootDir = path.join(ROOT, rootName);
    if (!fs.existsSync(rootDir)) continue;
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(rootDir, entry.name);
      const moduleFile = path.join(dir, 'module.json');
      if (!fs.existsSync(moduleFile)) continue;
      const meta = readJson(moduleFile);
      const id = String(meta.name ?? '').startsWith(SCOPE) ? meta.name.slice(SCOPE.length) : null;
      boxes.push({
        id,
        rawName: meta.name,
        kind: meta.kind,
        dir,
        rel: path.relative(ROOT, dir).split(path.sep).join('/'),
        dependsOn: Array.isArray(meta.depends_on) ? meta.depends_on : [],
        peers: Array.isArray(meta.peers) ? meta.peers : [],
      });
    }
  }
  return boxes;
}

// ---------- rules ----------

function structuralAllowed(box, allIds) {
  if (box.id === 'contracts' || box.kind === 'contracts') return new Set();
  if (box.id === 'ui-kit') return new Set(['contracts']);
  if (box.kind === 'surface') return new Set(allIds.filter((x) => x !== box.id));
  return new Set(['contracts']);
}

function importsAnything(box) {
  return box.kind === 'surface' && box.id !== 'ui-kit';
}

function expectedKind(id) {
  if (id === 'contracts') return 'contracts';
  if (id.startsWith('core-')) return 'core';
  if (id.startsWith('lang-')) return 'lang';
  return 'surface';
}

// ---------- scanning ----------

function listSourceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist')
          continue;
        stack.push(full);
      } else if (SRC_EXT.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  }
  return out;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractSpecifiers(code) {
  const specs = new Set();
  const clean = stripComments(code);
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

function boxContaining(absPath, boxes) {
  for (const b of boxes) {
    const relp = path.relative(b.dir, absPath);
    if (relp && !relp.startsWith('..') && !path.isAbsolute(relp)) return b;
    if (relp === '') return b;
  }
  return null;
}

// ---------- main ----------

const boxes = discoverBoxes();
const allIds = boxes.map((b) => b.id).filter(Boolean);
const byId = new Map(boxes.map((b) => [b.id, b]));
const violations = [];
const summary = [];

function violate(box, file, specifier, problem) {
  violations.push({
    box: box.id ?? box.rel,
    file: file ? path.relative(ROOT, file).split(path.sep).join('/') : box.rel + '/module.json',
    specifier,
    problem,
  });
}

for (const box of boxes) {
  // module.json sanity
  if (!box.id) {
    violate(box, null, String(box.rawName), `name must start with ${SCOPE}`);
    continue;
  }
  const kindWanted = expectedKind(box.id);
  if (box.kind !== kindWanted) {
    violate(box, null, `kind: ${box.kind}`, `expected kind "${kindWanted}" for this box name`);
  }

  const structural = structuralAllowed(box, allIds);
  const allowed = new Set();
  for (const dep of box.dependsOn) {
    if (!byId.has(dep)) {
      violate(box, null, dep, 'depends_on names a box that does not exist');
      continue;
    }
    if (!structural.has(dep)) {
      violate(box, null, dep, `depends_on not permitted for kind "${box.kind}"`);
      continue;
    }
    allowed.add(dep);
  }
  for (const peer of box.peers) {
    if (!byId.has(peer)) violate(box, null, peer, 'peers names a box that does not exist');
  }

  // source scan
  const files = listSourceFiles(path.join(box.dir, 'src'));
  let importCount = 0;
  for (const file of files) {
    const specs = extractSpecifiers(fs.readFileSync(file, 'utf8'));
    for (const spec of specs) {
      if (spec.startsWith(SCOPE)) {
        importCount++;
        const rest = spec.slice(SCOPE.length);
        const slash = rest.indexOf('/');
        const target = slash === -1 ? rest : rest.slice(0, slash);
        const subpath = slash === -1 ? '' : rest.slice(slash + 1);
        if (!byId.has(target)) {
          violate(box, file, spec, 'imports a box that does not exist');
          continue;
        }
        if (subpath) {
          violate(box, file, spec, `deep import into ${target}; only the package root is public`);
          continue;
        }
        if (target === box.id) continue;
        if (!allowed.has(target)) {
          violate(
            box,
            file,
            spec,
            `${box.id} may not import ${target} (allowed: ${[...allowed].join(', ') || 'nothing'})`,
          );
        }
      } else if (spec.startsWith('.')) {
        importCount++;
        const resolved = path.resolve(path.dirname(file), spec);
        const relToBox = path.relative(box.dir, resolved);
        if (relToBox.startsWith('..') || path.isAbsolute(relToBox)) {
          const other = boxContaining(resolved, boxes);
          const where = other ? `reaches into ${other.id}` : 'leaves the box directory';
          violate(box, file, spec, `relative import ${where}`);
        }
      }
    }
  }

  summary.push({
    box: box.id,
    kind: box.kind,
    allowed: importsAnything(box) ? 'any' : [...allowed].join(', ') || 'none',
    files: files.length,
    imports: importCount,
  });
}

// ---------- output ----------

function table(rows, columns) {
  const widths = columns.map((c) =>
    Math.max(c.label.length, ...rows.map((r) => String(r[c.key]).length)),
  );
  const line = (cells) =>
    '| ' + cells.map((v, i) => String(v).padEnd(widths[i])).join(' | ') + ' |';
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  const out = [line(columns.map((c) => c.label)), sep];
  for (const r of rows) out.push(line(columns.map((c) => r[c.key])));
  return out.join('\n');
}

console.log(`check-boundaries: ${boxes.length} boxes found under ${BOX_ROOTS.join(', ')}\n`);

if (violations.length) {
  console.log('VIOLATIONS\n');
  console.log(
    table(violations, [
      { key: 'box', label: 'Box' },
      { key: 'file', label: 'File' },
      { key: 'specifier', label: 'Import' },
      { key: 'problem', label: 'Problem' },
    ]),
  );
  console.log('');
}

const summaryRows = summary.map((s) => ({
  ...s,
  result: violations.some((v) => v.box === s.box) ? 'FAIL' : 'pass',
}));

console.log('SUMMARY\n');
console.log(
  table(summaryRows, [
    { key: 'box', label: 'Box' },
    { key: 'kind', label: 'Kind' },
    { key: 'allowed', label: 'May import' },
    { key: 'files', label: 'Files' },
    { key: 'imports', label: 'Imports checked' },
    { key: 'result', label: 'Result' },
  ]),
);

if (violations.length) {
  console.log(`\n${violations.length} violation(s). The change is wrong, not the script.`);
  process.exit(1);
}
console.log('\nAll boundaries respected.');
process.exit(0);
