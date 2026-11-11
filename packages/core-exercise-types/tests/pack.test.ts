// Proves the graders fit the real German content. Loads the two lesson files
// of unit A1 01, checks every deterministic exercise payload against its
// type's schema, and grades a right answer built from the payload.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ExerciseTypeId, Skill } from '@stufen/contracts';
import { createExerciseTypeRegistry, registerDeterministicTypes } from '../src/index';
import { checkSchema, isRecord } from '../src/schema';
import { ctxWithRules, ctxWithoutRules } from './helpers';

interface PackExercise {
  key: string;
  type: ExerciseTypeId;
  skill: Skill;
  payload: Record<string, unknown>;
}

const unitDir = new URL('../../../content/de/units/A1/01-hallo/', import.meta.url);

function loadExercises(file: string): PackExercise[] {
  const raw: unknown = JSON.parse(fs.readFileSync(fileURLToPath(new URL(file, unitDir)), 'utf8'));
  if (!isRecord(raw) || !Array.isArray(raw.exercises)) throw new Error(`${file} has no exercises`);
  return raw.exercises as PackExercise[];
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Builds the response a learner would give if they got everything right. */
function rightResponse(exercise: PackExercise): unknown {
  const payload = exercise.payload;
  switch (exercise.type) {
    case 'multiple_choice':
      return { selected: payload.answer_index };
    case 'cloze':
      return { answers: list(payload.blanks).map((blank) => blank.answer) };
    case 'match_pairs':
      return { pairs: list(payload.pairs).map(({ left, right }) => ({ left, right })) };
    case 'order_words':
      return { order: String(payload.answer).split(' ') };
    case 'flashcard':
      return { rating: 'good' };
    case 'read_answer':
    case 'listen_answer':
      return {
        answers: list(payload.questions).map(
          (question) => question.answer_index ?? question.answer,
        ),
      };
    case 'dictation':
      return { text: payload.text };
    default:
      throw new Error(`No right response for ${exercise.type}`);
  }
}

const registry = createExerciseTypeRegistry();
registerDeterministicTypes(registry);

const all = [...loadExercises('lesson-01.json'), ...loadExercises('lesson-02.json')];
const deterministic = all.filter((exercise) => registry.hasType(exercise.type));
const cases = deterministic.map((exercise) => [exercise.key, exercise.type, exercise] as const);

describe('real content pack, unit A1 01', () => {
  it('has at least one exercise of each of the eight deterministic types', () => {
    const seen = new Set(deterministic.map((exercise) => exercise.type));
    expect([...seen].sort()).toEqual(
      registry
        .listTypes()
        .map((def) => def.id)
        .sort(),
    );
  });

  it('leaves only the three AI graded types unregistered', () => {
    const skipped = new Set(
      all.filter((exercise) => !registry.hasType(exercise.type)).map((exercise) => exercise.type),
    );
    expect([...skipped].sort()).toEqual(['speak_prompt', 'translate', 'write_free']);
  });

  it.each(cases)('%s (%s) payload fits the schema', (_key, type, exercise) => {
    expect(checkSchema(registry.getType(type).payloadSchema, exercise.payload)).toEqual([]);
  });

  it.each(cases)('%s (%s) names a skill the type can evidence', (_key, type, exercise) => {
    expect(registry.getType(type).skill).toContain(exercise.skill);
  });

  it.each(cases)('%s (%s) grades a right answer as correct', async (_key, type, exercise) => {
    const def = registry.getType(type);
    const response = rightResponse(exercise);
    for (const ctx of [ctxWithRules(), ctxWithoutRules()]) {
      const result = await def.grade(exercise.payload, response, ctx);
      expect(result.correct).toBe(true);
      expect(result.score).toBe(type === 'flashcard' ? 0.8 : 1);
      expect(result.feedback.message.length).toBeGreaterThan(0);
    }
  });

  it.each(cases)('%s (%s) grades a wrong answer as not correct', async (_key, type, exercise) => {
    // For option questions, pick an option that is not the answer.
    const otherOption = (source: Record<string, unknown>) => (Number(source.answer_index) + 1) % 2;
    const questions = list(exercise.payload.questions);
    const wrong: Partial<Record<ExerciseTypeId, unknown>> = {
      multiple_choice: { selected: otherOption(exercise.payload) },
      cloze: { answers: list(exercise.payload.blanks).map(() => '') },
      match_pairs: { pairs: [] },
      order_words: { order: [] },
      flashcard: { rating: 'again' },
      read_answer: { answers: questions.map(otherOption) },
      listen_answer: { answers: questions.map(otherOption) },
      dictation: { text: '' },
    };
    const result = await registry
      .getType(type)
      .grade(exercise.payload, wrong[type], ctxWithRules());
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });
});
