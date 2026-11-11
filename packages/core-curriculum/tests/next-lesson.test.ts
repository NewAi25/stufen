// nextLessonFor (P1-21): the first lesson of the path a learner has not
// completed. `completedLessonIds` is injected, the way the composition root
// passes core-lesson-engine's function.
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createCurriculum, createInMemoryCurriculumStore } from '../src/index';
import { createFixture } from './fixtures';

const USER = randomUUID();

/** German and Dutch installed. `completed` maps a user id to completed lesson ids. */
async function setup(completed?: Record<string, string[]>) {
  const fx = createFixture();
  const store = createInMemoryCurriculumStore();
  await store.replaceLanguage(fx.german());
  await store.replaceLanguage(fx.dutch());
  const completedLessonIds = vi.fn(async (userId: string) => completed?.[userId] ?? []);
  const curriculum = createCurriculum(completed ? { store, completedLessonIds } : { store });
  return { curriculum, completedLessonIds, lesson: fx.ids.lesson, store };
}

describe('nextLessonFor', () => {
  it('is the first lesson of the path when nothing is completed', async () => {
    const { curriculum, lesson } = await setup({});
    const next = await curriculum.nextLessonFor(USER, 'de');
    expect(next?.id).toBe(lesson.deA1L1);
    expect(next).toEqual((await curriculum.lessonPath('de'))[0]?.lesson);
    expect(next).not.toHaveProperty('exercises');
  });

  it('skips completed lessons and crosses into the next unit and level', async () => {
    const done: string[] = [];
    const { curriculum, lesson } = await setup({ [USER]: done });
    done.push(lesson.deA1L1);
    expect((await curriculum.nextLessonFor(USER, 'de'))?.id).toBe(lesson.deA1L2);
    done.push(lesson.deA1L2);
    expect((await curriculum.nextLessonFor(USER, 'de'))?.id).toBe(lesson.deA2L1);
  });

  it('walks the whole path as lessons are completed', async () => {
    const done: string[] = [];
    const { curriculum, lesson, completedLessonIds } = await setup({ [USER]: done });
    const seen: (string | undefined)[] = [];
    for (let step = 0; step < 4; step += 1) {
      const next = await curriculum.nextLessonFor(USER, 'de');
      seen.push(next?.id);
      if (next) done.push(next.id);
    }
    expect(seen).toEqual([lesson.deA1L1, lesson.deA1L2, lesson.deA2L1, undefined]);
    expect(completedLessonIds).toHaveBeenCalledTimes(4);
  });

  it('returns the earliest open lesson when later ones are already completed', async () => {
    const fresh = await setup({});
    const { lesson } = fresh;
    const done = { [USER]: [lesson.deA2L1, lesson.deA1L1] };
    const curriculum = createCurriculum({
      store: fresh.store,
      completedLessonIds: async (userId) => done[userId] ?? [],
    });
    expect((await curriculum.nextLessonFor(USER, 'de'))?.id).toBe(lesson.deA1L2);
  });

  it('is null when every lesson of the language is completed', async () => {
    const fresh = await setup({});
    const { lesson } = fresh;
    const curriculum = createCurriculum({
      store: fresh.store,
      completedLessonIds: async () => [lesson.deA1L2, lesson.deA2L1, lesson.deA1L1],
    });
    expect(await curriculum.nextLessonFor(USER, 'de')).toBeNull();
    // Dutch is a separate path: German completions do not count there.
    expect((await curriculum.nextLessonFor(USER, 'nl'))?.id).toBe(lesson.nl1L1);
  });

  it('is null for a language with no lessons', async () => {
    const { curriculum } = await setup({});
    expect(await curriculum.nextLessonFor(USER, 'fr')).toBeNull();
  });

  it('asks for the completed lessons of that user only', async () => {
    const other = randomUUID();
    const fresh = await setup({});
    const { lesson } = fresh;
    const completedLessonIds = vi.fn(async (userId: string) =>
      userId === other ? [lesson.deA1L1] : [],
    );
    const curriculum = createCurriculum({ store: fresh.store, completedLessonIds });

    expect((await curriculum.nextLessonFor(USER, 'de'))?.id).toBe(lesson.deA1L1);
    expect((await curriculum.nextLessonFor(other, 'de'))?.id).toBe(lesson.deA1L2);
    expect(completedLessonIds.mock.calls).toEqual([[USER], [other]]);
  });

  it('ignores completed ids that are not on the path', async () => {
    const fresh = await setup({});
    const curriculum = createCurriculum({
      store: fresh.store,
      completedLessonIds: async () => [randomUUID(), fresh.lesson.nl1L1],
    });
    expect((await curriculum.nextLessonFor(USER, 'de'))?.id).toBe(fresh.lesson.deA1L1);
  });

  it('is the first lesson of the path when completedLessonIds is not provided', async () => {
    const { curriculum, lesson } = await setup();
    expect((await curriculum.nextLessonFor(USER, 'de'))?.id).toBe(lesson.deA1L1);
    expect((await curriculum.nextLessonFor(USER, 'nl'))?.id).toBe(lesson.nl1L1);
    expect(await curriculum.nextLessonFor(USER, 'fr')).toBeNull();
  });

  it('passes on the error when completedLessonIds rejects', async () => {
    const fresh = await setup({});
    const curriculum = createCurriculum({
      store: fresh.store,
      completedLessonIds: async () => Promise.reject(new Error('engine down')),
    });
    await expect(curriculum.nextLessonFor(USER, 'de')).rejects.toThrow('engine down');
  });
});
