import { describe, expect, it } from 'vitest';
import { listMyFeedback, submitFeedbackFor } from '../src/server/actions/feedback-actions';
import { readConfig } from '../src/server/config';
import { createContainer } from '../src/server/container';

async function setup() {
  const container = createContainer(readConfig({ NODE_ENV: 'test' }));
  const session = await container.auth.createDevSession('tester@stufen.local');
  return { container, session };
}

describe('submitFeedbackFor', () => {
  it('stores a signed in submit so it appears in listMyFeedback', async () => {
    const { container, session } = await setup();
    const result = await submitFeedbackFor(container, session, {
      kind: 'idea',
      message: 'Add a dark theme for the level map.',
      page: '/settings',
      context: { theme: 'dark', viewportWidth: 1280, viewportHeight: 720, language: 'en-GB' },
    });

    expect(result).toEqual({ ok: true });
    const mine = await listMyFeedback(container, session.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      userId: session.userId,
      kind: 'idea',
      message: 'Add a dark theme for the level map.',
      page: '/settings',
      rating: null,
      status: 'new',
    });
    expect(mine[0]?.context).toMatchObject({ theme: 'dark', viewportWidth: 1280 });
    expect(await container.stores.events.count('feedback.submitted')).toBe(1);
  });

  it("accepts a signed out submit, which appears in nobody's list", async () => {
    const { container, session } = await setup();
    const result = await submitFeedbackFor(container, null, {
      kind: 'bug',
      message: 'The button does nothing.',
      page: '/',
    });

    expect(result).toEqual({ ok: true });
    expect(await container.stores.events.count('feedback.submitted')).toBe(1);
    expect(await listMyFeedback(container, session.userId)).toEqual([]);
    expect(await listMyFeedback(container, '')).toEqual([]);
  });

  it('returns ok false with field message for an empty bug report', async () => {
    const { container, session } = await setup();
    const result = await submitFeedbackFor(container, session, {
      kind: 'bug',
      message: '   ',
      page: '/kit',
    });

    expect(result).toEqual({ ok: false, field: 'message', message: 'message must not be empty' });
    expect(await listMyFeedback(container, session.userId)).toEqual([]);
  });

  it('accepts a rating with no message for kind rating', async () => {
    const { container, session } = await setup();
    const result = await submitFeedbackFor(container, session, {
      kind: 'rating',
      message: '',
      rating: 4,
      page: '/',
    });

    expect(result).toEqual({ ok: true });
    const mine = await listMyFeedback(container, session.userId);
    expect(mine[0]).toMatchObject({ kind: 'rating', rating: 4, message: '' });
  });

  it('lists the newest feedback first', async () => {
    const { container, session } = await setup();
    await submitFeedbackFor(container, session, { kind: 'idea', message: 'first', page: '/' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await submitFeedbackFor(container, session, { kind: 'idea', message: 'second', page: '/' });

    const mine = await listMyFeedback(container, session.userId);
    expect(mine.map((row) => row.message)).toEqual(['second', 'first']);
  });
});
