import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from '@stufen/db';
import { installPackInto } from '../../../scripts/install-pack';
import type { InstallPackOutcome } from '../../../scripts/install-pack';
import { submitFeedbackFor } from '../src/server/actions/feedback-actions';
import { completeOnboarding, saveSettings } from '../src/server/actions/identity-actions';
import { answerExercise, finishLesson, startLesson } from '../src/server/actions/lesson-actions';
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

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    container = createContainer(
      readConfig({ NODE_ENV: 'test', DATABASE_URL, STUFEN_CONTENT_DIR: CONTENT_ROOT }),
    );
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
});
