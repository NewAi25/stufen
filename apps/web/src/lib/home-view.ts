// What the home screen receives from the server. Plain data, shared by server
// and client code and by the tests.

import type { CefrLevel, LessonKind } from '@stufen/contracts';

export interface HomeLesson {
  id: string;
  ordinal: number;
  /** The title in the target language, and in English when the pack has it. */
  title: string;
  titleEn: string | null;
  kind: LessonKind;
  estimatedMinutes: number;
  completed: boolean;
}

export interface HomeUnit {
  id: string;
  ordinal: number;
  title: string;
  titleEn: string | null;
  lessons: HomeLesson[];
}

/** The lesson the learner does next, with the unit it sits in. */
export interface HomeNextLesson extends HomeLesson {
  unitOrdinal: number;
  unitTitle: string;
  unitTitleEn: string | null;
}

export interface HomeView {
  /** The target language, as a BCP 47 tag for `lang`. */
  language: string;
  /** Cards that are due now. */
  reviewsDue: number;
  /** Null when every lesson that is written is done. */
  nextLesson: HomeNextLesson | null;
  /** Days in a row with at least one answer. 0 when the learner has not come back. */
  streakDays: number;
  /** The level the learner is working towards. Null when every level is reached. */
  workingTowards: CefrLevel | null;
  /** The app's estimate, once there is one. Never a certificate. */
  estimatedLevel: CefrLevel | null;
  /** Which card carries the one filled button of the screen. */
  primary: 'review' | 'lesson' | 'none';
  /** The level whose units are listed, and those units in order. */
  level: CefrLevel;
  units: HomeUnit[];
}

/** "Working towards A1", with the estimate in front once there is one. */
export function levelLine(view: Pick<HomeView, 'workingTowards' | 'estimatedLevel'>): string {
  const estimate = view.estimatedLevel === null ? null : `Estimated level ${view.estimatedLevel}.`;
  const towards = view.workingTowards === null ? null : `Working towards ${view.workingTowards}`;
  if (estimate !== null && towards !== null) return `${estimate} ${towards}.`;
  return towards ?? estimate ?? '';
}

export function dueLine(count: number): string {
  if (count === 0) return 'Nothing due right now.';
  return count === 1 ? '1 card is due.' : `${count} cards are due.`;
}

export function streakLine(days: number): string {
  return days === 1 ? 'Streak 1 day' : `Streak ${days} days`;
}
