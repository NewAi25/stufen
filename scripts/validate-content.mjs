#!/usr/bin/env node
// Validates content packs under content/<lang> against content/schema and
// checks referential integrity. Node built ins only.
//
// Usage:
//   node scripts/validate-content.mjs                 validate every pack
//   node scripts/validate-content.mjs de              validate one pack
//   node scripts/validate-content.mjs de --write-checksum
//                                                     stamp the sha256 into pack.json
//
// Exit code 0 when no check fails, 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_DIR = path.join(ROOT, 'content', 'schema');
const CONTENT_DIR = path.join(ROOT, 'content');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ---------------------------------------------------------------------------
// Minimal JSON Schema (draft 2020-12 subset)
// Supported: $ref, $defs, type, const, enum, required, properties,
// additionalProperties, items, minItems, maxItems, minLength, maxLength,
// pattern, minimum, maximum, oneOf (discriminated on a const property),
// anyOf, allOf.
// ---------------------------------------------------------------------------

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function matchesType(v, t) {
  if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
  if (t === 'number') return typeof v === 'number';
  return typeOf(v) === t;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

class SchemaSet {
  constructor(dir) {
    this.byId = new Map();
    this.byName = new Map();
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.schema.json')) continue;
      const schema = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (!schema.$id) throw new Error(`${file} has no $id`);
      this.byId.set(schema.$id, schema);
      this.byName.set(file.replace('.schema.json', ''), schema);
    }
  }

  get(name) {
    const s = this.byName.get(name);
    if (!s) throw new Error(`schema ${name} not found in ${SCHEMA_DIR}`);
    return s;
  }

  resolve(ref, root) {
    const [uri, frag] = ref.split('#');
    let base = root;
    if (uri) {
      base = this.byId.get(uri);
      if (!base) throw new Error(`cannot resolve $ref ${ref}`);
    }
    let node = base;
    if (frag) {
      for (const seg of frag.split('/').filter(Boolean)) {
        node = node?.[seg];
        if (node === undefined) throw new Error(`cannot resolve $ref ${ref}`);
      }
    }
    return { schema: node, root: base };
  }

  check(instance, schema, root, at, errors) {
    if (schema === true) return;
    if (schema === false) {
      errors.push(`${at}: schema forbids any value`);
      return;
    }

    if (schema.$ref) {
      const r = this.resolve(schema.$ref, root);
      this.check(instance, r.schema, r.root, at, errors);
      return;
    }

    if (schema.type !== undefined) {
      const types = [].concat(schema.type);
      if (!types.some((t) => matchesType(instance, t))) {
        errors.push(`${at}: expected ${types.join(' or ')}, got ${typeOf(instance)}`);
        return;
      }
    }

    if ('const' in schema && instance !== schema.const) {
      errors.push(
        `${at}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`,
      );
    }

    if (schema.enum && !schema.enum.includes(instance)) {
      errors.push(`${at}: ${JSON.stringify(instance)} is not one of ${schema.enum.join(', ')}`);
    }

    if (typeof instance === 'string') {
      if (schema.minLength !== undefined && instance.length < schema.minLength) {
        errors.push(`${at}: shorter than ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && instance.length > schema.maxLength) {
        errors.push(`${at}: longer than ${schema.maxLength}`);
      }
      if (schema.pattern && !new RegExp(schema.pattern, 'u').test(instance)) {
        errors.push(`${at}: ${JSON.stringify(instance)} does not match ${schema.pattern}`);
      }
    }

    if (typeof instance === 'number') {
      if (schema.minimum !== undefined && instance < schema.minimum) {
        errors.push(`${at}: ${instance} is below minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && instance > schema.maximum) {
        errors.push(`${at}: ${instance} is above maximum ${schema.maximum}`);
      }
    }

    if (Array.isArray(instance)) {
      if (schema.minItems !== undefined && instance.length < schema.minItems) {
        errors.push(`${at}: needs at least ${schema.minItems} items, has ${instance.length}`);
      }
      if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
        errors.push(`${at}: allows at most ${schema.maxItems} items, has ${instance.length}`);
      }
      if (schema.items) {
        instance.forEach((el, i) => this.check(el, schema.items, root, `${at}[${i}]`, errors));
      }
    }

    if (isObject(instance)) {
      for (const key of schema.required || []) {
        if (!(key in instance)) errors.push(`${at}: missing required property ${key}`);
      }
      const props = schema.properties || {};
      for (const [key, sub] of Object.entries(props)) {
        if (key in instance) this.check(instance[key], sub, root, `${at}.${key}`, errors);
      }
      if (schema.additionalProperties !== undefined) {
        for (const key of Object.keys(instance)) {
          if (key in props) continue;
          if (schema.additionalProperties === false) {
            errors.push(`${at}: unexpected property ${key}`);
          } else if (isObject(schema.additionalProperties)) {
            this.check(instance[key], schema.additionalProperties, root, `${at}.${key}`, errors);
          }
        }
      }
    }

    if (schema.allOf) {
      for (const sub of schema.allOf) this.check(instance, sub, root, at, errors);
    }

    if (schema.anyOf) {
      const ok = schema.anyOf.some((sub) => {
        const e = [];
        this.check(instance, sub, root, at, e);
        return e.length === 0;
      });
      if (!ok) errors.push(`${at}: matches none of the anyOf branches`);
    }

    if (schema.oneOf) this.checkOneOf(instance, schema.oneOf, root, at, errors);
  }

  // oneOf with a discriminator: each branch names one or more properties with
  // a const. The branch whose consts all match the instance is the one used.
  checkOneOf(instance, branches, root, at, errors) {
    const discs = branches.map((b) =>
      Object.entries(b.properties || {}).filter(([, s]) => isObject(s) && 'const' in s),
    );
    const discriminated = discs.length > 0 && discs.every((d) => d.length > 0);

    if (discriminated && isObject(instance)) {
      const matching = branches.filter((b, i) =>
        discs[i].every(([k, s]) => instance[k] === s.const),
      );
      if (matching.length === 1) {
        this.check(instance, matching[0], root, at, errors);
      } else {
        const names = discs[0].map(([k]) => `${k}=${JSON.stringify(instance[k])}`).join(', ');
        errors.push(
          `${at}: ${matching.length === 0 ? 'no' : 'more than one'} oneOf branch matches ${names}`,
        );
      }
      return;
    }

    let passed = 0;
    for (const sub of branches) {
      const e = [];
      this.check(instance, sub, root, at, e);
      if (e.length === 0) passed += 1;
    }
    if (passed !== 1) errors.push(`${at}: ${passed} oneOf branches match, expected exactly 1`);
  }

  validate(instance, schemaName, at) {
    const schema = this.get(schemaName);
    const errors = [];
    this.check(instance, schema, schema, at, errors);
    return errors;
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

class Report {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }
  pass(check, detail = '') {
    this.rows.push({ check, status: 'pass', detail });
  }
  warn(check, detail = '') {
    this.rows.push({ check, status: 'warn', detail });
  }
  fail(check, detail = '') {
    this.rows.push({ check, status: 'FAIL', detail });
  }

  // Adds one row per problem, or a single pass row.
  fromErrors(check, errors, passDetail) {
    if (errors.length === 0) {
      this.pass(check, passDetail);
      return;
    }
    for (const e of errors.slice(0, 25)) this.fail(check, e);
    if (errors.length > 25) this.fail(check, `... and ${errors.length - 25} more`);
  }

  get failed() {
    return this.rows.filter((r) => r.status === 'FAIL').length;
  }
  get warned() {
    return this.rows.filter((r) => r.status === 'warn').length;
  }
  get passed() {
    return this.rows.filter((r) => r.status === 'pass').length;
  }

  print() {
    const w1 = Math.max(5, ...this.rows.map((r) => r.check.length));
    const w2 = 6;
    const line = `+${'-'.repeat(w1 + 2)}+${'-'.repeat(w2 + 2)}+${'-'.repeat(72)}+`;
    console.log(`\nPack: ${this.name}`);
    console.log(line);
    console.log(`| ${'check'.padEnd(w1)} | ${'status'.padEnd(w2)} | ${'detail'.padEnd(70)} |`);
    console.log(line);
    for (const r of this.rows) {
      const detail = r.detail.length > 70 ? r.detail.slice(0, 67) + '...' : r.detail;
      console.log(`| ${r.check.padEnd(w1)} | ${r.status.padEnd(w2)} | ${detail.padEnd(70)} |`);
    }
    console.log(line);
    console.log(`${this.passed} pass, ${this.warned} warn, ${this.failed} fail`);
    const long = this.rows.filter((r) => r.status !== 'pass' && r.detail.length > 70);
    if (long.length) {
      console.log('\nFull detail for truncated rows:');
      for (const r of long) console.log(`  [${r.status}] ${r.check}: ${r.detail}`);
    }
  }
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      out.push({ line: i + 1, value: JSON.parse(line) });
    } catch (e) {
      out.push({ line: i + 1, error: e.message });
    }
  });
  return out;
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function computeChecksum(packDir) {
  const hash = crypto.createHash('sha256');
  for (const file of listFiles(packDir)) {
    const rel = path.relative(packDir, file).split(path.sep).join('/');
    if (rel === 'pack.json') continue;
    hash.update(rel + '\n');
    hash.update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    hash.update('\n');
  }
  return 'sha256:' + hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Pack validation
// ---------------------------------------------------------------------------

function validatePack(packDir, schemas, opts) {
  const dirName = path.basename(packDir);
  const report = new Report(dirName);

  // 1. Manifest
  const packFile = path.join(packDir, 'pack.json');
  if (!fs.existsSync(packFile)) {
    report.fail('pack.json', 'missing');
    return report;
  }
  let pack;
  try {
    pack = readJson(packFile);
  } catch (e) {
    report.fail('pack.json', `invalid JSON: ${e.message}`);
    return report;
  }
  const packErrors = schemas.validate(pack, 'pack', 'pack.json');
  report.fromErrors('pack.json schema', packErrors, `${pack.code} ${pack.version}`);
  if (packErrors.length) return report;

  const code = pack.code;
  if (dirName.startsWith('_')) {
    report.warn(
      'pack.json code',
      `template directory, code ${code} not checked against directory name`,
    );
  } else if (code !== dirName) {
    report.fail('pack.json code', `code ${code} does not match directory ${dirName}`);
  } else {
    report.pass('pack.json code', code);
  }

  const sourceIds = new Set(pack.sources.map((s) => s.id));
  const dupSources = pack.sources.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupSources.length)
    report.fail('pack.json sources', `duplicate source id ${dupSources.join(', ')}`);
  else report.pass('pack.json sources', `${sourceIds.size} sources`);

  const sourceOk = (s) => s === undefined || s === 'unverified' || sourceIds.has(s);
  const strict = pack.strictUnitEnding !== false;

  // 2. Ramp
  const rampFile = path.join(packDir, 'ramp.json');
  if (!fs.existsSync(rampFile)) {
    report.fail('ramp.json', 'missing');
  } else {
    try {
      const ramp = readJson(rampFile);
      report.fromErrors(
        'ramp.json schema',
        schemas.validate(ramp, 'ramp', 'ramp.json'),
        'six levels',
      );
    } catch (e) {
      report.fail('ramp.json', `invalid JSON: ${e.message}`);
    }
  }

  // 3. Exam formats
  const examFile = path.join(packDir, 'exam-formats.json');
  if (!fs.existsSync(examFile)) {
    report.fail('exam-formats.json', 'missing');
  } else {
    try {
      const formats = readJson(examFile);
      if (!Array.isArray(formats)) {
        report.fail('exam-formats.json', 'must be a JSON array');
      } else {
        const errors = [];
        const ids = new Set();
        formats.forEach((f, i) => {
          errors.push(...schemas.validate(f, 'exam-format', `exam-formats.json[${i}]`));
          if (ids.has(f.id)) errors.push(`exam-formats.json[${i}]: duplicate id ${f.id}`);
          ids.add(f.id);
          if (!sourceOk(f.source))
            errors.push(`exam-formats.json[${i}].source: ${f.source} is not in pack.json sources`);
          for (const [j, s] of (f.sections || []).entries()) {
            if (!sourceOk(s.source))
              errors.push(
                `exam-formats.json[${i}].sections[${j}].source: ${s.source} is not in pack.json sources`,
              );
          }
        });
        report.fromErrors('exam-formats.json', errors, `${formats.length} formats`);
        if (formats.length === 0) report.warn('exam-formats.json', 'no exam formats yet');
      }
    } catch (e) {
      report.fail('exam-formats.json', `invalid JSON: ${e.message}`);
    }
  }

  // 4. Can do descriptors
  const candos = new Map(); // key -> { cando, file }
  const candoDir = path.join(packDir, 'candos');
  if (!fs.existsSync(candoDir)) {
    report.fail('candos/', 'directory missing');
  } else {
    const files = fs
      .readdirSync(candoDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    if (files.length === 0) report.warn('candos/', 'no descriptor files');
    for (const file of files) {
      const level = file.replace('.json', '');
      const label = `candos/${file}`;
      if (!LEVELS.includes(level)) {
        report.fail(label, `file name must be <LEVEL>.json, got ${file}`);
        continue;
      }
      let arr;
      try {
        arr = readJson(path.join(candoDir, file));
      } catch (e) {
        report.fail(label, `invalid JSON: ${e.message}`);
        continue;
      }
      if (!Array.isArray(arr)) {
        report.fail(label, 'must be a JSON array');
        continue;
      }
      const errors = [];
      arr.forEach((c, i) => {
        const at = `${label}[${i}]`;
        errors.push(...schemas.validate(c, 'cando', at));
        if (!isObject(c)) return;
        if (c.level && c.level !== level) errors.push(`${at}: level ${c.level} in file ${file}`);
        if (c.key && c.code && c.key !== `${code}:cando:${c.code}`)
          errors.push(`${at}: key ${c.key} must equal ${code}:cando:${c.code}`);
        if (c.key && candos.has(c.key)) errors.push(`${at}: duplicate key ${c.key}`);
        if (!sourceOk(c.source))
          errors.push(`${at}.source: ${c.source} is not in pack.json sources`);
        if (c.key) candos.set(c.key, { cando: c, file, targeted: false });
      });
      report.fromErrors(label, errors, `${arr.length} descriptors`);
      if (arr.length === 0) report.warn(label, 'empty');
    }
  }

  // 5. Items
  const items = new Map(); // key -> { item, used }
  const itemDir = path.join(packDir, 'items');
  if (!fs.existsSync(itemDir)) {
    report.fail('items/', 'directory missing');
  } else {
    const files = fs
      .readdirSync(itemDir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
    if (files.length === 0) report.warn('items/', 'no item files');
    for (const file of files) {
      const level = file.replace('.jsonl', '');
      const label = `items/${file}`;
      if (!LEVELS.includes(level)) {
        report.fail(label, `file name must be <LEVEL>.jsonl, got ${file}`);
        continue;
      }
      const errors = [];
      let count = 0;
      for (const entry of readJsonl(path.join(itemDir, file))) {
        const at = `${label}:${entry.line}`;
        if (entry.error) {
          errors.push(`${at}: invalid JSON: ${entry.error}`);
          continue;
        }
        const it = entry.value;
        count += 1;
        errors.push(...schemas.validate(it, 'item', at));
        if (!isObject(it)) continue;
        if (it.level && it.level !== level) errors.push(`${at}: level ${it.level} in file ${file}`);
        if (it.key && !it.key.startsWith(`${code}:`))
          errors.push(`${at}: key ${it.key} must start with ${code}:`);
        if (it.key && it.kind && !it.key.startsWith(`${code}:${it.kind}:`))
          errors.push(`${at}: key ${it.key} must start with ${code}:${it.kind}:`);
        if (it.key && items.has(it.key)) errors.push(`${at}: duplicate key ${it.key}`);
        if (!sourceOk(it.source))
          errors.push(`${at}.source: ${it.source} is not in pack.json sources`);
        if (it.kind === 'vocab' && isObject(it.payload) && it.payload.pos === 'noun') {
          if (!it.payload.gender) errors.push(`${at}.payload: noun needs gender`);
          if (!it.payload.plural)
            errors.push(`${at}.payload: noun needs plural (or the string none)`);
        }
        if (it.key) items.set(it.key, { item: it, used: false });
      }
      report.fromErrors(label, errors, `${count} items`);
      if (count === 0) report.warn(label, 'empty');
    }
  }

  // 6. Units and lessons
  const unitDir = path.join(packDir, 'units');
  const unitKeys = new Set();
  const lessonKeys = new Set();
  const exerciseKeys = new Set();
  let unitCount = 0;
  let lessonCount = 0;
  let exerciseCount = 0;
  const endingErrors = [];

  if (!fs.existsSync(unitDir)) {
    report.fail('units/', 'directory missing');
  } else {
    const levelDirs = fs
      .readdirSync(unitDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (levelDirs.length === 0) report.warn('units/', 'no units yet');
    for (const level of levelDirs) {
      if (!LEVELS.includes(level)) {
        report.fail(`units/${level}`, 'directory must be a level A1 to C2');
        continue;
      }
      const lvl = level.toLowerCase();
      const unitDirs = fs
        .readdirSync(path.join(unitDir, level), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      const ordinals = new Set();
      for (const ud of unitDirs) {
        const label = `units/${level}/${ud}`;
        const m = /^([0-9]{2})-([a-z0-9][a-z0-9-]*)$/.exec(ud);
        if (!m) {
          report.fail(label, 'directory must be <nn>-<slug>');
          continue;
        }
        const nn = m[1];
        const slug = m[2];
        const full = path.join(unitDir, level, ud);
        const unitFile = path.join(full, 'unit.json');
        if (!fs.existsSync(unitFile)) {
          report.fail(label, 'unit.json missing');
          continue;
        }
        let unit;
        try {
          unit = readJson(unitFile);
        } catch (e) {
          report.fail(`${label}/unit.json`, `invalid JSON: ${e.message}`);
          continue;
        }
        const errors = schemas.validate(unit, 'unit', '$');
        if (errors.length) {
          report.fromErrors(`${label}/unit.json`, errors);
          continue;
        }
        unitCount += 1;
        const uerr = [];
        const expectedKey = `${code}:unit:${lvl}-${nn}-${slug}`;
        if (unit.key !== expectedKey) uerr.push(`key ${unit.key} must equal ${expectedKey}`);
        if (unit.level !== level) uerr.push(`level ${unit.level} in directory ${level}`);
        if (unit.ordinal !== Number(nn))
          uerr.push(`ordinal ${unit.ordinal} must equal ${Number(nn)}`);
        if (unit.slug !== slug) uerr.push(`slug ${unit.slug} must equal ${slug}`);
        if (unitKeys.has(unit.key)) uerr.push(`duplicate unit key ${unit.key}`);
        if (ordinals.has(unit.ordinal)) uerr.push(`duplicate ordinal ${unit.ordinal} in ${level}`);
        if (!sourceOk(unit.source)) uerr.push(`source ${unit.source} is not in pack.json sources`);
        unitKeys.add(unit.key);
        ordinals.add(unit.ordinal);

        const onDisk = fs
          .readdirSync(full)
          .filter((f) => /^lesson-[0-9]{2}\.json$/.test(f))
          .sort();
        for (const f of unit.lessons)
          if (!onDisk.includes(f)) uerr.push(`listed lesson ${f} not found`);
        for (const f of onDisk)
          if (!unit.lessons.includes(f))
            uerr.push(`${f} exists but is not listed in unit.json lessons`);
        report.fromErrors(`${label}/unit.json`, uerr, `${unit.lessons.length} lessons`);

        // Lessons
        const kinds = [];
        unit.lessons.forEach((f, li) => {
          const lfile = path.join(full, f);
          const llabel = `${label}/${f}`;
          if (!fs.existsSync(lfile)) return;
          let lesson;
          try {
            lesson = readJson(lfile);
          } catch (e) {
            report.fail(llabel, `invalid JSON: ${e.message}`);
            return;
          }
          const lerr = schemas.validate(lesson, 'lesson', '$');
          if (lerr.length) {
            report.fromErrors(llabel, lerr);
            return;
          }
          lessonCount += 1;
          kinds.push(lesson.kind);
          const e = [];
          const lnn = /lesson-([0-9]{2})\.json/.exec(f)[1];
          const expectedLessonKey = `${code}:lesson:${lvl}-${nn}-${lnn}`;
          if (lesson.key !== expectedLessonKey)
            e.push(`key ${lesson.key} must equal ${expectedLessonKey}`);
          if (lesson.unit_key !== unit.key)
            e.push(`unit_key ${lesson.unit_key} must equal ${unit.key}`);
          if (lesson.ordinal !== Number(lnn))
            e.push(`ordinal ${lesson.ordinal} must equal ${Number(lnn)}`);
          if (lesson.ordinal !== li + 1)
            e.push(`ordinal ${lesson.ordinal} but listed at position ${li + 1} in unit.json`);
          if (lessonKeys.has(lesson.key)) e.push(`duplicate lesson key ${lesson.key}`);
          lessonKeys.add(lesson.key);
          if (!sourceOk(lesson.source))
            e.push(`source ${lesson.source} is not in pack.json sources`);

          for (const k of lesson.cando_ids) {
            if (!candos.has(k)) e.push(`cando_ids: ${k} does not exist`);
            else candos.get(k).targeted = true;
          }
          for (const k of lesson.introduces_item_ids || []) {
            if (!items.has(k)) e.push(`introduces_item_ids: ${k} does not exist`);
            else items.get(k).used = true;
          }

          // Exercises
          lesson.exercises.forEach((ex, xi) => {
            const xat = `exercises[${xi}]`;
            exerciseCount += 1;
            const enn = String(xi + 1).padStart(2, '0');
            const expectedExKey = `${code}:exercise:${lvl}-${nn}-${lnn}-${enn}`;
            if (ex.key !== expectedExKey)
              e.push(`${xat}: key ${ex.key} must equal ${expectedExKey}`);
            if (ex.ordinal !== xi + 1) e.push(`${xat}: ordinal ${ex.ordinal} must equal ${xi + 1}`);
            if (exerciseKeys.has(ex.key)) e.push(`${xat}: duplicate exercise key ${ex.key}`);
            exerciseKeys.add(ex.key);
            if (!sourceOk(ex.source))
              e.push(`${xat}: source ${ex.source} is not in pack.json sources`);
            for (const k of ex.cando_ids) {
              if (!candos.has(k)) e.push(`${xat}: cando_ids ${k} does not exist`);
              else {
                candos.get(k).targeted = true;
                if (!lesson.cando_ids.includes(k))
                  report.warn(llabel, `${xat} targets ${k} which is not in the lesson cando_ids`);
              }
            }
            for (const k of ex.item_ids) {
              if (!items.has(k)) e.push(`${xat}: item_ids ${k} does not exist`);
              else items.get(k).used = true;
            }
            e.push(...checkPayload(ex, xat));
          });

          report.fromErrors(llabel, e, `${lesson.exercises.length} exercises, kind ${lesson.kind}`);
        });

        // Unit ending rule
        if (strict) {
          const n = kinds.length;
          if (n < 2 || kinds[n - 2] !== 'production' || kinds[n - 1] !== 'review') {
            endingErrors.push(
              `${label}: lessons end with [${kinds.slice(-2).join(', ')}], expected [production, review]`,
            );
          }
        }
      }
    }
  }

  if (strict)
    report.fromErrors(
      'unit ending rule',
      endingErrors,
      `${unitCount} units end with production then review`,
    );
  else report.warn('unit ending rule', 'skipped, pack.json strictUnitEnding is false');

  // 7. Coverage
  const untargeted = [...candos.entries()].filter(([, v]) => !v.targeted).map(([k]) => k);
  if (untargeted.length)
    report.warn(
      'cando coverage',
      `${untargeted.length} descriptors not targeted by any lesson: ${untargeted.slice(0, 5).join(', ')}${untargeted.length > 5 ? ' ...' : ''}`,
    );
  else if (candos.size) report.pass('cando coverage', `all ${candos.size} descriptors targeted`);
  const unused = [...items.entries()].filter(([, v]) => !v.used).map(([k]) => k);
  if (unused.length)
    report.warn(
      'item coverage',
      `${unused.length} items not used by any lesson: ${unused.slice(0, 5).join(', ')}${unused.length > 5 ? ' ...' : ''}`,
    );
  else if (items.size) report.pass('item coverage', `all ${items.size} items used`);
  for (const level of pack.levels) {
    if (!fs.existsSync(path.join(candoDir, `${level}.json`)))
      report.warn('pack.json levels', `no candos/${level}.json for declared level ${level}`);
  }

  // 8. Checksum
  const actual = computeChecksum(packDir);
  if (opts.writeChecksum) {
    pack.checksum = actual;
    fs.writeFileSync(packFile, JSON.stringify(pack, null, 2) + '\n');
    report.pass('checksum', `written ${actual.slice(0, 23)}...`);
  } else if (pack.checksum === 'pending') {
    report.warn('checksum', 'pending, run with --write-checksum before release');
  } else if (pack.checksum !== actual) {
    report.fail(
      'checksum',
      `pack.json has ${pack.checksum.slice(0, 23)}..., files hash to ${actual.slice(0, 23)}...`,
    );
  } else {
    report.pass('checksum', actual.slice(0, 23) + '...');
  }

  report.pass(
    'totals',
    `${candos.size} candos, ${items.size} items, ${unitCount} units, ${lessonCount} lessons, ${exerciseCount} exercises`,
  );
  return report;
}

// Type specific payload checks that a schema cannot express.
function checkPayload(ex, at) {
  const e = [];
  const p = ex.payload;
  if (!isObject(p)) return e;
  const inRange = (idx, opts, where) => {
    if (Array.isArray(opts) && Number.isInteger(idx) && idx >= opts.length)
      e.push(`${at}: ${where} answer_index ${idx} is out of range for ${opts.length} options`);
  };
  switch (ex.type) {
    case 'multiple_choice':
      inRange(p.answer_index, p.options, 'payload');
      break;
    case 'read_answer':
    case 'listen_answer':
      (p.questions || []).forEach((q, i) => inRange(q.answer_index, q.options, `questions[${i}]`));
      break;
    case 'cloze': {
      const blanks = (p.text.match(/___/g) || []).length;
      if (blanks !== p.blanks.length)
        e.push(`${at}: text has ${blanks} blanks (___) but blanks has ${p.blanks.length} entries`);
      break;
    }
    case 'order_words': {
      const expected = [...p.words].sort().join(' ');
      const got = p.answer.split(/\s+/).sort().join(' ');
      if (expected !== got) e.push(`${at}: answer tokens do not match words`);
      for (const alt of p.accept || []) {
        if (alt.split(/\s+/).sort().join(' ') !== expected)
          e.push(`${at}: accept entry "${alt}" does not use the same words`);
      }
      break;
    }
    case 'speak_prompt':
      if (p.mode === 'read_aloud' && !p.target_text) e.push(`${at}: read_aloud needs target_text`);
      break;
    case 'write_free':
      if (p.max_words !== undefined && p.max_words < p.min_words)
        e.push(`${at}: max_words is below min_words`);
      break;
    default:
      break;
  }
  return e;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const langs = args.filter((a) => !a.startsWith('--'));
  const opts = { writeChecksum: flags.has('--write-checksum') };

  let schemas;
  try {
    schemas = new SchemaSet(SCHEMA_DIR);
  } catch (e) {
    console.error(`Cannot load schemas: ${e.message}`);
    process.exit(1);
  }

  const packs = langs.length
    ? langs
    : fs
        .readdirSync(CONTENT_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name !== 'schema')
        .map((d) => d.name)
        .sort();

  let failed = 0;
  for (const name of packs) {
    const dir = path.join(CONTENT_DIR, name);
    if (!fs.existsSync(dir)) {
      console.error(`content/${name} does not exist`);
      failed += 1;
      continue;
    }
    const report = validatePack(dir, schemas, opts);
    report.print();
    failed += report.failed;
  }

  console.log(failed === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failed} failing rows)`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
