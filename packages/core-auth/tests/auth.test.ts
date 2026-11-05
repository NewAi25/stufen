// Behaviour of the in memory AuthPort adapter (P0-25). Acceptance check from
// docs/07-build-sequence.md: the adapter issues a link token for an email,
// consuming it creates a session that getSession returns, and an unknown token
// returns null. No network and no filesystem: mail is a recording fake.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { MailMessage, MailPort } from '@stufen/contracts';
import { AuthError, createInMemoryAuth, createInMemoryAuthStore } from '../src/index';
import type { AuthPort, InMemoryAuthOptions } from '../src/index';

const START = new Date('2026-11-05T10:00:00.000Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function fakeMail(): MailPort & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { messageId: `m${sent.length}` };
    },
  };
}

/** An adapter with a clock the test can move and predictable tokens and ids. */
function setup(overrides: Partial<InMemoryAuthOptions> = {}) {
  const mail = fakeMail();
  const bus = createEventBus();
  const signedUp = vi.fn(async () => {});
  bus.on('user.signed_up', signedUp);
  const clock = { time: START.getTime() };
  let tokens = 0;
  let ids = 0;
  const auth = createInMemoryAuth({
    mail,
    bus,
    now: () => new Date(clock.time),
    newToken: () => `token-${++tokens}`,
    newId: () => `user-${++ids}`,
    ...overrides,
  });
  return { auth, mail, bus, signedUp, clock };
}

/** Pulls the token out of the last mail, the way a learner clicking the link would. */
function tokenFromLastMail(mail: { sent: MailMessage[] }): string {
  const text = mail.sent.at(-1)?.text ?? '';
  const match = /[?&]token=([^\s&#]+)/.exec(text);
  if (!match?.[1]) throw new Error('no token in the mail text');
  return match[1];
}

async function codeOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (error instanceof AuthError) return error.code;
    throw error;
  }
  return 'did not throw';
}

describe('createInMemoryAuth: acceptance', () => {
  it('issues a link token, and consuming it creates a session that getSession returns', async () => {
    const { auth, mail } = setup();

    await expect(auth.requestMagicLink('ada@example.com', '/auth/callback')).resolves.toEqual({
      sent: true,
    });
    const session = await auth.consumeMagicLink(tokenFromLastMail(mail));

    expect(session).not.toBeNull();
    expect(session?.email).toBe('ada@example.com');
    expect(session?.userId).toBe('user-1');
    expect(session?.sessionToken).toBeTruthy();
    await expect(auth.getSession(session?.sessionToken)).resolves.toEqual(session);
  });

  it('an unknown link token returns null', async () => {
    const { auth } = setup();
    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    await expect(auth.consumeMagicLink('not-a-token')).resolves.toBeNull();
    await expect(auth.consumeMagicLink('')).resolves.toBeNull();
  });
});

