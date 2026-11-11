// @vitest-environment jsdom
// Row P1-18: every exercise of the eight deterministic types in the first two
// real lessons renders through ExerciseRenderer and shows its prompt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyValue, ExerciseRenderer, isComplete, RENDERABLE_TYPES } from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

interface LessonExercise {
  key: string;
  type: string;
  instruction_en?: string;
  payload: Record<string, unknown>;
}

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const unitDir = path.join(testsDir, '..', '..', '..', 'content', 'de', 'units', 'A1', '01-hallo');

function load(file: string): LessonExercise[] {
  const lesson = JSON.parse(fs.readFileSync(path.join(unitDir, file), 'utf8')) as {
    exercises: LessonExercise[];
  };
  return lesson.exercises;
}

const all = [...load('lesson-01.json'), ...load('lesson-02.json')];
const renderable = all.filter((exercise) =>
  RENDERABLE_TYPES.some((type) => type === exercise.type),
);
const others = all.filter((exercise) => !renderable.includes(exercise));

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** The texts of the payload a learner must see before answering. */
function prompts(exercise: LessonExercise): string[] {
  const payload = exercise.payload;
  switch (exercise.type) {
    case 'multiple_choice':
      return [String(payload.question), ...strings(payload.options)];
    case 'cloze':
      return String(payload.text)
        .split('___')
        .map((part) => part.trim())
        .filter((part) => part !== '');
    case 'match_pairs':
      return records(payload.pairs).flatMap((pair) => [String(pair.left), String(pair.right)]);
    case 'order_words':
      return strings(payload.words);
    case 'flashcard':
      return [String(payload.front)];
    case 'read_answer':
      return [String(payload.text), ...records(payload.questions).map((q) => String(q.question))];
    case 'listen_answer':
      return records(payload.questions).map((q) => String(q.question));
    default:
      return [];
  }
}

function show(exercise: LessonExercise) {
  return render(
    <ExerciseRenderer
      type={exercise.type}
      payload={exercise.payload}
      value={emptyValue(exercise.type, exercise.payload)}
      onChange={() => undefined}
      lang="de"
      instruction={exercise.instruction_en ?? ''}
    />,
  );
}

describe('real lesson content', () => {
  it('finds exercises of all eight types in the two lessons', () => {
    const found = new Set(renderable.map((exercise) => exercise.type));
    expect([...found].sort()).toEqual([...RENDERABLE_TYPES].sort());
    expect(renderable.length).toBeGreaterThanOrEqual(20);
  });

  it.each(renderable.map((exercise) => [exercise.key, exercise.type, exercise] as const))(
    '%s (%s) renders and shows its prompt',
    (_key, type, exercise) => {
      expect(() => show(exercise)).not.toThrow();
      expect(document.querySelector(`.st-exercise--${type}`)).toBeTruthy();
      expect(screen.queryByRole('note')).toBeNull();
      expect(screen.getByText(exercise.instruction_en ?? '')).toBeTruthy();
      const page = document.body.textContent ?? '';
      for (const prompt of prompts(exercise)) expect(page).toContain(prompt);
      expect(isComplete(type, exercise.payload, emptyValue(type, exercise.payload))).toBe(false);
    },
  );

  it.each(renderable.filter((e) => e.type === 'cloze').map((e) => [e.key, e] as const))(
    '%s has one input per blank',
    (_key, exercise) => {
      show(exercise);
      const blanks = records(exercise.payload.blanks);
      expect(screen.getAllByRole('textbox')).toHaveLength(blanks.length);
      expect(document.body.textContent).not.toContain('___');
    },
  );

  it.each(
    renderable
      .filter((e) => e.type === 'listen_answer' || e.type === 'dictation')
      .map((e) => [e.key, e] as const),
  )('%s keeps the spoken text out of the page', (_key, exercise) => {
    show(exercise);
    const spoken = String(exercise.payload.transcript ?? exercise.payload.text);
    expect(document.body.textContent).not.toContain(spoken);
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeTruthy();
  });

  it.each(others.map((exercise) => [exercise.key, exercise.type, exercise] as const))(
    '%s (%s) falls back to the calm message',
    (_key, _type, exercise) => {
      expect(() => show(exercise)).not.toThrow();
      expect(screen.getByRole('note')).toBeTruthy();
    },
  );
});
