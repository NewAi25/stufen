// The behaviour every SessionStore adapter must show, written against the port
// only. Not a test file itself: store-contract.memory.test.ts runs it for the
// in memory store and postgres-store.integration.test.ts for Postgres.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LanguageCode } from '@stufen/contracts';
import { DuplicateAttemptError } from '../src/index';
import type { SessionStore, StoredAttempt, StoredSession } from '../src/index';

export interface SessionStoreHarness {
  store: SessionStore;
  /** A fresh uuid the store may write rows for (Postgres: a profile exists). */
  newUserId(): Promise<string>;
  /** The language of both lessons below. */
  language: LanguageCode;
  /** A lesson the store may point sessions at, with its four exercise ids. */
  lessonId: string;
  exerciseIds: string[];
  /** A second lesson with the same language. It needs no exercises. */
  secondLessonId: string;
}

const T1 = '2026-11-10T08:00:00.000Z';
const T2 = '2026-11-10T08:01:00.000Z';
const T3 = '2026-11-10T08:02:00.000Z';
const T4 = '2026-11-10T08:03:00.000Z';

export function runSessionStoreContract(
  name: string,
  makeHarness: () => SessionStoreHarness | Promise<SessionStoreHarness>,
): void {
  describe(`SessionStore contract: ${name}`, () => {
    let h: SessionStoreHarness;
    let store: SessionStore;

    beforeAll(async () => {
      h = await makeHarness();
      store = h.store;
    });

    function sessionFor(userId: string, overrides: Partial<StoredSession> = {}): StoredSession {
      return {
        id: randomUUID(),
        userId,
        lessonId: h.lessonId,
        language: h.language,
        startedAt: T1,
        completedAt: null,
        score: null,
        exerciseOrder: [...h.exerciseIds],
        ...overrides,
      };
    }

    function attemptFor(userId: string, overrides: Partial<StoredAttempt> = {}): StoredAttempt {
      return {
        id: randomUUID(),
        userId,
        sessionId: null,
        exerciseId: null,
        itemId: null,
        exerciseType: 'multiple_choice',
        correct: true,
        score: 1,
        response: { selected: 2 },
        feedback: { message: 'Correct.' },
        durationMs: 1200,
        createdAt: T1,
        ...overrides,
      };
    }

    describe('sessions', () => {
      it('insertSession stores the row and getSession returns it', async () => {
        const wanted = sessionFor(await h.newUserId());

        const stored = await store.insertSession(wanted);

        expect(stored).toEqual(wanted);
        expect(await store.getSession(wanted.userId, wanted.id)).toEqual(wanted);
      });

      it('insertSession rejects an id that is already stored', async () => {
        const first = await store.insertSession(sessionFor(await h.newUserId()));

        await expect(store.insertSession({ ...first, startedAt: T2 })).rejects.toThrow(
          `lesson session ${first.id} already exists`,
        );
        expect(await store.getSession(first.userId, first.id)).toEqual(first);
      });

      it('getSession returns null for an unknown id', async () => {
        expect(await store.getSession(await h.newUserId(), randomUUID())).toBeNull();
      });

      it("getSession returns null for another user's session", async () => {
        const mine = await store.insertSession(sessionFor(await h.newUserId()));

        expect(await store.getSession(await h.newUserId(), mine.id)).toBeNull();
      });

      it('updateSession sets completedAt and score and keeps the rest', async () => {
        const before = await store.insertSession(sessionFor(await h.newUserId()));

        const updated = await store.updateSession(before.userId, before.id, {
          completedAt: T3,
          score: 0.667,
        });

        expect(updated).toEqual({ ...before, completedAt: T3, score: 0.667 });
        expect(await store.getSession(before.userId, before.id)).toEqual(updated);
      });

      it('updateSession with an empty patch changes nothing', async () => {
        const before = await store.insertSession(sessionFor(await h.newUserId()));

        expect(await store.updateSession(before.userId, before.id, {})).toEqual(before);
        expect(await store.getSession(before.userId, before.id)).toEqual(before);
      });

      it("updateSession returns null for another user's session and changes nothing", async () => {
        const mine = await store.insertSession(sessionFor(await h.newUserId()));

        const updated = await store.updateSession(await h.newUserId(), mine.id, {
          completedAt: T3,
          score: 1,
        });

        expect(updated).toBeNull();
        expect(await store.getSession(mine.userId, mine.id)).toEqual(mine);
      });

      it('updateSession returns null for an unknown id', async () => {
        expect(
          await store.updateSession(await h.newUserId(), randomUUID(), { score: 1 }),
        ).toBeNull();
      });

      it('listSessionsByUser returns only the own sessions, oldest first', async () => {
        const userId = await h.newUserId();
        const later = await store.insertSession(sessionFor(userId, { startedAt: T3 }));
        const earlier = await store.insertSession(sessionFor(userId, { startedAt: T1 }));
        const middle = await store.insertSession(
          sessionFor(userId, { startedAt: T2, lessonId: h.secondLessonId, exerciseOrder: [] }),
        );
        await store.insertSession(sessionFor(await h.newUserId()));

        expect(await store.listSessionsByUser(userId)).toEqual([earlier, middle, later]);
      });

      it('listSessionsByUser orders sessions with the same startedAt by id', async () => {
        const userId = await h.newUserId();
        const stored = await Promise.all(
          [1, 2, 3].map(() => store.insertSession(sessionFor(userId))),
        );
        const ids = stored.map((row) => row.id).sort();

        expect((await store.listSessionsByUser(userId)).map((row) => row.id)).toEqual(ids);
      });

      it('listSessionsByUser returns an empty list for a user with no sessions', async () => {
        expect(await store.listSessionsByUser(await h.newUserId())).toEqual([]);
      });

      it('completedLessonIds lists each completed lesson once, in ascending order', async () => {
        const userId = await h.newUserId();
        const done = { completedAt: T4, score: 1 };
        await store.insertSession(sessionFor(userId, done));
        await store.insertSession(sessionFor(userId, { ...done, startedAt: T2 }));
        await store.insertSession(
          sessionFor(userId, { ...done, lessonId: h.secondLessonId, exerciseOrder: [] }),
        );
        const other = await h.newUserId();
        await store.insertSession(sessionFor(other));

        expect(await store.completedLessonIds(userId)).toEqual(
          [h.lessonId, h.secondLessonId].sort(),
        );
        expect(await store.completedLessonIds(other)).toEqual([]);
      });

      it('completedLessonIds leaves out a lesson that was only started', async () => {
        const userId = await h.newUserId();
        await store.insertSession(sessionFor(userId));
        const second = await store.insertSession(
          sessionFor(userId, { lessonId: h.secondLessonId, exerciseOrder: [] }),
        );
        await store.updateSession(userId, second.id, { completedAt: T4, score: 0.5 });

        expect(await store.completedLessonIds(userId)).toEqual([h.secondLessonId]);
      });

      it('hands out copies: changing a returned session does not change the stored one', async () => {
        const stored = await store.insertSession(sessionFor(await h.newUserId()));
        const copy = await store.getSession(stored.userId, stored.id);
        copy?.exerciseOrder.push(randomUUID());

        expect(await store.getSession(stored.userId, stored.id)).toEqual(stored);
      });
    });

    describe('attempts', () => {
      it('insertAttempt stores a session attempt and lists it for the session', async () => {
        const session = await store.insertSession(sessionFor(await h.newUserId()));
        const wanted = attemptFor(session.userId, {
          sessionId: session.id,
          exerciseId: h.exerciseIds[0] ?? null,
          correct: false,
          score: 0.333,
          response: { answers: ['een', 'twee'] },
          feedback: { message: 'Nearly.', expected: 'drie' },
        });

        const stored = await store.insertAttempt(wanted);

        expect(stored).toEqual(wanted);
        expect(await store.listAttemptsBySession(session.userId, session.id)).toEqual([wanted]);
      });

      it('insertAttempt stores a standalone attempt with nulls', async () => {
        const wanted = attemptFor(await h.newUserId(), {
          exerciseType: 'flashcard',
          response: null,
          feedback: null,
          durationMs: null,
          score: 0,
          correct: false,
        });

        expect(await store.insertAttempt(wanted)).toEqual(wanted);
        expect(await store.listAttemptsByUser(wanted.userId)).toEqual([wanted]);
      });

      it('keeps a response that is a string, a number or an array', async () => {
        const userId = await h.newUserId();
        const responses: unknown[] = ['Ik heet Ada', 3, ['a', 'b'], { text: 'x', n: [1, 2] }];
        for (const response of responses) {
          const stored = await store.insertAttempt(attemptFor(userId, { response }));
          expect(stored.response).toEqual(response);
        }
        const listed = await store.listAttemptsByUser(userId);
        expect(listed).toHaveLength(responses.length);
        for (const response of responses) {
          expect(listed.map((row) => row.response)).toContainEqual(response);
        }
      });

      it('insertAttempt rejects a second attempt for the same session and exercise', async () => {
        const session = await store.insertSession(sessionFor(await h.newUserId()));
        const exerciseId = h.exerciseIds[1] ?? null;
        const first = attemptFor(session.userId, { sessionId: session.id, exerciseId });
        await store.insertAttempt(first);

        const again = store.insertAttempt(
          attemptFor(session.userId, { sessionId: session.id, exerciseId, createdAt: T2 }),
        );

        await expect(again).rejects.toBeInstanceOf(DuplicateAttemptError);
        expect(await store.listAttemptsBySession(session.userId, session.id)).toEqual([first]);
      });

      it('allows the same exercise again in another session and standalone', async () => {
        const userId = await h.newUserId();
        const exerciseId = h.exerciseIds[0] ?? null;
        const one = await store.insertSession(sessionFor(userId));
        const two = await store.insertSession(sessionFor(userId, { startedAt: T2 }));

        await store.insertAttempt(attemptFor(userId, { sessionId: one.id, exerciseId }));
        await store.insertAttempt(attemptFor(userId, { sessionId: two.id, exerciseId }));
        await store.insertAttempt(attemptFor(userId, { exerciseId }));
        await store.insertAttempt(attemptFor(userId, { exerciseId }));

        expect(await store.listAttemptsByUser(userId)).toHaveLength(4);
      });

      it("insertAttempt rejects an attempt that points at another user's session", async () => {
        const theirs = await store.insertSession(sessionFor(await h.newUserId()));
        const me = await h.newUserId();

        const smuggled = store.insertAttempt(
          attemptFor(me, { sessionId: theirs.id, exerciseId: h.exerciseIds[0] ?? null }),
        );

        await expect(smuggled).rejects.toThrow(`user ${me} has no lesson session ${theirs.id}`);
        expect(await store.listAttemptsByUser(me)).toEqual([]);
        expect(await store.listAttemptsBySession(theirs.userId, theirs.id)).toEqual([]);
      });

      it('insertAttempt rejects an attempt that points at an unknown session', async () => {
        const me = await h.newUserId();

        await expect(
          store.insertAttempt(attemptFor(me, { sessionId: randomUUID() })),
        ).rejects.toThrow(/has no lesson session/);
        expect(await store.listAttemptsByUser(me)).toEqual([]);
      });

      it('insertAttempt rejects an id that is already stored', async () => {
        const first = await store.insertAttempt(attemptFor(await h.newUserId()));

        await expect(store.insertAttempt({ ...first, createdAt: T2 })).rejects.toThrow(
          `attempt ${first.id} already exists`,
        );
      });

      it('listAttemptsBySession returns the session attempts oldest first', async () => {
        const session = await store.insertSession(sessionFor(await h.newUserId()));
        const [e1, e2, e3] = h.exerciseIds;
        const base = { sessionId: session.id };
        const third = attemptFor(session.userId, {
          ...base,
          exerciseId: e3 ?? null,
          createdAt: T3,
        });
        const first = attemptFor(session.userId, {
          ...base,
          exerciseId: e1 ?? null,
          createdAt: T1,
        });
        const second = attemptFor(session.userId, {
          ...base,
          exerciseId: e2 ?? null,
          createdAt: T2,
        });
        for (const attempt of [third, first, second]) await store.insertAttempt(attempt);
        await store.insertAttempt(attemptFor(session.userId, { createdAt: T2 }));

        expect(await store.listAttemptsBySession(session.userId, session.id)).toEqual([
          first,
          second,
          third,
        ]);
      });

      it("listAttemptsBySession returns nothing for another user's session", async () => {
        const session = await store.insertSession(sessionFor(await h.newUserId()));
        await store.insertAttempt(
          attemptFor(session.userId, {
            sessionId: session.id,
            exerciseId: h.exerciseIds[0] ?? null,
          }),
        );

        expect(await store.listAttemptsBySession(await h.newUserId(), session.id)).toEqual([]);
      });

      it('listAttemptsByUser returns only the own attempts, newest first, up to the limit', async () => {
        const userId = await h.newUserId();
        const a1 = await store.insertAttempt(attemptFor(userId, { createdAt: T1 }));
        const a3 = await store.insertAttempt(attemptFor(userId, { createdAt: T3 }));
        const a2 = await store.insertAttempt(attemptFor(userId, { createdAt: T2 }));
        await store.insertAttempt(attemptFor(await h.newUserId(), { createdAt: T4 }));

        expect(await store.listAttemptsByUser(userId)).toEqual([a3, a2, a1]);
        expect(await store.listAttemptsByUser(userId, 2)).toEqual([a3, a2]);
        expect(await store.listAttemptsByUser(userId, 0)).toEqual([]);
        expect(await store.listAttemptsByUser(userId, 50)).toEqual([a3, a2, a1]);
      });

      it('listAttemptsByUser returns an empty list for a user with no attempts', async () => {
        expect(await store.listAttemptsByUser(await h.newUserId())).toEqual([]);
      });
    });
  });
}