describe('requestMagicLink', () => {
  it('sends exactly one mail to the address, with the link and the token in the text', async () => {
    const { auth, mail } = setup();

    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe('ada@example.com');
    expect(mail.sent[0]?.subject).toContain('Stufen');
    expect(mail.sent[0]?.text).toContain('/auth/callback?token=token-1');
  });

  it('uses & when redirectTo already has a query, and accepts an absolute URL', async () => {
    const { auth, mail } = setup();

    await auth.requestMagicLink('ada@example.com', 'https://stufen.example/auth/callback?next=/a1');

    expect(mail.sent[0]?.text).toContain(
      'https://stufen.example/auth/callback?next=/a1&token=token-1',
    );
  });

  it('puts the token in front of a #fragment', async () => {
    const { auth, mail } = setup();

    await auth.requestMagicLink('ada@example.com', '/auth/callback#top');

    expect(mail.sent[0]?.text).toContain('/auth/callback?token=token-1#top');
  });

  it('uses the app name it is given', async () => {
    const { auth, mail } = setup({ appName: 'Treppe' });

    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    expect(mail.sent[0]?.subject).toContain('Treppe');
    expect(mail.sent[0]?.text).toContain('Treppe');
  });

  it('the default token is 32 random bytes as hex and differs per request', async () => {
    const mail = fakeMail();
    const auth = createInMemoryAuth({ mail });

    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    const first = tokenFromLastMail(mail);
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    const second = tokenFromLastMail(mail);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it.each(['', '   ', 'ada', 'ada@', '@example.com', 'ada@example', 'a da@example.com'])(
    'rejects the invalid email %j and sends nothing',
    async (email) => {
      const { auth, mail } = setup();

      expect(await codeOf(() => auth.requestMagicLink(email, '/auth/callback'))).toBe(
        'invalid_email',
      );
      expect(mail.sent).toHaveLength(0);
    },
  );

  it.each([
    '',
    'auth/callback',
    '//evil.example/path',
    '/\\evil.example',
    'javascript:alert(1)',
    'ftp://example.com/file',
    'mailto:ada@example.com',
  ])('rejects the invalid redirect %j and sends nothing', async (redirectTo) => {
    const { auth, mail } = setup();

    expect(await codeOf(() => auth.requestMagicLink('ada@example.com', redirectTo))).toBe(
      'invalid_redirect',
    );
    expect(mail.sent).toHaveLength(0);
  });

  it('throws an AuthError that is also an Error', async () => {
    const { auth } = setup();

    const failure = auth.requestMagicLink('nope', '/auth/callback');

    await expect(failure).rejects.toBeInstanceOf(AuthError);
    await expect(failure).rejects.toBeInstanceOf(Error);
    await expect(failure).rejects.toMatchObject({ name: 'AuthError', code: 'invalid_email' });
  });
});

describe('consumeMagicLink', () => {
  it('a link token works once', async () => {
    const { auth, mail } = setup();
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    const token = tokenFromLastMail(mail);

    const first = await auth.consumeMagicLink(token);
    const second = await auth.consumeMagicLink(token);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('two consumes at the same moment produce one session', async () => {
    const { auth, mail } = setup();
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    const token = tokenFromLastMail(mail);

    const results = await Promise.all([auth.consumeMagicLink(token), auth.consumeMagicLink(token)]);

    expect(results.filter((session) => session !== null)).toHaveLength(1);
  });

  it('an expired link returns null, and a link just inside its lifetime works', async () => {
    const late = setup();
    await late.auth.requestMagicLink('ada@example.com', '/auth/callback');
    late.clock.time += 15 * MINUTE;
    await expect(late.auth.consumeMagicLink(tokenFromLastMail(late.mail))).resolves.toBeNull();

    const inTime = setup();
    await inTime.auth.requestMagicLink('ada@example.com', '/auth/callback');
    inTime.clock.time += 15 * MINUTE - 1;
    await expect(
      inTime.auth.consumeMagicLink(tokenFromLastMail(inTime.mail)),
    ).resolves.not.toBeNull();
  });

  it('respects a custom link lifetime', async () => {
    const { auth, mail, clock } = setup({ linkTtlMs: MINUTE });
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    clock.time += MINUTE;

    await expect(auth.consumeMagicLink(tokenFromLastMail(mail))).resolves.toBeNull();
  });

  it('creates the user on first sign in and marks the email verified', async () => {
    const store = createInMemoryAuthStore();
    const { auth, mail } = setup({ store });
    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    const session = await auth.consumeMagicLink(tokenFromLastMail(mail));

    await expect(store.findUserById(session?.userId ?? '')).resolves.toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      emailVerified: true,
      name: null,
      createdAt: START.toISOString(),
    });
  });

  it('a second sign in with the same email reuses the user and gives a new session', async () => {
    const { auth, mail } = setup();
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    const first = await auth.consumeMagicLink(tokenFromLastMail(mail));
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    const second = await auth.consumeMagicLink(tokenFromLastMail(mail));

    expect(second?.userId).toBe(first?.userId);
    expect(second?.sessionToken).not.toBe(first?.sessionToken);
    await expect(auth.getSession(first?.sessionToken)).resolves.not.toBeNull();
    await expect(auth.getSession(second?.sessionToken)).resolves.not.toBeNull();
  });
});

describe('email normalisation', () => {
  it('A@Example.com and a@example.com are one user', async () => {
    const { auth, mail, signedUp } = setup();

    await auth.requestMagicLink('  A@Example.com ', '/auth/callback');
    expect(mail.sent[0]?.to).toBe('a@example.com');
    const upper = await auth.consumeMagicLink(tokenFromLastMail(mail));
    await auth.requestMagicLink('a@example.com', '/auth/callback');
    const lower = await auth.consumeMagicLink(tokenFromLastMail(mail));

    expect(upper?.email).toBe('a@example.com');
    expect(lower?.userId).toBe(upper?.userId);
    expect(signedUp).toHaveBeenCalledTimes(1);
  });
});

describe('user.signed_up', () => {
  it('is emitted exactly once per new user', async () => {
    const { auth, mail, signedUp } = setup();

    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    expect(signedUp).not.toHaveBeenCalled();
    const ada = await auth.consumeMagicLink(tokenFromLastMail(mail));
    await auth.requestMagicLink('ada@example.com', '/auth/callback');
    await auth.consumeMagicLink(tokenFromLastMail(mail));
    await auth.requestMagicLink('grace@example.com', '/auth/callback');
    const grace = await auth.consumeMagicLink(tokenFromLastMail(mail));

    expect(signedUp).toHaveBeenCalledTimes(2);
    expect(signedUp).toHaveBeenNthCalledWith(1, { userId: ada?.userId });
    expect(signedUp).toHaveBeenNthCalledWith(2, { userId: grace?.userId });
  });

  it('is not emitted for a link that fails', async () => {
    const { auth, signedUp } = setup();

    await auth.consumeMagicLink('not-a-token');

    expect(signedUp).not.toHaveBeenCalled();
  });

  it('sign in works without a bus', async () => {
    const mail = fakeMail();
    const auth = createInMemoryAuth({ mail });
    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    await expect(auth.consumeMagicLink(tokenFromLastMail(mail))).resolves.not.toBeNull();
  });
});

describe('getSession', () => {
  it('returns null for null, undefined, empty and unknown tokens', async () => {
    const { auth } = setup();

    await expect(auth.getSession(null)).resolves.toBeNull();
    await expect(auth.getSession(undefined)).resolves.toBeNull();
    await expect(auth.getSession('')).resolves.toBeNull();
    await expect(auth.getSession('not-a-session')).resolves.toBeNull();
  });

  it('a session lasts 30 days by default and then returns null', async () => {
    const { auth, clock } = setup();
    const session = await auth.createDevSession('ada@example.com');

    expect(session.expiresAt).toBe(new Date(START.getTime() + 30 * DAY).toISOString());
    clock.time += 30 * DAY - 1;
    await expect(auth.getSession(session.sessionToken)).resolves.toEqual(session);
    clock.time += 1;
    await expect(auth.getSession(session.sessionToken)).resolves.toBeNull();
  });

  it('respects a custom session lifetime', async () => {
    const { auth, clock } = setup({ sessionTtlMs: MINUTE });
    const session = await auth.createDevSession('ada@example.com');

    clock.time += MINUTE;

    await expect(auth.getSession(session.sessionToken)).resolves.toBeNull();
  });
});

describe('signOut', () => {
  it('deletes the session, is safe to call twice, and leaves other sessions alone', async () => {
    const { auth } = setup();
    const first = await auth.createDevSession('ada@example.com');
    const second = await auth.createDevSession('ada@example.com');

    await auth.signOut(first.sessionToken);
    await expect(auth.signOut(first.sessionToken)).resolves.toBeUndefined();
    await expect(auth.signOut('not-a-session')).resolves.toBeUndefined();

    await expect(auth.getSession(first.sessionToken)).resolves.toBeNull();
    await expect(auth.getSession(second.sessionToken)).resolves.toEqual(second);
  });
});

describe('signInWithGoogle', () => {
  it('returns the dev placeholder URL with redirectTo encoded', async () => {
    const { auth } = setup();

    await expect(auth.signInWithGoogle('/settings?tab=profile')).resolves.toEqual({
      url: '/auth/dev-google?redirectTo=%2Fsettings%3Ftab%3Dprofile',
    });
  });

  it('rejects an invalid redirect', async () => {
    const { auth } = setup();

    expect(await codeOf(() => auth.signInWithGoogle('//evil.example'))).toBe('invalid_redirect');
  });
});

describe('createDevSession', () => {
  it('creates the user with the name, returns a live session and emits user.signed_up once', async () => {
    const store = createInMemoryAuthStore();
    const { auth, mail, signedUp } = setup({ store });

    const first = await auth.createDevSession(' Dev@Example.com ', 'Dev Learner');
    const second = await auth.createDevSession('dev@example.com');

    expect(first.email).toBe('dev@example.com');
    expect(second.userId).toBe(first.userId);
    expect(second.sessionToken).not.toBe(first.sessionToken);
    await expect(auth.getSession(first.sessionToken)).resolves.toEqual(first);
    expect((await store.findUserById(first.userId))?.name).toBe('Dev Learner');
    expect(signedUp).toHaveBeenCalledTimes(1);
    expect(signedUp).toHaveBeenCalledWith({ userId: first.userId });
    expect(mail.sent).toHaveLength(0);
  });

  it('shares users with the magic link flow', async () => {
    const { auth, mail, signedUp } = setup();
    const dev = await auth.createDevSession('ada@example.com');
    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    const linked = await auth.consumeMagicLink(tokenFromLastMail(mail));

    expect(linked?.userId).toBe(dev.userId);
    expect(signedUp).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid email', async () => {
    const { auth } = setup();

    expect(await codeOf(() => auth.createDevSession('nope'))).toBe('invalid_email');
  });
});

describe('wiring', () => {
  it('two adapters do not share state, and one store can back two adapters', async () => {
    const a = setup();
    const b = setup();
    const session = await a.auth.createDevSession('ada@example.com');
    await expect(b.auth.getSession(session.sessionToken)).resolves.toBeNull();

    const store = createInMemoryAuthStore();
    const first = setup({ store });
    const second = setup({ store, newToken: () => 'other-token' });
    const shared = await first.auth.createDevSession('ada@example.com');
    await expect(second.auth.getSession(shared.sessionToken)).resolves.toEqual(shared);
  });

  it('is usable as a plain AuthPort', async () => {
    const port: AuthPort = setup().auth;

    await expect(port.getSession('x')).resolves.toBeNull();
  });

  it('the store hands out copies, so callers cannot change stored records', async () => {
    const store = createInMemoryAuthStore();
    const { user } = await store.createUserIfAbsent({
      id: 'u1',
      email: 'ada@example.com',
      emailVerified: false,
      name: null,
      createdAt: START.toISOString(),
    });

    user.email = 'changed@example.com';

    expect((await store.findUserById('u1'))?.email).toBe('ada@example.com');
  });
});
