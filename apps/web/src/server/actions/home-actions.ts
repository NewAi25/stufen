import 'server-only';

// What the home screen shows (row P1-22), kept free of Next so it can be
// tested with a real container. Boxes used: srs, curriculum, progress and the
// lesson engine for the done marks.

import type { CefrLevel, LanguageCode, LessonSummary } from '@stufen/contracts';
import type { HomeLesson, HomeUnit, HomeView } from '../../lib/home-view';
import type { Container } from '../container';

function toHomeLesson(lesson: LessonSummary, completed: ReadonlySet<string>): HomeLesson {
  return {
    id: lesson.id,
    ordinal: lesson.ordinal,
    title: lesson.title,
    titleEn: lesson.titleEn ?? null,
    kind: lesson.kind,
    estimatedMinutes: lesson.estimatedMinutes,
    completed: completed.has(lesson.id),
  };
}

/** The daily loop for one learner and language. */
export async function loadHome(
  container: Container,
  userId: string,
  language: LanguageCode,
): Promise<HomeView> {
  await container.ready;
  const { curriculum, progress, srs, lessonEngine } = container;
  const [stats, streak, map, path, completedIds] = await Promise.all([
    srs.stats(userId, language),
    progress.streak(userId, language),
    progress.levelMap(userId, language),
    curriculum.lessonPath(language),
    lessonEngine.completedLessonIds(userId),
  ]);
  const completed = new Set(completedIds);

  // The first lesson of the path that is not done, as nextLessonFor picks it.
  const nextEntry = path.find((entry) => !completed.has(entry.lesson.id)) ?? null;
  const workingTowards: CefrLevel | null =
    map.levels.find((row) => row.status !== 'reached')?.level ?? null;
  // The units listed are those of the level the learner is in: the level of
  // the next lesson, else the level worked towards, else the last one.
  const level: CefrLevel = nextEntry?.level ?? workingTowards ?? map.levels.at(-1)?.level ?? 'A1';

  const units: HomeUnit[] = [];
  for (const unit of await curriculum.listUnits(language, level)) {
    const lessons = await curriculum.listLessons(unit.id);
    units.push({
      id: unit.id,
      ordinal: unit.ordinal,
      title: unit.title,
      titleEn: unit.titleEn ?? null,
      lessons: lessons.map((lesson) => toHomeLesson(lesson, completed)),
    });
  }

  return {
    language,
    reviewsDue: stats.due,
    nextLesson:
      nextEntry === null
        ? null
        : {
            ...toHomeLesson(nextEntry.lesson, completed),
            unitOrdinal: nextEntry.unit.ordinal,
            unitTitle: nextEntry.unit.title,
            unitTitleEn: nextEntry.unit.titleEn ?? null,
          },
    streakDays: streak.currentDays,
    workingTowards,
    estimatedLevel: map.estimate?.level ?? null,
    primary: stats.due > 0 ? 'review' : nextEntry === null ? 'none' : 'lesson',
    level,
    units,
  };
}
