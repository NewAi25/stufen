// The sentences of the lesson summary. Plain functions, shared by the screen
// and the tests. Copy rules: docs/06-ui-ux.md section 9.

import type { LessonSummaryView } from './lesson-view';

/** The score as one plain sentence. Self checks are named apart from it. */
export function scoreSentence(summary: LessonSummaryView): string {
  const { checked, correct } = summary;
  if (checked === 0) return 'This lesson had no exercises that are checked yet.';
  if (checked === 1) {
    return correct === 1
      ? 'The one checked exercise was right.'
      : 'The one checked exercise was not right.';
  }
  return `You got ${correct} of ${checked} checked exercises right.`;
}

export function selfCheckSentence(count: number): string | null {
  if (count === 0) return null;
  const tasks = count === 1 ? '1 task was' : `${count} tasks were`;
  return `${tasks} saved as a self check. Self checks do not count towards your level yet.`;
}

export function reviewSentence(count: number): string {
  if (count === 0) return 'This lesson added no new words to your reviews.';
  return count === 1
    ? '1 new word went into your reviews.'
    : `${count} new words and phrases went into your reviews.`;
}
