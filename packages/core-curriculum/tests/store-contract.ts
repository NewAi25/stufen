// The behaviour every curriculum store adapter must show, written against the
// two ports only (CurriculumStore and SnapshotWriter). Not a test file itself:
// store-contract.memory.test.ts runs it for the in memory store and
// postgres-store.integration.test.ts for Postgres.
//
// `makeStore` is called before every test and must hand back a store with no
// content in it. Each test builds its own fixture, so ids, slugs, codes and
// keys are new every time. 'de' and 'nl' get content; 'fr' stays empty.
//
// One thing is left open on purpose: an optional field that the snapshot
// leaves out (titleEn, description, introducesItemIds, instructionEn,
// instructionNative). The in memory store hands the row back without it,
// Postgres hands back null or an empty list. The contract accepts both and
// asks only that no value appears from nowhere.
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SnapshotWriter } from '@stufen/contracts';
import type { CurriculumStore } from '../src/index';
import { InvalidSnapshotError } from '../src/store';
import { createFixture, DUTCH_VERSION, emptySnapshot, GERMAN_VERSION } from './fixtures';
import type { Fixture } from './fixtures';

export type CurriculumStoreUnderTest = CurriculumStore & SnapshotWriter;

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

export function runCurriculumStoreContract(
  name: string,
  makeStore: () => CurriculumStoreUnderTest | Promise<CurriculumStoreUnderTest>,
): void {
  describe(`curriculum store contract: ${name}`, () => {
    let store: CurriculumStoreUnderTest;
    let fx: Fixture;

    /** German installed, and Dutch too when asked. */
    async function install(options: { dutch?: boolean } = {}): Promise<void> {
      await store.replaceLanguage(fx.german());
      if (options.dutch) await store.replaceLanguage(fx.dutch());
    }

    beforeEach(async () => {
      store = await makeStore();
      fx = createFixture();
    });

    describe('listCandos', () => {
      it('returns language and common descriptors, by level then code', async () => {
        await install();
        const { cando } = fx.ids;
        expect(ids(await store.listCandos('de'))).toEqual([
          cando.deA1Lis01,
          cando.deA1Lis02,
          cando.commonA1Rea01,
          cando.deA2Wri01,
        ]);
      });

      it('filters by level and by skill, alone and together', async () => {
        await install();
        const { cando } = fx.ids;
        expect(ids(await store.listCandos('de', { level: 'A2' }))).toEqual([cando.deA2Wri01]);
        expect(await store.listCandos('de', { level: 'C2' })).toEqual([]);
        expect(ids(await store.listCandos('de', { skill: 'reading' }))).toEqual([
          cando.commonA1Rea01,
        ]);
        expect(ids(await store.listCandos('de', { level: 'A1', skill: 'listening' }))).toEqual([
          cando.deA1Lis01,
          cando.deA1Lis02,
        ]);
        expect(await store.listCandos('de', { level: 'A2', skill: 'listening' })).toEqual([]);
        expect(await store.listCandos('de', { level: undefined, skill: undefined })).toHaveLength(
          4,
        );
      });

      it('gives a language with no pack the common descriptors only', async () => {
        await install();
        expect(ids(await store.listCandos('fr'))).toEqual([fx.ids.cando.commonA1Rea01]);
      });

      it('lists a common descriptor once when two packs carry it', async () => {
        await install({ dutch: true });
        const { cando } = fx.ids;
        expect(ids(await store.listCandos('nl'))).toEqual([cando.nlA1Lis01, cando.commonA1Rea01]);
        expect(ids(await store.listCandos('de', { level: 'A1', skill: 'reading' }))).toEqual([
          cando.commonA1Rea01,
        ]);
      });

      it('returns every field of a descriptor as it was installed', async () => {
        await install();
        const expected = fx.german().candos;
        const listed = await store.listCandos('de');
        expect(listed).toHaveLength(expected.length);
        for (const cando of expected) expect(listed).toContainEqual(cando);
      });
    });

    describe('getCando', () => {
      it('returns a language descriptor and a common descriptor', async () => {
        await install();
        const german = fx.german().candos;
        for (const cando of german) expect(await store.getCando(cando.id)).toEqual(cando);
        expect((await store.getCando(fx.ids.cando.commonA1Rea01))?.languageCode).toBeNull();
      });

      it('resolves to null for an unknown id, uuid or not', async () => {
        await install();
        expect(await store.getCando(randomUUID())).toBeNull();
        expect(await store.getCando('nope')).toBeNull();
      });
    });

    describe('listUnits', () => {
      it('without a level returns every unit, by level then ordinal', async () => {
        await install({ dutch: true });
        const { unit } = fx.ids;
        expect(ids(await store.listUnits('de'))).toEqual([unit.deA1, unit.deA2]);
        expect(ids(await store.listUnits('nl'))).toEqual([unit.nl1, unit.nl2]);
      });

      it('with a level returns the units of that level only', async () => {
        await install();
        expect(ids(await store.listUnits('de', 'A1'))).toEqual([fx.ids.unit.deA1]);
        expect(ids(await store.listUnits('de', 'A2'))).toEqual([fx.ids.unit.deA2]);
        expect(await store.listUnits('de', 'B1')).toEqual([]);
      });

      it('returns plain units, without their lessons', async () => {
        await install();
        const [unit] = await store.listUnits('de', 'A1');
        expect(unit).toEqual({
          id: fx.ids.unit.deA1,
          languageCode: 'de',
          level: 'A1',
          ordinal: 1,
          slug: `a1-hallo-${fx.tag}`,
          title: 'Hallo',
          description: 'First words',
          packVersion: GERMAN_VERSION,
          titleEn: 'Hello',
        });
      });

      it('returns nothing for a language with no pack', async () => {
        await install();
        expect(await store.listUnits('fr')).toEqual([]);
        expect(await store.listUnits('fr', 'A1')).toEqual([]);
      });
    });

    describe('listLessonSummaries', () => {
      it('returns the lessons of a unit in ordinal order, without exercises', async () => {
        await install();
        const lessons = await store.listLessonSummaries(fx.ids.unit.deA1);
        expect(ids(lessons)).toEqual([fx.ids.lesson.deA1L1, fx.ids.lesson.deA1L2]);
        const installed = fx.german().units.find((unit) => unit.id === fx.ids.unit.deA1);
        const first = installed!.lessons.find((row) => row.id === fx.ids.lesson.deA1L1)!;
        for (const lesson of lessons) expect(lesson).not.toHaveProperty('exercises');
        // Every summary field is as installed: with the exercises put back it is the lesson.
        expect({ ...lessons[0], exercises: first.exercises }).toEqual(first);
      });

      it('returns nothing for an unknown unit, uuid or not', async () => {
        await install();
        expect(await store.listLessonSummaries(randomUUID())).toEqual([]);
        expect(await store.listLessonSummaries('nope')).toEqual([]);
      });
    });

    describe('getLesson and findLessonUnit', () => {
      it('returns the lesson with its exercises in ordinal order', async () => {
        await install();
        const lesson = await store.getLesson(fx.ids.lesson.deA1L1);
        expect(lesson?.unitId).toBe(fx.ids.unit.deA1);
        expect(lesson?.exercises.map((exercise) => exercise.ordinal)).toEqual([1, 2, 3]);
        expect(ids(lesson?.exercises ?? [])).toEqual(fx.ids.exercises.deA1L1);
      });

      it('returns every field of the lesson and its exercises as installed', async () => {
        await install();
        const installed = fx
          .german()
          .units.flatMap((unit) => unit.lessons)
          .find((lesson) => lesson.id === fx.ids.lesson.deA1L2);
        expect(await store.getLesson(fx.ids.lesson.deA1L2)).toEqual(installed);
      });

      it('getLesson resolves to null for an unknown id, uuid or not', async () => {
        await install();
        expect(await store.getLesson(randomUUID())).toBeNull();
        expect(await store.getLesson('nope')).toBeNull();
      });

      it('findLessonUnit returns the plain unit of a lesson, or null', async () => {
        await install();
        expect((await store.findLessonUnit(fx.ids.lesson.deA2L1))?.id).toBe(fx.ids.unit.deA2);
        const unit = await store.findLessonUnit(fx.ids.lesson.deA1L2);
        expect(unit).toEqual((await store.listUnits('de', 'A1'))[0]);
        expect(unit).not.toHaveProperty('lessons');
        expect(await store.findLessonUnit(randomUUID())).toBeNull();
        expect(await store.findLessonUnit('nope')).toBeNull();
      });
    });

    describe('optional fields', () => {
      it('returns titleEn, description and introducesItemIds as installed', async () => {
        await install();
        const { unit, lesson, item } = fx.ids;
        expect((await store.listUnits('de', 'A1'))[0]?.titleEn).toBe('Hello');
        expect((await store.findLessonUnit(lesson.deA1L1))?.titleEn).toBe('Hello');

        const [first, second] = await store.listLessonSummaries(unit.deA1);
        expect(first).toMatchObject({
          id: lesson.deA1L1,
          titleEn: 'Hello',
          description: 'Greetings and names',
          introducesItemIds: [item.haus, item.auto],
        });
        // Explicit nulls and an explicit empty list come back as they went in.
        expect(second).toMatchObject({
          id: lesson.deA1L2,
          titleEn: null,
          description: null,
          introducesItemIds: [],
        });
        expect(await store.getLesson(lesson.deA1L1)).toMatchObject({
          titleEn: 'Hello',
          description: 'Greetings and names',
          introducesItemIds: [item.haus, item.auto],
        });
      });

      it('returns the instructions of an exercise as installed', async () => {
        await install();
        const { lesson } = fx.ids;
        const full = await store.getLesson(lesson.deA1L1);
        expect(full?.exercises.map((row) => [row.instructionEn, row.instructionNative])).toEqual([
          ['Choose answer 1', 'Wähle Antwort 1'],
          ['Choose answer 2', 'Wähle Antwort 2'],
          ['Choose answer 3', 'Wähle Antwort 3'],
        ]);
        const half = await store.getLesson(lesson.deA1L2);
        expect(half?.exercises.map((row) => [row.instructionEn, row.instructionNative])).toEqual([
          ['Choose', null],
          ['Choose', null],
        ]);
      });

      it('gives nothing for a field the snapshot left out', async () => {
        await install();
        const { lesson } = fx.ids;
        const unit = (await store.listUnits('de', 'A2'))[0];
        expect(unit?.titleEn ?? null).toBeNull();
        const stored = await store.getLesson(lesson.deA2L1);
        expect(stored).not.toBeNull();
        expect(stored?.titleEn ?? null).toBeNull();
        expect(stored?.description ?? null).toBeNull();
        expect(stored?.introducesItemIds ?? []).toEqual([]);
        expect(stored?.exercises[0]?.instructionEn ?? null).toBeNull();
        expect(stored?.exercises[0]?.instructionNative ?? null).toBeNull();
      });

      it('hands out a copy of introducesItemIds', async () => {
        await install();
        const { lesson, item } = fx.ids;
        (await store.getLesson(lesson.deA1L1))?.introducesItemIds?.push('extra');
        expect((await store.getLesson(lesson.deA1L1))?.introducesItemIds).toEqual([
          item.haus,
          item.auto,
        ]);
      });
    });

    describe('items', () => {
      it('listItems returns items by level then key, and filters by level', async () => {
        await install({ dutch: true });
        const { item } = fx.ids;
        expect(ids(await store.listItems('de'))).toEqual([item.auto, item.haus, item.reise]);
        expect(ids(await store.listItems('de', 'A2'))).toEqual([item.reise]);
        expect(ids(await store.listItems('nl'))).toEqual([item.huis]);
        expect(await store.listItems('fr')).toEqual([]);
      });

      it('returns every field of an item as it was installed', async () => {
        await install();
        const expected = fx.german().items;
        const listed = await store.listItems('de');
        expect(listed).toHaveLength(expected.length);
        for (const item of expected) expect(listed).toContainEqual(item);
      });

      it('getItems keeps the asked order and skips unknown and repeated ids', async () => {
        await install({ dutch: true });
        const { item } = fx.ids;
        const found = await store.getItems([item.huis, 'nope', item.haus, randomUUID(), item.huis]);
        expect(ids(found)).toEqual([item.huis, item.haus]);
        expect(await store.getItems([])).toEqual([]);
        expect(await store.getItems(['nope'])).toEqual([]);
      });
    });

    describe('activeVersion', () => {
      it('is the installed pack version, or null', async () => {
        expect(await store.activeVersion('de')).toBeNull();
        await install({ dutch: true });
        expect(await store.activeVersion('de')).toBe(GERMAN_VERSION);
        expect(await store.activeVersion('nl')).toBe(DUTCH_VERSION);
        expect(await store.activeVersion('fr')).toBeNull();
      });
    });

    describe('copies', () => {
      it('hands out copies, so a caller cannot change stored rows', async () => {
        await install();
        const lesson = await store.getLesson(fx.ids.lesson.deA1L1);
        lesson!.title = 'changed';
        lesson!.candoIds.push('extra');
        lesson!.exercises.length = 0;
        (await store.getCando(fx.ids.cando.deA1Lis01))!.textEn = 'changed';
        (await store.listUnits('de'))[0]!.title = 'changed';
        (await store.listItems('de'))[0]!.lemma = 'changed';

        const again = await store.getLesson(fx.ids.lesson.deA1L1);
        expect(again?.title).toBe('Lesson deA1L1');
        expect(again?.candoIds).toEqual([fx.ids.cando.deA1Lis01]);
        expect(again?.exercises).toHaveLength(3);
        expect((await store.getCando(fx.ids.cando.deA1Lis01))?.textEn).toBe('Can do A1.LIS.01');
        expect((await store.listUnits('de'))[0]?.title).toBe('Hallo');
        expect((await store.listItems('de'))[0]?.lemma).toBe('auto');
      });

      it('copies the snapshot, so later changes to it do not reach the store', async () => {
        const snapshot = fx.german();
        await store.replaceLanguage(snapshot);
        snapshot.version = 'changed';
        snapshot.units.length = 0;
        snapshot.candos.length = 0;

        expect(await store.activeVersion('de')).toBe(GERMAN_VERSION);
        expect(await store.listUnits('de')).toHaveLength(2);
        expect(await store.listCandos('de')).toHaveLength(4);
      });
    });

    describe('replaceLanguage', () => {
      it('replaces everything stored for that language', async () => {
        await install();
        const { cando, item, unit, lesson } = fx.ids;
        const next = fx.german();
        next.version = '0.2.0';
        next.candos = next.candos.filter((row) => row.id === cando.deA1Lis01);
        next.items = [];
        next.units = next.units.filter((row) => row.id === unit.deA2);
        // The kept lesson pointed at the removed item; a real pack would not.
        for (const row of next.units[0]!.lessons[0]!.exercises) row.itemIds = [];
        await store.replaceLanguage(next);

        expect(await store.activeVersion('de')).toBe('0.2.0');
        expect(await store.listItems('de')).toEqual([]);
        expect(await store.getItems([item.haus])).toEqual([]);
        expect(ids(await store.listUnits('de'))).toEqual([unit.deA2]);
        expect(await store.listLessonSummaries(unit.deA1)).toEqual([]);
        expect(await store.getLesson(lesson.deA1L1)).toBeNull();
        expect(await store.findLessonUnit(lesson.deA1L1)).toBeNull();
        expect(await store.getCando(cando.deA2Wri01)).toBeNull();
        expect(ids(await store.listLessonSummaries(unit.deA2))).toEqual([lesson.deA2L1]);
        expect((await store.getLesson(lesson.deA2L1))?.exercises[0]?.itemIds).toEqual([]);
      });

      it('keeps a common descriptor that the new snapshot no longer carries', async () => {
        await install();
        const { cando } = fx.ids;
        const next = fx.german();
        next.candos = next.candos.filter((row) => row.id === cando.deA1Lis01);
        await store.replaceLanguage(next);
        expect(ids(await store.listCandos('de'))).toEqual([cando.deA1Lis01, cando.commonA1Rea01]);

        await store.replaceLanguage(emptySnapshot('de'));
        expect(ids(await store.listCandos('de'))).toEqual([cando.commonA1Rea01]);
        expect((await store.getCando(cando.commonA1Rea01))?.languageCode).toBeNull();
      });

      it('updates a common descriptor when a later snapshot changes it', async () => {
        await install();
        const dutch = fx.dutch();
        const common = dutch.candos.find((row) => row.languageCode === null)!;
        common.textEn = 'Reworded';
        await store.replaceLanguage(dutch);

        expect((await store.getCando(common.id))?.textEn).toBe('Reworded');
        expect(await store.listCandos('de', { skill: 'reading' })).toEqual([common]);
      });

      it('leaves the other languages as they are', async () => {
        await install({ dutch: true });
        const dutchLessons = [fx.ids.lesson.nl1L1, fx.ids.lesson.nl2L1];
        const read = async () => ({
          version: await store.activeVersion('nl'),
          candos: await store.listCandos('nl'),
          units: await store.listUnits('nl'),
          items: await store.listItems('nl'),
          lessons: await Promise.all(dutchLessons.map((id) => store.getLesson(id))),
        });
        const before = await read();
        await store.replaceLanguage(emptySnapshot('de', '9.9.9'));

        expect(await store.activeVersion('de')).toBe('9.9.9');
        expect(await store.listUnits('de')).toEqual([]);
        expect(await store.listItems('de')).toEqual([]);
        expect(await read()).toEqual(before);
        expect(before.lessons.every((lesson) => lesson !== null)).toBe(true);
      });

      it('changes kept rows in place and adds new ones', async () => {
        await install();
        const { unit, lesson, exercises, item } = fx.ids;
        const next = fx.german();
        next.version = '0.1.1';
        const a1 = next.units.find((row) => row.id === unit.deA1)!;
        const a2 = next.units.find((row) => row.id === unit.deA2)!;
        a1.title = 'Hallo, neu';
        // Lesson deA1L2 moves to the A2 unit, behind the lesson already there.
        const moved = a1.lessons.find((row) => row.id === lesson.deA1L2)!;
        a1.lessons = a1.lessons.filter((row) => row !== moved);
        a2.lessons.push({ ...moved, unitId: a2.id, ordinal: 2 });
        const changed = a1.lessons[0]!.exercises.find((row) => row.id === exercises.deA1L1[1])!;
        changed.payload = { prompt: 'new prompt', options: ['x', 'y', 'z'], answer: 2 };
        changed.type = 'cloze';
        const newItem = { ...next.items[0]!, id: randomUUID(), key: `de:vocab:neu-${fx.tag}` };
        next.items.push(newItem);
        await store.replaceLanguage(next);

        expect(await store.activeVersion('de')).toBe('0.1.1');
        expect((await store.listUnits('de', 'A1'))[0]?.title).toBe('Hallo, neu');
        expect(ids(await store.listLessonSummaries(unit.deA1))).toEqual([lesson.deA1L1]);
        expect(ids(await store.listLessonSummaries(unit.deA2))).toEqual([
          lesson.deA2L1,
          lesson.deA1L2,
        ]);
        expect((await store.findLessonUnit(lesson.deA1L2))?.id).toBe(unit.deA2);
        expect(ids((await store.getLesson(lesson.deA1L2))?.exercises ?? [])).toEqual(
          exercises.deA1L2,
        );
        const first = await store.getLesson(lesson.deA1L1);
        expect(ids(first?.exercises ?? [])).toEqual(exercises.deA1L1);
        expect(first?.exercises[1]).toEqual(changed);
        expect(ids(await store.getItems([newItem.id, item.haus]))).toEqual([newItem.id, item.haus]);
      });

      it('changes an instruction and the other optional fields in place', async () => {
        await install();
        const { unit, lesson, exercises, item } = fx.ids;
        const next = fx.german();
        const a1 = next.units.find((row) => row.id === unit.deA1)!;
        const first = a1.lessons.find((row) => row.id === lesson.deA1L1)!;
        const reworded = first.exercises.find((row) => row.id === exercises.deA1L1[0])!;
        a1.titleEn = 'Hello again';
        first.titleEn = 'Saying hello';
        first.description = null;
        first.introducesItemIds = [item.reise];
        reworded.instructionEn = 'Pick the right word';
        reworded.instructionNative = 'Wähle das richtige Wort';
        await store.replaceLanguage(next);

        expect((await store.listUnits('de', 'A1'))[0]?.titleEn).toBe('Hello again');
        const stored = await store.getLesson(lesson.deA1L1);
        expect(stored).toMatchObject({
          titleEn: 'Saying hello',
          description: null,
          introducesItemIds: [item.reise],
        });
        expect(stored?.exercises.map((row) => row.id)).toEqual(exercises.deA1L1);
        expect(stored?.exercises.map((row) => [row.instructionEn, row.instructionNative])).toEqual([
          ['Pick the right word', 'Wähle das richtige Wort'],
          ['Choose answer 2', 'Wähle Antwort 2'],
          ['Choose answer 3', 'Wähle Antwort 3'],
        ]);
        expect((await store.listLessonSummaries(unit.deA1))[0]?.titleEn).toBe('Saying hello');
      });

      it('clears an optional field that the new snapshot leaves out', async () => {
        await install();
        const { unit, lesson } = fx.ids;
        const next = fx.german();
        const a1 = next.units.find((row) => row.id === unit.deA1)!;
        const first = a1.lessons.find((row) => row.id === lesson.deA1L1)!;
        delete a1.titleEn;
        delete first.titleEn;
        delete first.description;
        delete first.introducesItemIds;
        for (const row of first.exercises) {
          delete row.instructionEn;
          delete row.instructionNative;
        }
        await store.replaceLanguage(next);

        // The values of the first install must not stay behind.
        expect((await store.listUnits('de', 'A1'))[0]?.titleEn ?? null).toBeNull();
        const stored = await store.getLesson(lesson.deA1L1);
        expect(stored?.exercises).toHaveLength(3);
        expect(stored?.titleEn ?? null).toBeNull();
        expect(stored?.description ?? null).toBeNull();
        expect(stored?.introducesItemIds ?? []).toEqual([]);
        for (const row of stored?.exercises ?? []) {
          expect(row.instructionEn ?? null).toBeNull();
          expect(row.instructionNative ?? null).toBeNull();
        }
      });

      it('gives the same content when the same snapshot is installed twice', async () => {
        await install({ dutch: true });
        const read = async () => ({
          candos: await store.listCandos('de'),
          units: await store.listUnits('de'),
          items: await store.listItems('de'),
          lesson: await store.getLesson(fx.ids.lesson.deA1L1),
        });
        const before = await read();
        await store.replaceLanguage(fx.german());
        expect(await read()).toEqual(before);
      });

      it('rejects a snapshot that holds a row of another language and writes nothing', async () => {
        await install({ dutch: true });
        const wrongUnit = fx.german();
        wrongUnit.units.push(fx.dutch().units[0]!);
        const wrongItem = fx.german();
        wrongItem.items.push(fx.dutch().items[0]!);
        const wrongCando = fx.german();
        wrongCando.candos.push(fx.dutch().candos[0]!);

        for (const snapshot of [wrongUnit, wrongItem, wrongCando]) {
          snapshot.version = 'never';
          await expect(store.replaceLanguage(snapshot)).rejects.toBeInstanceOf(
            InvalidSnapshotError,
          );
        }
        expect(await store.activeVersion('de')).toBe(GERMAN_VERSION);
        expect(await store.listUnits('nl')).toHaveLength(2);
        expect(await store.listUnits('de')).toHaveLength(2);
      });

      it('rejects a lesson or exercise that names the wrong parent', async () => {
        const wrongLesson = fx.german();
        wrongLesson.units[0]!.lessons[0]!.unitId = randomUUID();
        const wrongExercise = fx.german();
        wrongExercise.units[0]!.lessons[0]!.exercises[0]!.lessonId = randomUUID();

        for (const snapshot of [wrongLesson, wrongExercise]) {
          await expect(store.replaceLanguage(snapshot)).rejects.toBeInstanceOf(
            InvalidSnapshotError,
          );
        }
        expect(await store.activeVersion('de')).toBeNull();
        expect(await store.listUnits('de')).toEqual([]);
      });
    });
  });
}
