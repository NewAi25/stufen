// Behaviour of core-curriculum (P1-01): the read service and the in memory
// store. Everything runs in memory: no network, no filesystem.
import { describe, expect, it } from 'vitest';
import { CEFR_LEVELS } from '@stufen/contracts';
import {
  createCurriculum,
  createInMemoryCurriculumStore,
  CurriculumNotFoundError,
} from '../src/index';
import { dutchSnapshot, germanSnapshot } from './fixtures';

/** A service on a fresh store with German installed, and Dutch too when asked. */
async function setup(options: { dutch?: boolean } = {}) {
  const store = createInMemoryCurriculumStore();
  await store.replaceLanguage(germanSnapshot());
  if (options.dutch) await store.replaceLanguage(dutchSnapshot());
  return { store, curriculum: createCurriculum({ store }) };
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
    const { curriculum } = await setup();
    expect(ids(await curriculum.listCandos('de'))).toEqual([
      'cando-de-a1-lis-01',
      'cando-de-a1-lis-02',
      'cando-common-a1-rea-01',
      'cando-de-a2-wri-01',
    ]);
  });

  it('filters by level', async () => {
    const { curriculum } = await setup();
    expect(ids(await curriculum.listCandos('de', 'A2'))).toEqual(['cando-de-a2-wri-01']);
    expect(await curriculum.listCandos('de', 'C2')).toEqual([]);
  });

  it('filters by skill, with and without a level', async () => {
    const { curriculum } = await setup();
    expect(ids(await curriculum.listCandos('de', undefined, 'reading'))).toEqual([
      'cando-common-a1-rea-01',
    ]);
    expect(ids(await curriculum.listCandos('de', 'A1', 'listening'))).toEqual([
      'cando-de-a1-lis-01',
      'cando-de-a1-lis-02',
    ]);
    expect(await curriculum.listCandos('de', 'A2', 'listening')).toEqual([]);
  });

  it('gives a language with no pack the common descriptors only', async () => {
    const { curriculum } = await setup();
    expect(ids(await curriculum.listCandos('fr'))).toEqual(['cando-common-a1-rea-01']);
  });

  it('lists a common descriptor once when two packs carry it', async () => {
    const { curriculum } = await setup({ dutch: true });
    expect(ids(await curriculum.listCandos('nl'))).toEqual([
      'cando-nl-a1-lis-01',
      'cando-common-a1-rea-01',
    ]);
    expect(ids(await curriculum.listCandos('de', 'A1', 'reading'))).toEqual([
      'cando-common-a1-rea-01',
    ]);
  });
});

describe('getCando', () => {
  it('returns a language descriptor and a common descriptor', async () => {
    const { curriculum } = await setup();
    expect((await curriculum.getCando('cando-de-a2-wri-01')).code).toBe('A2.WRI.01');
    expect((await curriculum.getCando('cando-common-a1-rea-01')).languageCode).toBeNull();
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
    const { curriculum } = await setup();
    expect(ids(await curriculum.listUnits('de', 'A1'))).toEqual(['unit-de-a1-1']);
    expect(ids(await curriculum.listUnits('de', 'A2'))).toEqual(['unit-de-a2-1']);
    expect(await curriculum.listUnits('de', 'B1')).toEqual([]);
  });

  it('returns units in ordinal order', async () => {
    const { curriculum } = await setup({ dutch: true });
    expect(ids(await curriculum.listUnits('nl', 'A1'))).toEqual(['unit-nl-a1-1', 'unit-nl-a1-2']);
  });

  it('returns plain units, without their lessons', async () => {
    const { curriculum } = await setup();
    const [unit] = await curriculum.listUnits('de', 'A1');
    expect(unit).toEqual({
      id: 'unit-de-a1-1',
      languageCode: 'de',
      level: 'A1',
      ordinal: 1,
      slug: 'a1-hallo',
      title: 'Hallo',
      description: 'First words',
      packVersion: '0.1.0',
    });
  });

  it('returns nothing for a language with no pack', async () => {
    const { curriculum } = await setup();
    expect(await curriculum.listUnits('fr', 'A1')).toEqual([]);
  });
});

