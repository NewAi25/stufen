// Answers one exercise of the lesson player through the user interface, the
// way a learner with a keyboard does. Selectors are roles and visible text,
// as documented in packages/ui-kit/README.md under "Exercise renderers".
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { isRecord, listOf, SELF_CHECK_TYPES, textOf } from './lesson-content';
import type { LessonExercise } from './lesson-content';

export type Outcome = 'correct' | 'partial' | 'incorrect' | 'self_check';

type Payload = Record<string, unknown>;

function indexOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * A number key picks an option once the focus is in its group. Tried again
 * when the key came before the page was ready to hear it.
 */
async function pickOption(page: Page, group: Locator, option: string, index: number) {
  const radio = group.getByRole('radio', { name: option, exact: true });
  await expect(async () => {
    await group.getByRole('radio').first().focus();
    await page.keyboard.press(String(index + 1));
    await expect(radio).toBeChecked({ timeout: 2_000 });
  }).toPass();
}

async function multipleChoice(page: Page, payload: Payload): Promise<void> {
  const question = textOf(payload.question) ?? '';
  const index = indexOf(payload.answer_index);
  const option = textOf(listOf(payload.options)[index]) ?? '';
  const group = page.getByRole('radiogroup', { name: question, exact: true });
  await pickOption(page, group, option, index);
}

/** read_answer and listen_answer: one list item per question. */
async function questions(page: Page, payload: Payload): Promise<void> {
  const all = listOf(payload.questions).filter(isRecord);
  for (const [at, question] of all.entries()) {
    const item = page
      .getByRole('listitem')
      .filter({ hasText: `Question ${at + 1} of ${all.length}` });
    const options = listOf(question.options);
    if (options.length === 0) {
      await item.getByRole('textbox').fill('Ja');
      continue;
    }
    const index = indexOf(question.answer_index);
    const option = textOf(options[index]) ?? '';
    await pickOption(page, item.getByRole('radiogroup'), option, index);
  }
}

async function cloze(page: Page, payload: Payload): Promise<void> {
  const blanks = listOf(payload.blanks);
  for (const [at, blank] of blanks.entries()) {
    const answer = (isRecord(blank) ? textOf(blank.answer) : null) ?? 'x';
    const name = `Blank ${at + 1} of ${blanks.length}`;
    await page.getByRole('textbox', { name, exact: true }).fill(answer);
  }
}

/** Enter on a left item, then Enter on its partner in the shuffled right column. */
async function matchPairs(page: Page, payload: Payload): Promise<void> {
  const left = page.getByRole('group', { name: 'Left column' });
  const right = page.getByRole('group', { name: 'Right column' });
  for (const [at, pair] of listOf(payload.pairs).filter(isRecord).entries()) {
    const rightText = textOf(pair.right) ?? '';
    // The left column keeps the order of the payload. A paired item also
    // carries a note in its name, so the partner is found while it is free.
    const leftItem = left.getByRole('button').nth(at);
    await expect(leftItem).toContainText(textOf(pair.left) ?? '');
    await leftItem.press('Enter');
    await right.getByRole('button', { name: rightText, exact: true }).press('Enter');
    await expect(leftItem).toHaveAccessibleDescription(`Paired with ${rightText}. Select to undo.`);
  }
}

/** The words of the bank in the order of the answer, or as given without an answer. */
function wordOrder(payload: Payload): string[] {
  const bank = listOf(payload.words).flatMap((word) => (typeof word === 'string' ? [word] : []));
  const left = [...bank];
  const order: string[] = [];
  let rest = (textOf(payload.answer) ?? '').trim();
  while (rest !== '') {
    const fits = left.filter((word) => rest === word || rest.startsWith(`${word} `));
    const next = fits.sort((a, b) => b.length - a.length)[0];
    if (next === undefined) return bank;
    left.splice(left.indexOf(next), 1);
    order.push(next);
    rest = rest.slice(next.length).trim();
  }
  return left.length === 0 ? order : bank;
}

