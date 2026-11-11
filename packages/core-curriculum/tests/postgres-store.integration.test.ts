// Integration test for the Postgres adapter. Needs a real PostgreSQL with the
// migrations applied and is skipped when DATABASE_URL is not set. See "How to
// test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-curriculum test
//
// replaceLanguage replaces a whole language, so this test would overwrite an
// installed pack. It therefore refuses to start unless the five content tables
// are empty, and it empties them again after every test. It also removes the
// users it creates and puts `languages.pack_version` back.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createPostgresCurriculumStore, InvalidSnapshotError } from '../src/index';
import { createFixture, emptySnapshot, GERMAN_VERSION } from './fixtures';
import { runCurriculumStoreContract } from './store-contract';
import type { CurriculumStoreUnderTest } from './store-contract';

const url = process.env.DATABASE_URL;

const CONTENT_TABLES = ['exercises', 'lessons', 'units', 'items', 'cando_descriptors'] as const;

describe.skipIf(!url)('Postgres curriculum store on a real Postgres', () => {
  const createdUsers: string[] = [];
  const versionsBefore = new Map<string, string | null>();
  let db: Database;
  let store: CurriculumStoreUnderTest;
  /** True once the content tables were seen empty. Nothing is deleted before that. */
  let safeToWipe = false;

  /** Removes what this file created: its users, all content rows, the pack versions. */
  async function wipe(): Promise<void> {
    if (!safeToWipe) return;
    if (createdUsers.length > 0) {
      // Cascades to profiles, lesson_sessions, attempts, review_cards and cando_mastery.
      await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
      createdUsers.length = 0;
    }
    for (const table of CONTENT_TABLES) await db.deleteFrom(table).execute();
    for (const [code, version] of versionsBefore) {
      await db
        .updateTable('languages')
        .set({ pack_version: version })
        .where('code', '=', code)
        .execute();
    }
  }

  beforeAll(async () => {
    db = createDb(url as string);
    store = createPostgresCurriculumStore(db);
    for (const table of CONTENT_TABLES) {
      const found = await db.selectFrom(table).select('id').limit(1).executeTakeFirst();
      if (found) {
        throw new Error(
          `Table ${table} is not empty. This test replaces whole languages and would ` +
            'overwrite installed content, so it only runs on a database without content.',
        );
      }
    }
    const languages = await db.selectFrom('languages').select(['code', 'pack_version']).execute();
    for (const row of languages) versionsBefore.set(row.code, row.pack_version);
    safeToWipe = true;
  });

  afterAll(async () => {
    try {
      await wipe();
    } finally {
      await db.destroy();
    }
  });

  runCurriculumStoreContract('Postgres', async () => {
    await wipe();
    return store;
  });

  describe('a second replace', () => {
    /** id and created_at of every row of a content table, by id. */
    async function createdAt(table: (typeof CONTENT_TABLES)[number]): Promise<Map<string, number>> {
      const rows = await db.selectFrom(table).select(['id', 'created_at']).execute();
      return new Map(rows.map((row) => [row.id, row.created_at.getTime()]));
    }

    it('keeps unchanged rows, removes the dropped lesson and updates the changed exercise', async () => {
      await wipe();
      const fx = createFixture();
      const { lesson, exercises, unit } = fx.ids;
      await store.replaceLanguage(fx.german());
      const before = Object.fromEntries(
        await Promise.all(CONTENT_TABLES.map(async (table) => [table, await createdAt(table)])),
      ) as Record<(typeof CONTENT_TABLES)[number], Map<string, number>>;

      const next = fx.german();
      next.version = '0.1.1';
      const a1 = next.units.find((row) => row.id === unit.deA1)!;
      a1.lessons = a1.lessons.filter((row) => row.id !== lesson.deA1L2);
      const changedId = exercises.deA1L1[0] as string;
      const changed = a1.lessons[0]!.exercises.find((row) => row.id === changedId)!;
      changed.payload = { prompt: 'Was ist das?', options: ['ein Haus', 'ein Auto'], answer: 1 };
      await store.replaceLanguage(next);

      // The dropped lesson and its two exercises are gone.
      expect(await store.getLesson(lesson.deA1L2)).toBeNull();
      const gone = [lesson.deA1L2, ...exercises.deA1L2];
      const after = Object.fromEntries(
        await Promise.all(CONTENT_TABLES.map(async (table) => [table, await createdAt(table)])),
      ) as typeof before;
      expect([...after.lessons.keys()].sort()).toEqual([lesson.deA1L1, lesson.deA2L1].sort());
      expect([...after.exercises.keys()].sort()).toEqual(
        [...exercises.deA1L1, ...exercises.deA2L1].sort(),
      );
      for (const id of gone) {
        expect(after.lessons.has(id) || after.exercises.has(id)).toBe(false);
      }

      // Every row that is still there is the row of the first install: same id,
      // same created_at. A delete and insert would have given it a new time.
      for (const table of CONTENT_TABLES) {
        expect(after[table].size).toBeGreaterThan(0);
        for (const [id, time] of after[table]) expect(before[table].get(id)).toBe(time);
      }
      expect(after.units).toEqual(before.units);
      expect(after.items).toEqual(before.items);
      expect(after.cando_descriptors).toEqual(before.cando_descriptors);

      // The changed payload is stored on the same row; its neighbours are as they were.
      const stored = await store.getLesson(lesson.deA1L1);
      expect(stored?.exercises.find((row) => row.id === changedId)?.payload).toEqual(
        changed.payload,
      );
      expect(stored?.exercises.map((row) => row.id)).toEqual(exercises.deA1L1);
      expect(stored?.exercises[1]?.payload).toEqual({
        prompt: 'deA1L1 2',
        options: ['a', 'b'],
        answer: 0,
      });
      expect(await store.activeVersion('de')).toBe('0.1.1');
      const versions = await db.selectFrom('exercises').select('pack_version').distinct().execute();
      expect(versions).toEqual([{ pack_version: GERMAN_VERSION }]);
    });
  });

  describe('learner rows', () => {
    /** A user with a profile, made the way core-auth does it at sign up: as the owner. */
    async function newLearner(): Promise<string> {
      const id = randomUUID();
      createdUsers.push(id);
      await db
        .insertInto('users')
        .values({ id, email: `p127-${id}@example.test` })
        .execute();
      await sql`select ensure_profile(${id}::uuid)`.execute(db);
      return id;
    }

    async function newSession(userId: string, lessonId: string): Promise<string> {
      const row = await db
        .insertInto('lesson_sessions')
        .values({ user_id: userId, lesson_id: lessonId })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    }

    async function newAttempt(
      userId: string,
      sessionId: string,
      exerciseId: string,
      itemId: string,
    ) {
      const row = await db
        .insertInto('attempts')
        .values({
          user_id: userId,
          session_id: sessionId,
          exercise_id: exerciseId,
          item_id: itemId,
          exercise_type: 'multiple_choice',
          correct: true,
          score: 1,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    }

    it('survive a replace when they point at rows the new snapshot keeps', async () => {
      await wipe();
      const fx = createFixture();
      const { lesson, exercises, item, cando, unit } = fx.ids;
      await store.replaceLanguage(fx.german());
      const userId = await newLearner();
      const sessionId = await newSession(userId, lesson.deA1L1);
      const keptExercise = exercises.deA1L1[0] as string;
      const droppedExercise = exercises.deA1L2[0] as string;
      const keptAttempt = await newAttempt(userId, sessionId, keptExercise, item.haus);
      const otherAttempt = await newAttempt(userId, sessionId, droppedExercise, item.haus);
      await db.insertInto('review_cards').values({ user_id: userId, item_id: item.haus }).execute();
      await db
        .insertInto('cando_mastery')
        .values({ user_id: userId, cando_id: cando.deA1Lis01, evidence_count: 3 })
        .execute();

      // Lesson deA1L2 leaves the pack and one exercise of the kept lesson changes.
      const next = fx.german();
      next.version = '0.1.1';
      const a1 = next.units.find((row) => row.id === unit.deA1)!;
      a1.lessons = a1.lessons.filter((row) => row.id !== lesson.deA1L2);
      a1.lessons[0]!.exercises.find((row) => row.id === keptExercise)!.payload = { prompt: 'neu' };
      await store.replaceLanguage(next);

      const sessions = await db
        .selectFrom('lesson_sessions')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
      expect(sessions.map((row) => [row.id, row.lesson_id])).toEqual([[sessionId, lesson.deA1L1]]);

      const attempts = await db
        .selectFrom('attempts')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
      const byId = new Map(attempts.map((row) => [row.id, row]));
      expect(byId.size).toBe(2);
      expect(byId.get(keptAttempt)).toMatchObject({
        session_id: sessionId,
        exercise_id: keptExercise,
        item_id: item.haus,
        correct: true,
      });
      // The schema sets attempts.exercise_id to null when an exercise is removed. The attempt stays.
      expect(byId.get(otherAttempt)).toMatchObject({ session_id: sessionId, exercise_id: null });

      const cards = await db
        .selectFrom('review_cards')
        .select('item_id')
        .where('user_id', '=', userId)
        .execute();
      expect(cards).toEqual([{ item_id: item.haus }]);
      const mastery = await db
        .selectFrom('cando_mastery')
        .select(['cando_id', 'evidence_count'])
        .where('user_id', '=', userId)
        .execute();
      expect(mastery).toEqual([{ cando_id: cando.deA1Lis01, evidence_count: 3 }]);
      expect((await store.getLesson(lesson.deA1L1))?.exercises[0]?.payload).toEqual({
        prompt: 'neu',
      });
    });

    it('block the removal of a lesson that has a session, and nothing changes', async () => {
      await wipe();
      const fx = createFixture();
      const { lesson, unit, exercises } = fx.ids;
      await store.replaceLanguage(fx.german());
      const userId = await newLearner();
      const sessionId = await newSession(userId, lesson.deA1L2);

      // lesson_sessions.lesson_id has no delete rule, so Postgres refuses the delete.
      const next = fx.german();
      next.version = '0.1.1';
      const a1 = next.units.find((row) => row.id === unit.deA1)!;
      a1.lessons = a1.lessons.filter((row) => row.id !== lesson.deA1L2);
      a1.title = 'Should not be stored';
      await expect(store.replaceLanguage(next)).rejects.toThrow(/learners have sessions/);
      // Removing the whole unit runs into the same rule.
      await expect(store.replaceLanguage(emptySnapshot('de'))).rejects.toThrow(
        /learners have sessions/,
      );

      expect(await store.activeVersion('de')).toBe(GERMAN_VERSION);
      expect((await store.listUnits('de', 'A1'))[0]?.title).toBe('Hallo');
      expect((await store.getLesson(lesson.deA1L2))?.exercises.map((row) => row.id)).toEqual(
        exercises.deA1L2,
      );
      const sessions = await db
        .selectFrom('lesson_sessions')
        .select('id')
        .where('user_id', '=', userId)
        .execute();
      expect(sessions).toEqual([{ id: sessionId }]);
    });
  });

  /** The Postgres error code of a rejected promise, or 'no error'. */
  async function errorCodeOf(work: Promise<unknown>): Promise<string> {
    try {
      await work;
      return 'no error';
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
      throw error;
    }
  }

  describe('access', () => {
    it('content is readable by a signed out caller and by a signed in one', async () => {
      await wipe();
      const fx = createFixture();
      await store.replaceLanguage(fx.german());
      const userId = randomUUID();
      const counts = (asUser: string | null) =>
        withUser(db, asUser, async (trx) => {
          const role = await sql<{ role: string }>`select current_user as role`.execute(trx);
          const tables = await Promise.all(
            CONTENT_TABLES.map(
              async (table) => (await trx.selectFrom(table).select('id').execute()).length,
            ),
          );
          return { role: role.rows[0]?.role, tables };
        });

      // exercises, lessons, units, items, cando_descriptors of the German fixture.
      const expected = { role: 'stufen_app', tables: [6, 3, 2, 3, 4] };
      expect(await counts(null)).toEqual(expected);
      expect(await counts(userId)).toEqual(expected);
      // The store itself reads as the signed out restricted role and sees all of it.
      expect(await store.listUnits('de')).toHaveLength(2);
      expect(await store.listItems('de')).toHaveLength(3);
      expect(await store.listCandos('de')).toHaveLength(4);
      expect((await store.getLesson(fx.ids.lesson.deA1L1))?.exercises).toHaveLength(3);
      expect(await store.activeVersion('de')).toBe(GERMAN_VERSION);
    });

    it('the restricted role cannot write content, so a replace must be owner work', async () => {
      await wipe();
      const fx = createFixture();
      await store.replaceLanguage(fx.german());
      const unitId = fx.ids.unit.deA1;

      const insert = withUser(db, null, (trx) =>
        trx
          .insertInto('units')
          .values({
            language_code: 'de',
            level: 'A1',
            ordinal: 9,
            slug: `x-${fx.tag}`,
            title: 'x',
            pack_version: 'x',
          })
          .execute(),
      );
      expect(await errorCodeOf(insert)).toBe('42501');
      // There is a read policy only. An insert is refused; an update or a delete
      // finds no row it may touch and changes nothing.
      const updated = await withUser(db, null, (trx) =>
        trx
          .updateTable('units')
          .set({ title: 'taken over' })
          .where('id', '=', unitId)
          .executeTakeFirst(),
      );
      expect(updated.numUpdatedRows).toBe(0n);
      const removed = await withUser(db, null, (trx) =>
        trx
          .deleteFrom('exercises')
          .where('lesson_id', '=', fx.ids.lesson.deA1L1)
          .executeTakeFirst(),
      );
      expect(removed.numDeletedRows).toBe(0n);

      expect((await store.listUnits('de', 'A1'))[0]?.title).toBe('Hallo');
      expect(await store.listUnits('de')).toHaveLength(2);
      expect((await store.getLesson(fx.ids.lesson.deA1L1))?.exercises).toHaveLength(3);
    });
  });

  describe('two replaces at once', () => {
    it('of one language run one after the other and leave one whole snapshot', async () => {
      await wipe();
      const fx = createFixture();
      const { unit } = fx.ids;
      await store.replaceLanguage(fx.german());
      const onlyA1 = fx.german();
      onlyA1.version = 'only-a1';
      onlyA1.units = onlyA1.units.filter((row) => row.id === unit.deA1);
      const onlyA2 = fx.german();
      onlyA2.version = 'only-a2';
      onlyA2.units = onlyA2.units.filter((row) => row.id === unit.deA2);

      await Promise.all([store.replaceLanguage(onlyA1), store.replaceLanguage(onlyA2)]);

      const version = await store.activeVersion('de');
      const units = (await store.listUnits('de')).map((row) => row.id);
      expect(['only-a1', 'only-a2']).toContain(version);
      expect(units).toEqual([version === 'only-a1' ? unit.deA1 : unit.deA2]);
      const lessons = await db.selectFrom('lessons').select('unit_id').execute();
      expect(new Set(lessons.map((row) => row.unit_id))).toEqual(new Set(units));
    });
  });

  describe('a replace that cannot be done', () => {
    /** Everything the store shows for German and Dutch, to compare before and after. */
    async function everything(fx: ReturnType<typeof createFixture>) {
      return {
        versions: [await store.activeVersion('de'), await store.activeVersion('nl')],
        german: [
          await store.listUnits('de'),
          await store.listItems('de'),
          await store.listCandos('de'),
        ],
        dutch: [
          await store.listUnits('nl'),
          await store.listItems('nl'),
          await store.listCandos('nl'),
        ],
        lessons: await Promise.all(Object.values(fx.ids.lesson).map((id) => store.getLesson(id))),
      };
    }

    it('rejects an id that another language already uses, and writes nothing', async () => {
      await wipe();
      const fx = createFixture();
      await store.replaceLanguage(fx.german());
      await store.replaceLanguage(fx.dutch());
      const before = await everything(fx);
      const { unit, lesson, exercises, item, cando } = fx.ids;

      // Each German snapshot claims one id that is stored for Dutch.
      const takeUnit = fx.german();
      takeUnit.units[0]!.id = unit.nl1;
      for (const row of takeUnit.units[0]!.lessons) row.unitId = unit.nl1;
      const takeLesson = fx.german();
      takeLesson.units[0]!.lessons[0]!.id = lesson.nl1L1;
      for (const row of takeLesson.units[0]!.lessons[0]!.exercises) row.lessonId = lesson.nl1L1;
      const takeExercise = fx.german();
      takeExercise.units[0]!.lessons[0]!.exercises[0]!.id = exercises.nl1L1[0] as string;
      const takeItem = fx.german();
      takeItem.items[0]!.id = item.huis;
      const takeCando = fx.german();
      takeCando.candos[0]!.id = cando.nlA1Lis01;
      const commonAsOwn = fx.german();
      commonAsOwn.candos.find((row) => row.languageCode === null)!.languageCode = 'de';

      for (const snapshot of [
        takeUnit,
        takeLesson,
        takeExercise,
        takeItem,
        takeCando,
        commonAsOwn,
      ]) {
        snapshot.version = 'never';
        const error: unknown = await store
          .replaceLanguage(snapshot)
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(InvalidSnapshotError);
        expect(String(error)).toMatch(/is already stored for another language/);
      }
      expect(await everything(fx)).toEqual(before);
    });

    it('rejects an id that is not a uuid before it reaches Postgres', async () => {
      await wipe();
      const fx = createFixture();
      const badId = fx.german();
      badId.items[0]!.id = 'item-de-haus';
      const badReference = fx.german();
      badReference.units[0]!.lessons[0]!.exercises[0]!.itemIds = ['item-de-haus'];

      for (const snapshot of [badId, badReference]) {
        await expect(store.replaceLanguage(snapshot)).rejects.toThrow(
          /"item-de-haus" is not a uuid/,
        );
      }
      expect(await store.activeVersion('de')).toBeNull();
      expect(await store.listItems('de')).toEqual([]);
    });

    it('rolls back completely when Postgres refuses a row half way', async () => {
      await wipe();
      const fx = createFixture();
      await store.replaceLanguage(fx.german());
      await store.replaceLanguage(fx.dutch());
      const before = await everything(fx);

      // Candos, items and the first units go in, then a new unit repeats a slug
      // and breaks unique (language_code, slug).
      const next = fx.german();
      next.version = '0.1.1';
      next.candos[0]!.textEn = 'Should not be stored';
      next.items = next.items.slice(0, 1);
      next.units.push({ ...next.units[0]!, id: randomUUID(), lessons: [] });
      expect(await errorCodeOf(store.replaceLanguage(next))).toBe('23505');

      expect(await everything(fx)).toEqual(before);
    });
  });
});