describe('listLessons', () => {
  it('returns the lessons of a unit in ordinal order, without exercises', async () => {
    const { curriculum } = await setup();
    const lessons = await curriculum.listLessons('unit-de-a1-1');
    expect(ids(lessons)).toEqual(['lesson-de-a1-1-1', 'lesson-de-a1-1-2']);
    for (const lesson of lessons) expect(lesson).not.toHaveProperty('exercises');
  });

  it('returns nothing for an unknown unit', async () => {
    const { curriculum } = await setup();
    expect(await curriculum.listLessons('nope')).toEqual([]);
  });
});

describe('getLesson', () => {
  it('returns the lesson with its exercises in ordinal order', async () => {
    const { curriculum } = await setup();
    const lesson = await curriculum.getLesson('lesson-de-a1-1-1');
    expect(lesson.unitId).toBe('unit-de-a1-1');
    expect(lesson.exercises.map((exercise) => exercise.ordinal)).toEqual([1, 2, 3]);
    expect(ids(lesson.exercises)).toEqual([
      'lesson-de-a1-1-1-ex-1',
      'lesson-de-a1-1-1-ex-2',
      'lesson-de-a1-1-1-ex-3',
    ]);
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
    const { curriculum } = await setup({ dutch: true });
    const german = await curriculum.lessonPath('de');
    expect(german.map((entry) => entry.lesson.id)).toEqual([
      'lesson-de-a1-1-1',
      'lesson-de-a1-1-2',
      'lesson-de-a2-1-1',
    ]);
    const dutch = await curriculum.lessonPath('nl');
    expect(dutch.map((entry) => entry.lesson.id)).toEqual(['lesson-nl-a1-1-1', 'lesson-nl-a1-2-1']);
  });

  it('gives each lesson its unit and level', async () => {
    const { curriculum } = await setup();
    const path = await curriculum.lessonPath('de');
    expect(path.map((entry) => [entry.unit.id, entry.level])).toEqual([
      ['unit-de-a1-1', 'A1'],
      ['unit-de-a1-1', 'A1'],
      ['unit-de-a2-1', 'A2'],
    ]);
    for (const entry of path) expect(entry.lesson.unitId).toBe(entry.unit.id);
  });

  it('is empty for a language with no pack', async () => {
    const { curriculum } = await setup();
    expect(await curriculum.lessonPath('fr')).toEqual([]);
  });
});

describe('in memory store reads', () => {
  it('listUnits without a level returns every unit, by level then ordinal', async () => {
    const { store } = await setup();
    expect(ids(await store.listUnits('de'))).toEqual(['unit-de-a1-1', 'unit-de-a2-1']);
  });

  it('getLesson and getCando resolve to null for an unknown id', async () => {
    const { store } = await setup();
    expect(await store.getLesson('nope')).toBeNull();
    expect(await store.getCando('nope')).toBeNull();
  });

  it('findLessonUnit returns the unit of a lesson, or null', async () => {
    const { store } = await setup();
    expect((await store.findLessonUnit('lesson-de-a2-1-1'))?.id).toBe('unit-de-a2-1');
    expect(await store.findLessonUnit('lesson-de-a1-1-2')).not.toHaveProperty('lessons');
    expect(await store.findLessonUnit('nope')).toBeNull();
  });

  it('listItems returns items by level then key, and filters by level', async () => {
    const { store } = await setup({ dutch: true });
    expect(ids(await store.listItems('de'))).toEqual([
      'item-de-auto',
      'item-de-haus',
      'item-de-reise',
    ]);
    expect(ids(await store.listItems('de', 'A2'))).toEqual(['item-de-reise']);
    expect(ids(await store.listItems('nl'))).toEqual(['item-nl-huis']);
    expect(await store.listItems('fr')).toEqual([]);
  });

  it('getItems keeps the asked order and skips unknown and repeated ids', async () => {
    const { store } = await setup({ dutch: true });
    const found = await store.getItems(['item-nl-huis', 'nope', 'item-de-haus', 'item-nl-huis']);
    expect(ids(found)).toEqual(['item-nl-huis', 'item-de-haus']);
    expect(await store.getItems([])).toEqual([]);
  });

  it('activeVersion is the installed pack version, or null', async () => {
    const { store } = await setup({ dutch: true });
    expect(await store.activeVersion('de')).toBe('0.1.0');
    expect(await store.activeVersion('nl')).toBe('0.2.0');
    expect(await store.activeVersion('fr')).toBeNull();
  });

  it('hands out copies, so a caller cannot change stored rows', async () => {
    const { store, curriculum } = await setup();
    const lesson = await curriculum.getLesson('lesson-de-a1-1-1');
    lesson.title = 'changed';
    lesson.candoIds.push('extra');
    lesson.exercises.length = 0;
    const cando = await curriculum.getCando('cando-de-a1-lis-01');
    cando.textEn = 'changed';
    (await store.listUnits('de'))[0]!.title = 'changed';

    const again = await curriculum.getLesson('lesson-de-a1-1-1');
    expect(again.title).toBe('Lesson lesson-de-a1-1-1');
    expect(again.candoIds).toEqual(['cando-de-a1-lis-01']);
    expect(again.exercises).toHaveLength(3);
    expect((await curriculum.getCando('cando-de-a1-lis-01')).textEn).toBe('Can do A1.LIS.01');
    expect((await store.listUnits('de'))[0]?.title).toBe('Hallo');
  });
});