/** Enter on a word of the bank moves it to the end of the line. */
async function orderWords(page: Page, payload: Payload): Promise<void> {
  const bank = page.getByRole('group', { name: 'Word bank' });
  const line = page.getByRole('group', { name: 'Your sentence' });
  const order = wordOrder(payload);
  for (const [at, word] of order.entries()) {
    await bank.getByRole('button', { name: word, exact: true }).first().press('Enter');
    await expect(line.getByRole('button')).toHaveCount(at + 1);
  }
}

/** Space shows the answer, 3 rates it Good. */
async function flashcard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show answer' }).press('Space');
  const ratings = page.getByRole('group', { name: 'How well did you know it?' });
  await expect(ratings).toBeVisible();
  await page.keyboard.press('3');
  await expect(ratings.getByRole('button', { name: 'Good', pressed: true })).toBeVisible();
}

async function dictation(page: Page, payload: Payload): Promise<void> {
  const text = textOf(payload.text) ?? 'Hallo';
  await page.getByRole('textbox', { name: 'Type what you hear' }).fill(text);
}

const SELF_CHECK_FIELDS: Record<string, string> = {
  translate: 'Your translation',
  write_free: 'Your text',
  speak_prompt: 'What you said (optional)',
};

/** translate, write_free and speak_prompt: a short text in the one text area. */
async function selfCheck(page: Page, exercise: LessonExercise): Promise<void> {
  const { payload, type } = exercise;
  const sample = textOf(listOf(payload.reference)[0]) ?? textOf(payload.sample_answer);
  const text = sample ?? textOf(payload.target_text) ?? 'Hallo! Ich lerne jeden Tag Deutsch.';
  const name = SELF_CHECK_FIELDS[type] ?? '';
  await page.getByRole('textbox', { name, exact: true }).fill(text);
}

const FILLERS: Record<string, (page: Page, payload: Payload) => Promise<void>> = {
  multiple_choice: multipleChoice,
  cloze,
  match_pairs: matchPairs,
  order_words: orderWords,
  flashcard: (page) => flashcard(page),
  read_answer: questions,
  listen_answer: questions,
  dictation,
};

/** The grade as the renderer words it in its feedback box. */
async function readOutcome(page: Page): Promise<Outcome> {
  const feedback = page
    .getByRole('alert')
    .filter({ hasText: /Correct|Not quite|Partly correct/ })
    .first();
  await expect(feedback).toBeVisible();
  const text = (await feedback.innerText()).replace(/^[^A-Za-z]+/, '');
  if (text.startsWith('Not quite')) return 'incorrect';
  return text.startsWith('Partly correct') ? 'partial' : 'correct';
}

const NEXT_BUTTON = /^(Continue|Finish)$/;

/**
 * Gives a complete answer to the exercise on screen, checks it and moves on.
 * `position` counts from 1. Returns how the answer was graded.
 */
export async function answerExercise(
  page: Page,
  exercise: LessonExercise,
  position: number,
  total: number,
): Promise<Outcome> {
  await expect(page.getByRole('progressbar', { name: 'Lesson progress' })).toHaveAttribute(
    'aria-valuetext',
    `Exercise ${position} of ${total}`,
  );
  if (exercise.instruction !== null) {
    await expect(page.getByText(exercise.instruction, { exact: true })).toBeVisible();
  }

  if (SELF_CHECK_TYPES.includes(exercise.type)) {
    await selfCheck(page, exercise);
    // A self check is saved and moves on in one press.
    await page.getByRole('button', { name: NEXT_BUTTON }).click();
    return 'self_check';
  }

  const fill = FILLERS[exercise.type];
  if (fill === undefined) throw new Error(`No way to answer the type ${exercise.type}.`);
  await fill(page, exercise.payload);
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const outcome = await readOutcome(page);
  await page.getByRole('button', { name: NEXT_BUTTON }).click();
  return outcome;
}
