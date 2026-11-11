// Each type's payloadSchema must say the same as content/schema/exercise.schema.json.
// The one known difference: read_answer and listen_answer questions also allow
// a short answer form, so their first oneOf entry is compared with the content
// schema's question definition.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ExerciseTypeId } from '@stufen/contracts';
import { createExerciseTypeRegistry, registerDeterministicTypes } from '../src/index';
import { isRecord } from '../src/schema';

const schemaFile = new URL('../../../content/schema/exercise.schema.json', import.meta.url);
const contentSchema: unknown = JSON.parse(fs.readFileSync(fileURLToPath(schemaFile), 'utf8'));
const defs = isRecord(contentSchema) && isRecord(contentSchema.$defs) ? contentSchema.$defs : {};

const defName: Partial<Record<ExerciseTypeId, string>> = {
  multiple_choice: 'multipleChoice',
  cloze: 'cloze',
  match_pairs: 'matchPairs',
  order_words: 'orderWords',
  flashcard: 'flashcard',
  read_answer: 'readAnswer',
  listen_answer: 'listenAnswer',
  dictation: 'dictation',
};

/** Drops descriptions, follows $ref and reduces our question oneOf to its first entry. */
function plain(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(plain);
  if (!isRecord(node)) return node;
  if (typeof node.$ref === 'string') return plain(defs[node.$ref.replace('#/$defs/', '')]);
  if (Array.isArray(node.oneOf)) return plain(node.oneOf[0]);
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'description' || isRecord(value)) copy[key] = plain(value);
  }
  return copy;
}

describe('payload schemas match content/schema/exercise.schema.json', () => {
  const registry = createExerciseTypeRegistry();
  registerDeterministicTypes(registry);

  it.each(registry.listTypes().map((def) => [def.id, def] as const))('%s', (id, def) => {
    const name = defName[id];
    expect(name).toBeDefined();
    expect(plain(def.payloadSchema)).toEqual(plain(defs[name ?? '']));
  });
});
