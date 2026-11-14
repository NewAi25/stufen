import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from '@stufen/db';
import { installPackInto } from '../../../scripts/install-pack';
import type { InstallPackOutcome } from '../../../scripts/install-pack';
import { submitFeedbackFor } from '../src/server/actions/feedback-actions';
import { completeOnboarding, saveSettings } from '../src/server/actions/identity-actions';
import { loadHome } from '../src/server/actions/home-actions';
import {
  answerExercise,
  completeLesson,
  finishLesson,
  openLesson,
  startLesson,
  submitLessonAnswer,
} from '../src/server/actions/lesson-actions';
import { loadProgress } from '../src/server/actions/progress-actions';
import { loadReviewQueue, rateReviewCard } from '../src/server/actions/review-actions';
import { readConfig } from '../src/server/config';
import { createContainer } from '../src/server/container';
import type { Container } from '../src/server/container';
import { isProvisionalFeedback } from '../src/server/grading';
import {
  completeSignIn,
  NEUTRAL_MESSAGE,
  requestSignInLink,
  signOutSession,
} from '../src/server/sign-in';
import { correctResponseFor } from './helpers/correct-response';

// Needs a migrated PostgreSQL 17 in DATABASE_URL, with a login user that owns
// the tables. The content tables of that database are installed into. Every
// user this file creates is deleted at the end.
const DATABASE_URL = process.env.DATABASE_URL;
const CONTENT_ROOT = process.env.STUFEN_CONTENT_DIR;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe.skipIf(!DATABASE_URL)('the container on Postgres', () => {
  let container: Container;
  let firstInstall: InstallPackOutcome;
  const email = `web-it-${randomUUID()}@example.test`;
  const createdUserIds: string[] = [];
  const createdFeedbackIds: string[] = [];

  function db() {
    if (!container.db) throw new Error('the container has no database handle');
    return container.db;
  }

  function install(): Promise<InstallPackOutcome> {
    return installPackInto({
      db: db(),
      language: 'de',
      log: () => {},
      ...(CONTENT_ROOT ? { contentRoot: CONTENT_ROOT } : {}),
    });
  }

  // True when the database already held a German pack. Then the install below
  // only refreshes it and nothing is removed afterwards. On an empty database
  // the pack is removed again, so other integration tests find it as it was.
  let hadContentBefore = false;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    container = createContainer(
      readConfig({ NODE_ENV: 'test', DATABASE_URL, STUFEN_CONTENT_DIR: CONTENT_ROOT }),
    );
    const before = await db()
      .selectFrom('units')
      .select('id')
      .where('language_code', '=', 'de')
      .limit(1)
      .execute();
    hadContentBefore = before.length > 0;
    firstInstall = await install();
  }, 120_000);

  afterAll(async () => {
    if (!container?.db) return;
    if (createdUserIds.length > 0) {
      // Rows that would outlive the user with an empty user id go first.
      await db().deleteFrom('events').where('user_id', 'in', createdUserIds).execute();
      await db().deleteFrom('feedback').where('user_id', 'in', createdUserIds).execute();
    }
    if (createdFeedbackIds.length > 0) {
      // feedback.submitted carries no user id, so it is found by the feedback id.
      await db()
        .deleteFrom('events')
        .where('name', '=', 'feedback.submitted')
        .where(sql<boolean>`props->>'feedbackId' = any(${createdFeedbackIds})`)
        .execute();
    }
    if (createdUserIds.length > 0) {
      await db().deleteFrom('users').where('id', 'in', createdUserIds).execute();
    }
    await db().deleteFrom('users').where('email', '=', email).execute();
    if (!hadContentBefore) {
      // Owner work, in an order the foreign keys allow. Learner rows went with
      // the users above.
      await db().deleteFrom('lesson_sessions').execute();
      await db().deleteFrom('units').where('language_code', '=', 'de').execute();
      await db().deleteFrom('items').where('language_code', '=', 'de').execute();
      await db().deleteFrom('cando_descriptors').where('language_code', '=', 'de').execute();
      await db().deleteFrom('content_pack_versions').where('language_code', '=', 'de').execute();
      await db()
        .updateTable('languages')
        .set({ pack_version: null })
        .where('code', '=', 'de')
        .execute();
    }
    await container.close();
  });

  it('runs in postgres mode and installs nothing at request time', async () => {
    expect(container.storeMode).toBe('postgres');
    expect(container.db).not.toBeNull();
    expect(container.config.devSessionEmail).toBeNull();
    expect(await container.ready).toBeNull();
  });

  it('installs the pack through the function the script uses, twice with the same ids', async () => {
    expect(firstInstall.validation.errors).toEqual([]);
    expect(firstInstall.ok).toBe(true);
    expect(firstInstall.install).toMatchObject({ language: 'de', status: 'active' });
    expect(firstInstall.activeVersion).toBe(container.packs.de.version);

    const second = await install();
    expect(second.ok).toBe(true);
    expect(second.idsDigest).toBe(firstInstall.idsDigest);
    expect(second.counts).toEqual(firstInstall.counts);

    // The container reads what the script wrote.
    expect(await container.content.activePackVersion('de')).toBe(firstInstall.activeVersion);
    const path = await container.curriculum.lessonPath('de');
    expect(path.length).toBeGreaterThan(0);
    expect(path.length).toBe(firstInstall.counts?.lessons);
    const active = await db()
      .selectFrom('content_pack_versions')
      .select(['version', 'status'])
      .where('language_code', '=', 'de')
      .where('status', '=', 'active')
      .execute();
    expect(active).toHaveLength(1);
  }, 120_000);

  it('signs a new user in, runs onboarding and one lesson, and leaves rows', async () => {
    // Sign in: request the link, read it from the console mail, follow it.
    const deps = {
      auth: container.auth,
      limiter: container.signInLimiter,
      appUrl: 'http://x.test',
    };
    const asked = await requestSignInLink(deps, { email, next: '/settings', clientAddress: null });
    expect(asked).toEqual({ ok: true, message: NEUTRAL_MESSAGE });
    const link = container.consoleMail?.last()?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error('no link in the console mail');
    const params = new URL(link).searchParams;
    const token = params.get('token');

    const signedIn = await completeSignIn(
      { auth: container.auth },
      { token, next: params.get('next') },
    );
    if (!signedIn.ok) throw new Error('the link was refused');
    const { userId, sessionToken } = signedIn.session;
    createdUserIds.push(userId);
    expect(signedIn.redirectTo).toBe('/settings');
    expect(userId).toMatch(UUID);
    expect(await completeSignIn({ auth: container.auth }, { token, next: '/' })).toMatchObject({
      ok: false,
    });

    const users = await db().selectFrom('users').selectAll().where('email', '=', email).execute();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: userId, email_verified: true });
    const sessions = await db()
      .selectFrom('sessions')
      .select('token')
      .where('user_id', '=', userId)
      .execute();
    expect(sessions).toHaveLength(1);
    // Only a hash is stored. The raw token lives in the cookie.
    expect(sessions[0]?.token).not.toBe(sessionToken);
    const entitlement = await db()
      .selectFrom('entitlements')
      .select('plan')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    expect(entitlement?.plan).toBe('free_beta');

    // Onboarding and settings, as the pages run them.
    expect(
      await completeOnboarding(container, userId, { language: 'de', targetLevel: 'B1' }),
    ).toEqual({ ok: true });
    expect(
      await saveSettings(container, userId, {
        displayName: 'Integration',
        uiLocale: 'en',
        timezone: 'Asia/Kolkata',
        dailyGoalMinutes: 20,
      }),
    ).toEqual({ ok: true });
    const profile = await db()
      .selectFrom('profiles')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    expect(profile).toMatchObject({
      active_language: 'de',
      display_name: 'Integration',
      timezone: 'Asia/Kolkata',
      daily_goal_minutes: 20,
    });
    expect(await container.entitlements.remaining(userId, 'tutor_messages_per_day')).toBe(200);
    expect(
      await submitFeedbackFor(container, { userId }, { kind: 'idea', message: 'Hi', page: '/' }),
    ).toEqual({ ok: true });
    const sent = await container.feedback.listMine(userId);
    expect(sent).toHaveLength(1);
    createdFeedbackIds.push(...sent.map((item) => item.id));

    // One lesson, every exercise, through the functions the lesson page uses.
    const next = await container.curriculum.nextLessonFor(userId, 'de');
    if (!next) throw new Error('no lesson is installed');
    const found = await container.getLesson(next.id);
    if (!found) throw new Error('the lesson is not stored');
    const session = await startLesson(container, userId, next.id);
    for (const exercise of found.lesson.exercises) {
      const answer = correctResponseFor(exercise);
      const { grade } = await answerExercise(container, userId, session.id, exercise.id, answer);
      expect(grade.correct, `${exercise.type} #${exercise.ordinal}`).toBe(true);
    }
    const result = await finishLesson(container, userId, session.id);
    expect(result.attempts).toBe(found.lesson.exercises.length);

    const stored = await db()
      .selectFrom('lesson_sessions')
      .select(['completed_at', 'lesson_id'])
      .where('user_id', '=', userId)
      .execute();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.lesson_id).toBe(next.id);
    expect(stored[0]?.completed_at).not.toBeNull();
    const attempts = await db()
      .selectFrom('attempts')
      .select(['exercise_type', 'feedback'])
      .where('user_id', '=', userId)
      .execute();
    expect(attempts).toHaveLength(found.lesson.exercises.length);
    const gradedTypes = new Set<string>(container.exerciseTypes.listTypes().map((type) => type.id));
    for (const attempt of attempts) {
      expect(isProvisionalFeedback(attempt.feedback)).toBe(!gradedTypes.has(attempt.exercise_type));
    }
    const itemIds = new Set([
      ...result.introducesItemIds,
      ...found.lesson.exercises.flatMap((exercise) => exercise.itemIds),
    ]);
    const cards = await db()
      .selectFrom('review_cards')
      .select('item_id')
      .where('user_id', '=', userId)
      .execute();
    expect(new Set(cards.map((card) => card.item_id))).toEqual(itemIds);
    const mastery = await db()
      .selectFrom('cando_mastery')
      .select('evidence_count')
      .where('user_id', '=', userId)
      .execute();
    expect(mastery.length).toBeGreaterThan(0);
    expect(await container.lessonEngine.completedLessonIds(userId)).toEqual([next.id]);
    const events = await db()
      .selectFrom('events')
      .select('name')
      .where('user_id', '=', userId)
      .execute();
    const names = events.map((event) => event.name);
    expect(names.filter((name) => name === 'attempt.recorded')).toHaveLength(attempts.length);
    expect(names).toContain('user.signed_up');
    expect(names).toContain('lesson.completed');

    // Sign out ends the session in the database.
    await signOutSession({ auth: container.auth }, sessionToken);
    expect(await container.auth.getSession(sessionToken)).toBeNull();
    const left = await db()
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', userId)
      .execute();
    expect(left).toHaveLength(0);
  }, 120_000);

  it('shows home, reviews and progress from the rows the lesson left', async () => {
    const userId = createdUserIds[0];
    if (!userId) throw new Error('the sign in test did not create a user');
    const done = await container.lessonEngine.completedLessonIds(userId);
    expect(done).toHaveLength(1);

    // The evidence rule holds in the stored events: an attempt nobody checked
    // names no descriptor and no item.
    const gradedTypes = new Set<string>(container.exerciseTypes.listTypes().map((type) => type.id));
    const recorded = await db()
      .selectFrom('events')
      .select('props')
      .where('user_id', '=', userId)
      .where('name', '=', 'attempt.recorded')
      .execute();
    let unchecked = 0;
    for (const { props } of recorded) {
      const event = props as { exerciseType: string; candoIds: string[]; itemIds: string[] };
      if (gradedTypes.has(event.exerciseType)) continue;
      unchecked += 1;
      expect(event.candoIds).toEqual([]);
      expect(event.itemIds).toEqual([]);
    }
    expect(unchecked).toBeGreaterThan(0);

    // Home: the done mark, the next lesson and the due count of the review box.
    const home = await loadHome(container, userId, 'de');
    const marked = home.units.flatMap((unit) => unit.lessons).filter((entry) => entry.completed);
    expect(marked.map((entry) => entry.id)).toEqual(done);
    expect(home.nextLesson).not.toBeNull();
    expect(home.nextLesson?.id).not.toBe(done[0]);
    expect(home.reviewsDue).toBe((await container.srs.stats(userId, 'de')).due);
    expect(home.reviewsDue).toBeGreaterThan(0);
    expect(home.primary).toBe('review');
    expect(home.streakDays).toBe(1);

    // Review: the queue is the due rows, and a rating moves one card out.
    const queue = await loadReviewQueue(container, userId, 'de', 10_000);
    expect(queue.cards).toHaveLength(home.reviewsDue);
    const card = queue.cards[0];
    if (!card) throw new Error('nothing is due after the lesson');
    const logs = () =>
      db().selectFrom('review_logs').select('rating').where('user_id', '=', userId).execute();
    const logsBefore = (await logs()).length;
    const rated = await rateReviewCard(container, userId, 'de', card.itemId, 3);
    expect(rated).toMatchObject({ ok: true, due: queue.due - 1 });
    expect(await logs()).toHaveLength(logsBefore + 1);
    const after = await loadReviewQueue(container, userId, 'de', 10_000);
    expect(after.cards.map((entry) => entry.itemId)).not.toContain(card.itemId);
    expect(after.due).toBe(queue.due - 1);

    // Progress: the evidence per descriptor is what cando_mastery holds.
    const view = await loadProgress(container, userId, 'de');
    const mastery = await db()
      .selectFrom('cando_mastery')
      .select(['cando_id', 'evidence_count', 'mastered_at'])
      .where('user_id', '=', userId)
      .execute();
    const descriptors = view.levels.flatMap((row) => row.descriptors);
    expect(descriptors.filter((entry) => entry.evidenceCount > 0)).toHaveLength(mastery.length);
    for (const row of mastery) {
      const shown = descriptors.find((entry) => entry.id === row.cando_id);
      expect(shown?.evidenceCount).toBe(row.evidence_count);
      expect(shown?.bestProductionScore).toBeNull();
      expect(row.mastered_at).toBeNull();
    }
    expect(view.hasEvidence).toBe(true);
    expect(view.estimate).toBeNull();
    expect(view.levels.every((row) => row.status !== 'reached')).toBe(true);
    expect(view.levels.every((row) => row.checkpoint === 'locked')).toBe(true);
  }, 120_000);

  it('runs the next lesson the way the lesson page does: open, leave, resume, finish', async () => {
    const userId = createdUserIds[0];
    if (!userId) throw new Error('the sign in test did not create a user');
    const next = await container.curriculum.nextLessonFor(userId, 'de');
    if (!next) throw new Error('no second lesson is installed');
    const found = await container.getLesson(next.id);
    if (!found) throw new Error('the lesson is not stored');
    const [first, ...rest] = found.lesson.exercises;
    if (!first) throw new Error('the lesson has no exercise');

    const opened = await openLesson(container, userId, next.id);
    if (opened?.status !== 'in_progress') throw new Error('the lesson did not open');
    expect(opened.position).toBe(1);
    expect(opened.total).toBe(found.lesson.exercises.length);
    expect(opened.exercise.id).toBe(first.id);
    expect(await openLesson(container, userId, randomUUID())).toBeNull();
    expect(await openLesson(container, userId, 'not-a-uuid')).toBeNull();

    // A user id that owns nothing cannot answer in, or finish, this session.
    const stranger = randomUUID();
    const answer = correctResponseFor(first);
    expect(
      (await submitLessonAnswer(container, stranger, opened.sessionId, first.id, answer)).ok,
    ).toBe(false);
    expect((await completeLesson(container, stranger, opened.sessionId)).ok).toBe(false);

    // One answer, then the learner leaves and comes back to the same session.
    const outcome = await submitLessonAnswer(container, userId, opened.sessionId, first.id, answer);
    expect(outcome.ok && outcome.result.correct).toBe(true);
    const resumed = await openLesson(container, userId, next.id);
    if (resumed?.status !== 'in_progress') throw new Error('the lesson did not resume');
    expect(resumed.sessionId).toBe(opened.sessionId);
    expect(resumed.position).toBe(2);
    expect((await completeLesson(container, userId, opened.sessionId)).ok).toBe(false);

    for (const exercise of rest) {
      const result = await submitLessonAnswer(
        container,
        userId,
        opened.sessionId,
        exercise.id,
        correctResponseFor(exercise),
      );
      expect(result.ok, `${exercise.type} #${exercise.ordinal}`).toBe(true);
    }
    const finished = await completeLesson(container, userId, opened.sessionId);
    if (!finished.ok) throw new Error(finished.message);
    const checked = found.lesson.exercises.filter((entry) =>
      container.exerciseTypes.hasType(entry.type),
    );
    expect(finished.summary).toMatchObject({
      lessonId: next.id,
      checked: checked.length,
      correct: checked.length,
      selfChecked: found.lesson.exercises.length - checked.length,
      newReviewItems: (found.lesson.introducesItemIds ?? []).length,
    });
    expect(finished.summary.next?.id).not.toBe(next.id);

    const sessions = await db()
      .selectFrom('lesson_sessions')
      .select(['lesson_id', 'completed_at'])
      .where('user_id', '=', userId)
      .execute();
    expect(sessions).toHaveLength(2);
    expect(sessions.every((row) => row.completed_at !== null)).toBe(true);
    for (const itemId of found.lesson.introducesItemIds ?? []) {
      const row = await db()
        .selectFrom('review_cards')
        .select('item_id')
        .where('user_id', '=', userId)
        .where('item_id', '=', itemId)
        .executeTakeFirst();
      expect(row, `card for ${itemId}`).toBeDefined();
    }
    const home = await loadHome(container, userId, 'de');
    expect(home.nextLesson?.id ?? null).toBe(finished.summary.next?.id ?? null);
  }, 120_000);
});