describe('replaceLanguage', () => {
  it('replaces everything stored for that language', async () => {
    const { store, curriculum } = await setup();
    const next = germanSnapshot();
    next.version = '0.2.0';
    next.candos = next.candos.filter((cando) => cando.id === 'cando-de-a1-lis-01');
    next.items = [];
    next.units = next.units.filter((unit) => unit.id === 'unit-de-a2-1');
    await store.replaceLanguage(next);

    expect(await store.activeVersion('de')).toBe('0.2.0');
    expect(ids(await curriculum.listCandos('de'))).toEqual(['cando-de-a1-lis-01']);
    expect(await store.listItems('de')).toEqual([]);
    expect(await store.getItems(['item-de-haus'])).toEqual([]);
    expect(ids(await store.listUnits('de'))).toEqual(['unit-de-a2-1']);
    expect(await curriculum.listLessons('unit-de-a1-1')).toEqual([]);
    expect(await store.getLesson('lesson-de-a1-1-1')).toBeNull();
    expect(await store.getCando('cando-de-a2-wri-01')).toBeNull();
    expect((await curriculum.lessonPath('de')).map((entry) => entry.lesson.id)).toEqual([
      'lesson-de-a2-1-1',
    ]);
  });

  it('leaves the other languages as they are', async () => {
    const { store, curriculum } = await setup({ dutch: true });
    const before = {
      candos: await curriculum.listCandos('nl'),
      units: await store.listUnits('nl'),
      items: await store.listItems('nl'),
      path: await curriculum.lessonPath('nl'),
    };
    await store.replaceLanguage({
      language: 'de',
      version: '9.9.9',
      candos: [],
      items: [],
      units: [],
    });

    expect(await store.activeVersion('de')).toBe('9.9.9');
    expect(await curriculum.lessonPath('de')).toEqual([]);
    expect(await store.activeVersion('nl')).toBe('0.2.0');
    expect(await curriculum.listCandos('nl')).toEqual(before.candos);
    expect(await store.listUnits('nl')).toEqual(before.units);
    expect(await store.listItems('nl')).toEqual(before.items);
    expect(await curriculum.lessonPath('nl')).toEqual(before.path);
    // The common descriptor now comes from the Dutch pack alone.
    expect(ids(await curriculum.listCandos('de'))).toEqual(['cando-common-a1-rea-01']);
  });

  it('copies the snapshot, so later changes to it do not reach the store', async () => {
    const store = createInMemoryCurriculumStore();
    const snapshot = germanSnapshot();
    await store.replaceLanguage(snapshot);
    snapshot.version = 'changed';
    snapshot.units.length = 0;
    snapshot.candos.length = 0;

    expect(await store.activeVersion('de')).toBe('0.1.0');
    expect(await store.listUnits('de')).toHaveLength(2);
    expect(await store.listCandos('de')).toHaveLength(4);
  });
});
