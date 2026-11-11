// createAuth on an explicit store (P1-37), and the production guard on
// createDevSession. No database: the store is the in memory one.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { MailMessage, MailPort } from '@stufen/contracts';
import { AuthError, createAuth, createInMemoryAuth, createInMemoryAuthStore } from '../src/index';
import type { AuthOptions, AuthStore } from '../src/index';

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

function setup(overrides: Partial<AuthOptions> = {}) {
  const mail = fakeMail();
  const store = createInMemoryAuthStore();
  const bus = createEventBus();
  const signedUp = vi.fn(async () => {});
  bus.on('user.signed_up', signedUp);
  const auth = createAuth({ store, mail, bus, env: {}, ...overrides });
  return { auth, mail, store, signedUp };
}

function tokenFromLastMail(mail: { sent: MailMessage[] }): string {
  const match = /[?&]token=([^\s&#]+)/.exec(mail.sent.at(-1)?.text ?? '');
  if (!match?.[1]) throw new Error('no token in the mail text');
  return match[1];
}

/** A store that counts every call, to prove a refused call touched nothing. */
function countingStore(): { store: AuthStore; calls: () => number } {
  const inner = createInMemoryAuthStore();
  let calls = 0;
  const store = new Proxy(inner, {
    get(target, key, receiver) {
      calls += 1;
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  return { store, calls: () => calls };
}

describe('createAuth', () => {
  it('runs the magic link flow on the store it is given', async () => {
    const { auth, mail, store } = setup();

    await auth.requestMagicLink('Ada@Example.com', '/auth/callback');
    const session = await auth.consumeMagicLink(tokenFromLastMail(mail));

    expect(session?.email).toBe('ada@example.com');
    await expect(auth.getSession(session?.sessionToken)).resolves.toEqual(session);
    const stored = await store.findSession(session?.sessionToken ?? '');
    expect(stored?.userId).toBe(session?.userId);
  });

  it('createInMemoryAuth is createAuth with an in memory store', async () => {
    const store = createInMemoryAuthStore();
    const mail = fakeMail();
    const wrapped = createInMemoryAuth({ mail, store, env: {} });
    const direct = createAuth({ mail, store, env: {} });

    const session = await wrapped.createDevSession('ada@example.com');

    await expect(direct.getSession(session.sessionToken)).resolves.toEqual(session);
  });
});

describe('createDevSession in production', () => {
  it('throws AuthError dev_session_disabled when NODE_ENV is production', async () => {
    const { auth } = setup({ env: { NODE_ENV: 'production' } });

    const error = await auth.createDevSession('ada@example.com').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe('dev_session_disabled');
  });

  it('is refused before the store, the bus or the mail port is touched', async () => {
    const { store, calls } = countingStore();
    const { auth, mail, signedUp } = setup({ store, env: { NODE_ENV: 'production' } });

    await expect(auth.createDevSession('ada@example.com', 'Ada')).rejects.toThrow(AuthError);
    // Even an invalid email gets the same answer, so nothing else is learned.
    await expect(auth.createDevSession('not an email')).rejects.toMatchObject({
      code: 'dev_session_disabled',
    });

    expect(calls()).toBe(0);
    expect(signedUp).not.toHaveBeenCalled();
    expect(mail.sent).toHaveLength(0);
  });

  it.each(['Production', ' production ', 'PRODUCTION'])('also refuses NODE_ENV "%s"', async (v) => {
    const { auth } = setup({ env: { NODE_ENV: v } });

    await expect(auth.createDevSession('ada@example.com')).rejects.toMatchObject({
      code: 'dev_session_disabled',
    });
  });

  it.each([undefined, 'development', 'test'])('works when NODE_ENV is %s', async (v) => {
    const { auth } = setup({ env: { NODE_ENV: v } });

    const session = await auth.createDevSession('ada@example.com');

    await expect(auth.getSession(session.sessionToken)).resolves.toEqual(session);
  });

  it('reads NODE_ENV on every call, not once at creation', async () => {
    const env: { NODE_ENV?: string } = { NODE_ENV: 'development' };
    const { auth } = setup({ env });
    await auth.createDevSession('ada@example.com');

    env.NODE_ENV = 'production';

    await expect(auth.createDevSession('ada@example.com')).rejects.toThrow(AuthError);
  });

  it('reads process.env when no env is given', async () => {
    const mail = fakeMail();
    const auth = createAuth({ store: createInMemoryAuthStore(), mail });
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(auth.createDevSession('ada@example.com')).rejects.toMatchObject({
        code: 'dev_session_disabled',
      });
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(auth.createDevSession('ada@example.com')).resolves.toBeTruthy();
  });

  it('the magic link flow still works in production', async () => {
    const { auth, mail } = setup({ env: { NODE_ENV: 'production' } });

    await auth.requestMagicLink('ada@example.com', '/auth/callback');

    await expect(auth.consumeMagicLink(tokenFromLastMail(mail))).resolves.not.toBeNull();
  });
});
