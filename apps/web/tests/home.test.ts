import { describe, expect, it } from 'vitest';
import { loadHome } from '../src/server/actions/home-actions';
import { loadReviewQueue, rateReviewCard } from '../src/server/actions/review-actions';
import { createContainer } from '../src/server/container';
import { dueLine, levelLine, streakLine } from '../src/lib/home-view';
import { memoryConfig } from './helpers/config';
import { finishWholeLesson, firstLesson } from './helpers/finish-lesson';

// The data behind `/`, on the real container with in memory stores.

async function setup() {
  const container = createContainer(memoryConfig());
  const session = await container.auth.createDevSession('learner@stufen.local');
  const lesson = await firstLesson(container);
  return { container, userId: session.userId, lesson };
}

describe('loadHome', () => {
  it('points a new learner at the first lesson, with nothing due', async () => {
    const { container, userId, lesson } = await setup();
    const home = await loadHome(container, userId, 'de');
    const path = await container.curriculum.lessonPath('de');
    const first = path[0];

    expect(home.reviewsDue).toBe(0);
    expect(home.streakDays).toBe(0);
    expect(home.primary).toBe('lesson');
    expect(home.estimatedLevel).toBeNull();
    expect(home.workingTowards).toBe(first?.level);
    expect(home.level).toBe(first?.level);
    expect(home.nextLesson).toMatchObject({
      id: lesson.id,
      title: lesson.title,
      estimatedMinutes: lesson.estimatedMinutes,
      unitTitle: first?.unit.title,
      unitOrdinal: first?.unit.ordinal,
      completed: false,
    });

    // The list is the units of the level, each with its lessons, none done.
    const units = await container.curriculum.listUnits('de', home.level);
    expect(home.units.map((unit) => unit.id)).toEqual(units.map((unit) => unit.id));
    for (const unit of home.units) {
      const lessons = await container.curriculum.listLessons(unit.id);
      expect(unit.lessons.map((entry) => entry.id)).toEqual(lessons.map((entry) => entry.id));
      expect(unit.lessons.every((entry) => !entry.completed)).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(home))).toEqual(home);
  });

  it('moves on after a lesson: done mark, next lesson, reviews due, streak', async () => {
    const { container, userId, lesson } = await setup();
    const summary = await finishWholeLesson(container, userId, lesson);
    const home = await loadHome(container, userId, 'de');

    const done = home.units.flatMap((unit) => unit.lessons).filter((entry) => entry.completed);
    expect(done.map((entry) => entry.id)).toEqual([lesson.id]);
    expect(home.nextLesson?.id).not.toBe(lesson.id);
    expect(home.nextLesson?.id ?? null).toBe(summary.next?.id ?? null);
    expect(home.nextLesson?.id ?? null).toBe(
      (await container.curriculum.nextLessonFor(userId, 'de'))?.id ?? null,
    );

    // The due count is the one of the review box, and reviews come first.
    expect(home.reviewsDue).toBe((await container.srs.stats(userId, 'de')).due);
    expect(home.reviewsDue).toBeGreaterThan(0);
    expect(home.primary).toBe('review');
    expect(home.streakDays).toBe(1);

    // One lesson reaches no level: the line still says working towards.
    expect(home.estimatedLevel).toBeNull();
    expect(levelLine(home)).toBe(`Working towards ${home.workingTowards}`);
  });

  it('hands the primary action back to the lesson once the reviews are done', async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const queue = await loadReviewQueue(container, userId, 'de', 10_000);
    for (const card of queue.cards) {
      expect((await rateReviewCard(container, userId, 'de', card.itemId, 4)).ok).toBe(true);
    }
    const home = await loadHome(container, userId, 'de');
    expect(home.reviewsDue).toBe(0);
    expect(home.primary).toBe(home.nextLesson === null ? 'none' : 'lesson');
  });

  it("shows nothing of another learner's work", async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const other = (await container.auth.createDevSession('other@stufen.local')).userId;
    const home = await loadHome(container, other, 'de');
    expect(home.reviewsDue).toBe(0);
    expect(home.nextLesson?.id).toBe(lesson.id);
    expect(home.units.flatMap((unit) => unit.lessons).some((entry) => entry.completed)).toBe(false);
  });
});

describe('the home lines', () => {
  it('says the level without claiming more than the evidence', () => {
    expect(levelLine({ workingTowards: 'A1', estimatedLevel: null })).toBe('Working towards A1');
    expect(levelLine({ workingTowards: 'A2', estimatedLevel: 'A1' })).toBe(
      'Estimated level A1. Working towards A2.',
    );
    expect(levelLine({ workingTowards: null, estimatedLevel: 'C2' })).toBe('Estimated level C2.');
  });

  it('counts due cards and streak days in words', () => {
    expect(dueLine(0)).toBe('Nothing due right now.');
    expect(dueLine(1)).toBe('1 card is due.');
    expect(dueLine(14)).toBe('14 cards are due.');
    expect(streakLine(1)).toBe('Streak 1 day');
    expect(streakLine(4)).toBe('Streak 4 days');
  });
});
