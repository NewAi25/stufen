// The learner path in a real browser (build sequence row P1-25): sign in,
// onboarding, the first A1 lesson, five reviews, the level map.
//
// Runs against a server that is already up, in Postgres mode. See "End to end
// test" in apps/web/README.md. Each run creates users whose address starts
// with `e2e-` and ends in `@example.test`.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { answerExercise } from './helpers/answers';
import type { Outcome } from './helpers/answers';
import { readLesson, SELF_CHECK_TYPES } from './helpers/lesson-content';
import { requestSignInLink, uniqueEmail } from './helpers/sign-in';

const FIRST_LESSON = 'de/units/A1/01-hallo/lesson-01.json';
const TARGET_LEVEL = 'A2';
const CARDS_TO_RATE = 5;

function baseUrlOf(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error('The Playwright config sets no baseURL.');
  return baseURL;
}

function cardsLeft(count: number): string {
  return count === 1 ? '1 card left' : `${count} cards left`;
}

/** The number in "12 cards left", read from the counter of the review screen. */
async function readCardsLeft(page: Page): Promise<number> {
  const counter = page.getByRole('status').filter({ hasText: /\d+ cards? left/ });
  await expect(counter).toBeVisible();
  const match = /(\d+) cards? left/.exec(await counter.innerText());
  if (match?.[1] === undefined) throw new Error('The review counter shows no number.');
  return Number(match[1]);
}

/** Space shows the answer of the card on screen, 3 rates it Good. */
async function rateCardGood(page: Page): Promise<void> {
  const ratings = page.getByRole('group', { name: 'How well did you know it?' });
  // Tried again when the key came before the page was ready to hear it.
  await expect(async () => {
    if (!(await ratings.isVisible())) {
      await page.getByRole('button', { name: 'Show answer' }).press('Space', { timeout: 2_000 });
    }
    await expect(ratings).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await page.keyboard.press('3');
}

test('a new learner signs in, sets up, finishes A1 lesson 1 and reviews five cards', async ({
  page,
  baseURL,
}) => {
  const base = baseUrlOf(baseURL);
  const email = uniqueEmail();
  const lesson = readLesson(FIRST_LESSON);
  const total = lesson.exercises.length;

  await test.step('open / signed out and land on the sign in page', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  });

  await test.step('ask for a sign in link and follow it to onboarding', async () => {
    const link = await requestSignInLink(page, email, base);
    await page.goto(link);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Set up your learning' })).toBeVisible();
  });

  await test.step('choose German and a target level, then start from zero', async () => {
    const languages = page.getByRole('radiogroup', { name: 'Which language?' });
    await languages.getByRole('radio', { name: 'German' }).click();
    await expect(languages.getByRole('radio', { name: 'German' })).toBeChecked();
    const levels = page.getByRole('radiogroup', { name: 'What level do you want to reach?' });
    const level = levels.getByRole('radio', { name: TARGET_LEVEL, exact: true });
    // Tried again when the click came before the form was ready to hear it.
    await expect(async () => {
      await level.click();
      await expect(level).toBeChecked({ timeout: 2_000 });
    }).toPass();
    await page.getByRole('button', { name: 'Start from zero' }).click();
  });

  await test.step('land on home and see the first lesson as the next one', async () => {
    await expect(page.getByRole('heading', { name: `Welcome, ${email}` })).toBeVisible();
    await expect(page).toHaveURL('/');
    await expect(page.getByText('German. Working towards A1')).toBeVisible();
    const nextLesson = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Next lesson' }) });
    await expect(nextLesson.getByText(lesson.title, { exact: true })).toBeVisible();
    await nextLesson.getByRole('link', { name: 'Open lesson' }).click();
    await expect(page).toHaveURL(/\/lesson\/[^/]+$/);
    await expect(page.getByRole('progressbar', { name: 'Lesson progress' })).toBeVisible();
    // The keys of an exercise only act once the page script has loaded.
    await page.waitForLoadState('networkidle');
  });

  const outcomes: Outcome[] = [];
  await test.step(`answer all ${total} exercises of the lesson`, async () => {
    for (const [at, exercise] of lesson.exercises.entries()) {
      await test.step(`exercise ${at + 1}: ${exercise.type}`, async () => {
        outcomes.push(await answerExercise(page, exercise, at + 1, total));
      });
    }
  });

  await test.step('the summary shows the score and the words that went into review', async () => {
    await expect(page.getByRole('heading', { name: 'Lesson finished', level: 1 })).toBeVisible();
    const checked = lesson.exercises.filter((entry) => !SELF_CHECK_TYPES.includes(entry.type));
    const correct = outcomes.filter((outcome) => outcome === 'correct').length;
    expect(checked.length, 'the lesson has more than one checked exercise').toBeGreaterThan(1);
    await expect(
      page.getByText(`You got ${correct} of ${checked.length} checked exercises right.`),
    ).toBeVisible();
    expect(lesson.introducedItems, 'the lesson introduces several items').toBeGreaterThan(1);
    await expect(
      page.getByText(`${lesson.introducedItems} new words and phrases went into your reviews.`),
    ).toBeVisible();
  });

  await test.step('go back home and start the reviews', async () => {
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page.getByText(/^\d+ cards are due\.$/)).toBeVisible();
    await page.getByRole('link', { name: 'Start reviews' }).click();
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByRole('heading', { name: 'Review', level: 1 })).toBeVisible();
  });

  await test.step(`rate ${CARDS_TO_RATE} cards and watch the counter go down`, async () => {
    const before = await readCardsLeft(page);
    expect(before, 'enough cards are due').toBeGreaterThan(CARDS_TO_RATE);
    for (let rated = 1; rated <= CARDS_TO_RATE; rated += 1) {
      await rateCardGood(page);
      await expect(
        page.getByRole('status').filter({ hasText: /\d+ cards? left/ }),
        `the counter after ${rated} ratings`,
      ).toHaveText(cardsLeft(before - rated));
    }
    expect(await readCardsLeft(page)).toBe(before - CARDS_TO_RATE);
  });

  await test.step('the level map shows A1 with evidence from the lesson', async () => {
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    const map = page.getByRole('list', { name: 'Level map' });
    const a1 = map.getByRole('button', { name: /Level A1/ });
    await expect(a1).toContainText('Working towards A1');
    await expect(a1).toHaveAttribute('aria-expanded', 'true');
    const evidence = map.getByRole('table', { name: 'Evidence for A1' });
    await expect(
      evidence.getByRole('cell', { name: /^[1-9]\d* attempts?$/ }).first(),
    ).toBeVisible();
  });
});

test('a signed out visitor is sent to sign in, and a sign in link works only once', async ({
  page,
  baseURL,
}) => {
  const base = baseUrlOf(baseURL);
  const email = uniqueEmail();
  let link = '';

  await test.step('open /settings signed out and land on the sign in page', async () => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  });

  await test.step('sign in with the link and arrive at the settings', async () => {
    link = await requestSignInLink(page, email, base);
    await page.goto(link);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  await test.step('sign out', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  await test.step('the same link a second time shows the calm note and no session', async () => {
    await page.goto(link);
    await expect(page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(
      page.getByText('That link did not work. It may have expired or been used already.'),
    ).toBeVisible();
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  });
});
