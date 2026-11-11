// Behaviour of the curriculum service (P1-01, P1-21) on the in memory store.
// Everything runs in memory: no network, no filesystem. What the two store
// adapters must do is in store-contract.ts.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CEFR_LEVELS } from '@stufen/contracts';
import {
  createCurriculum,
  createInMemoryCurriculumStore,
  CurriculumNotFoundError,
} from '../src/index';
import { createFixture, GERMAN_VERSION } from './fixtures';

/** A service on a fresh store with German installed, and Dutch too when asked. */
async function setup(options: { dutch?: boolean } = {}) {
  const fx = createFixture();
  const store = createInMemoryCurriculumStore();
  await store.replaceLanguage(fx.german());
  if (options.dutch) await store.replaceLanguage(fx.dutch());
  return { fx, store, curriculum: createCurriculum({ store }), ...fx.ids };
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('listLevels', () => {
  it('returns the six levels in order', async () => {
    const { curriculum } = await setup();
    expect(curriculum.listLevels()).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('returns a copy, so a caller cannot change the shared list', async () => {
    const { curriculum } = await setup();
    curriculum.listLevels().pop();
    expect(curriculum.listLevels()).toHaveLength(6);
    expect(CEFR_LEVELS).toHaveLength(6);
  });
});

describe('listCandos', () => {
  it('returns language and common descriptors, by level then code', async () => {
    const { curriculum, cando } = await setup();
    expect(ids(await curriculum.listCandos('de'))).toEqual([
      cando.deA1Lis01,
      cando.deA1Lis02,
      cando.commonA1Rea01,
      cando.deA2Wri01,
    ]);
  });

  it('filters by level', async () => {
    const { curriculum, cando } = await setup();
    expect(ids(await curriculum.listCandos('de', 'A2'))).toEqual([cando.deA2Wri01]);
    expect(await curriculum.listCandos('de', 'C2')).toEqual([]);
  });

  it('filters by skill, with and without a level', async () => {
    const { curriculum, cando } = await setup();
    expect(ids(await curriculum.listCandos('de', undefined, 'reading'))).toEqual([
      cando.commonA1Rea01,
    ]);
    expect(ids(await curriculum.listCandos('de', 'A1', 'listening'))).toEqual([
      cando.deA1Lis01,
      cando.deA1Lis02,
    ]);
    expect(await curriculum.listCandos('de', 'A2', 'listening')).toEqual([]);
  });

  it('gives a language with no pack the common descriptors only', async () => {
    const { curriculum, cando } = await setup();
    expect(ids(await curriculum.listCandos('fr'))).toEqual([cando.commonA1Rea01]);
  });

  it('lists a common descriptor once when two packs carry it', async () => {
    const { curriculum, cando } = await setup({ dutch: true });
    expect(ids(await curriculum.listCandos('nl'))).toEqual([cando.nlA1Lis01, cando.commonA1Rea01]);
  });
});

describe('getCando', () => {
  it('returns a language descriptor and a common descriptor', async () => {
    const { curriculum, cando, fx } = await setup();
    expect((await curriculum.getCando(cando.deA2Wri01)).code).toBe(`A2.WRI.01-${fx.tag}`);
    expect((await curriculum.getCando(cando.commonA1Rea01)).languageCode).toBeNull();
  });

  it("rejects with CurriculumNotFoundError of kind 'cando' for an unknown id", async () => {
    const { curriculum } = await setup();
    const error: unknown = await curriculum.getCando('nope').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CurriculumNotFoundError);
    expect(error).toMatchObject({ kind: 'cando', id: 'nope', name: 'CurriculumNotFoundError' });
  });
});

describe('listUnits', () => {
  it('returns the units of one level only', async () => {
    const { curriculum, unit } = await setup();
    expect(ids(await curriculum.listUnits('de', 'A1'))).toEqual([unit.deA1]);
    expect(ids(await curriculum.listUnits('de', 'A2'))).toEqual([unit.deA2]);
    expect(await curriculum.listUnits('de', 'B1')).toEqual([]);
  });

  it('returns units in ordinal order, as plain units', async () => {
    const { curriculum, unit } = await setup({ dutch: true });
    const units = await curriculum.listUnits('nl', 'A1');
    expect(ids(units)).toEqual([unit.nl1, unit.nl2]);
    for (const row of units) expect(row).not.toHaveProperty('lessons');
    expect((await curriculum.listUnits('de', 'A1'))[0]?.packVersion).toBe(GERMAN_VERSION);
  });

  it('returns nothing for a language with no pack', async () => {
    const { curriculum } = await setup();
    expect(await curriculum.listUnits('fr', 'A1')).toEqual([]);
  });
});

describe('listLessons', () => {
  it('returns the lessons of a unit in ordinal order, without exercises', async () => {
    const { curriculum, unit, lesson } = await setup();
    const lessons = await curriculum.listLessons(unit.deA1);
    expect(ids(lessons)).toEqual([lesson.deA1L1, lesson.deA1L2]);
    for (const row of lessons) expect(row).not.toHaveProperty('exercises');
  });

  it('returns nothing for an unknown unit', async () => {
    const { curriculum } = await setup();
    expect(await curriculum.listLessons(randomUUID())).toEqual([]);
  });
});

describe('getLesson', () => {
  it('returns the lesson with its exercises in ordinal order', async () => {
    const { curriculum, unit, lesson, exercises } = await setup();
    const found = await curriculum.getLesson(lesson.deA1L1);
    expect(found.unitId).toBe(unit.deA1);
    expect(found.exercises.map((exercise) => exercise.ordinal)).toEqual([1, 2, 3]);
    expect(ids(found.exercises)).toEqual(exercises.deA1L1);
  });

  it("rejects with CurriculumNotFoundError of kind 'lesson' for an unknown id", async () => {
    const { curriculum } = await setup();
    const error: unknown = await curriculum.getLesson('nope').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CurriculumNotFoundError);
    expect(error).toMatchObject({ kind: 'lesson', id: 'nope' });
  });
});

describe('lessonPath', () => {
  it('orders lessons by level, then unit ordinal, then lesson ordinal', async () => {
    const { curriculum, lesson } = await setup({ dutch: true });
    const german = await curriculum.lessonPath('de');
    expect(german.map((entry) => entry.lesson.id)).toEqual([
      lesson.deA1L1,
      lesson.deA1L2,
      lesson.deA2L1,
    ]);
    const dutch = await curriculum.lessonPath('nl');
    expect(dutch.map((entry) => entry.lesson.id)).toEqual([lesson.nl1L1, lesson.nl2L1]);
  });

  it('gives each lesson its unit and level', async () => {
    const { curriculum, unit } = await setup();
    const path = await curriculum.lessonPath('de');
    expect(path.map((entry) => [entry.unit.id, entry.level])).toEqual([
      [unit.deA1, 'A1'],
      [unit.deA1, 'A1'],
      [unit.deA2, 'A2'],
    ]);
    for (const entry of path) expect(entry.lesson.unitId).toBe(entry.unit.id);
  });

  it('is empty for a language with no pack', async () => {
    const { curriculum } = await setup();
    expect(await curriculum.lessonPath('fr')).toEqual([]);
  });
});

describe('orderings on any adapter', () => {
  it('sorts what the store returns, also when the store returns it backwards', async () => {
    const { store, cando, unit, lesson, exercises } = await setup();
    const curriculum = createCurriculum({
      store: {
        ...store,
        listCandos: async (...args) => (await store.listCandos(...args)).reverse(),
        listUnits: async (...args) => (await store.listUnits(...args)).reverse(),
        listLessonSummaries: async (id) => (await store.listLessonSummaries(id)).reverse(),
        getLesson: async (id) => {
          const found = await store.getLesson(id);
          return found && { ...found, exercises: [...found.exercises].reverse() };
        },
      },
    });

    expect(ids(await curriculum.listCandos('de'))).toEqual([
      cando.deA1Lis01,
      cando.deA1Lis02,
      cando.commonA1Rea01,
      cando.deA2Wri01,
    ]);
    expect(ids(await curriculum.listLessons(unit.deA1))).toEqual([lesson.deA1L1, lesson.deA1L2]);
    expect(ids((await curriculum.getLesson(lesson.deA1L1)).exercises)).toEqual(exercises.deA1L1);
    expect((await curriculum.lessonPath('de')).map((entry) => entry.lesson.id)).toEqual([
      lesson.deA1L1,
      lesson.deA1L2,
      lesson.deA2L1,
    ]);
  });
});
