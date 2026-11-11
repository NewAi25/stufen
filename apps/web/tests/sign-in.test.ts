import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer } from '../src/server/container';
import { createRateLimiter } from '../src/server/rate-limit';
import {
  callbackUrl,
  clientAddressFrom,
  completeSignIn,
  devLinkFor,
  isSameOriginPost,
  LINK_ERROR_PATH,
  NEUTRAL_MESSAGE,
  requestSignInLink,
  safeNextPath,
  sessionCookieOptions,
  SIGN_IN_LIMIT,
  SIGN_IN_WINDOW_MS,
  signInPathFor,
  signOutSession,
} from '../src/server/sign-in';
import { memoryConfig } from './helpers/config';

const APP_URL = 'http://localhost:3000';
const NEUTRAL = { ok: true, message: NEUTRAL_MESSAGE };

// The console mail adapter prints every mail. Keep the test output readable.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

function setup() {
  const container = createContainer(memoryConfig());
  const mail = container.consoleMail;
  if (!mail) throw new Error('tests expect the console mail adapter');
  const deps = { auth: container.auth, limiter: container.signInLimiter, appUrl: APP_URL };
  return { container, mail, deps };
}

/** The link of the newest mail, split into its parts. */
function lastLink(mail: { last(): { text: string } | undefined }) {
  const link = mail.last()?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error('no link in the last mail');
  const url = new URL(link);
  return { link, url, token: url.searchParams.get('token'), next: url.searchParams.get('next') };
}

describe('requestSignInLink', () => {
  it('gives the same neutral answer for a known and an unknown email', async () => {
    const { container, mail, deps } = setup();
    await container.auth.createDevSession('known@example.test');

    const known = await requestSignInLink(deps, {
      email: 'known@example.test',
      clientAddress: '203.0.113.1',
    });
    const unknown = await requestSignInLink(deps, {
      email: 'nobody@example.test',
      clientAddress: '203.0.113.2',
    });

    expect(known).toEqual(NEUTRAL);
    expect(unknown).toEqual(known);
    expect(known.ok && known.message).toBe('If that address can sign in, a link is on its way.');
    // Both got one mail of the same shape, so the mail does not tell them apart either.
    expect(mail.sent.map((message) => message.to)).toEqual([
      'known@example.test',
      'nobody@example.test',
    ]);
    expect(mail.sent[0]?.subject).toBe(mail.sent[1]?.subject);
  });

  it('builds the link on APP_URL with the callback path, next and a token', async () => {
    const { mail, deps } = setup();
    await requestSignInLink(deps, {
      email: '  Learner@Example.Test ',
      next: '/settings',
      clientAddress: null,
    });

    const { link, url, token, next } = lastLink(mail);
    expect(link.startsWith(`${APP_URL}/auth/callback?next=%2Fsettings&token=`)).toBe(true);
    expect(url.origin).toBe(APP_URL);
    expect(next).toBe('/settings');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mail.last()?.to).toBe('learner@example.test');
  });

  it('answers a value that is not an email with a field error and sends nothing', async () => {
    const { mail, deps } = setup();
    for (const email of ['', '   ', 'not-an-email', 'a@b', 'two words@example.test', 42, null]) {
      const result = await requestSignInLink(deps, { email, clientAddress: null });
      expect(result).toMatchObject({ ok: false, field: 'email' });
    }
    expect(mail.sent).toHaveLength(0);
  });

  it('keeps the answer neutral when the mail server fails, and reports it', async () => {
    const { deps } = setup();
    const errors: unknown[] = [];
    const result = await requestSignInLink(
      {
        ...deps,
        auth: {
          requestMagicLink: async () => {
            throw new Error('connection refused');
          },
        },
        onError: (error) => errors.push(error),
      },
      { email: 'learner@example.test', clientAddress: null },
    );
    expect(result).toEqual(NEUTRAL);
    expect(errors).toHaveLength(1);
  });
});

describe('the sign in rate limit', () => {
  it('stops sending after five requests for one email, with the same answer', async () => {
    const { mail, deps } = setup();
    for (let request = 1; request <= SIGN_IN_LIMIT + 3; request += 1) {
      const result = await requestSignInLink(deps, {
        email: 'learner@example.test',
        // A new address every time, so only the email counter can stop it.
        clientAddress: `203.0.113.${request}`,
      });
      expect(result).toEqual(NEUTRAL);
    }
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT);
  });

  it('stops one client address that walks through many emails', async () => {
    const { mail, deps } = setup();
    for (let request = 1; request <= SIGN_IN_LIMIT + 3; request += 1) {
      const result = await requestSignInLink(deps, {
        email: `learner${request}@example.test`,
        clientAddress: '203.0.113.9',
      });
      expect(result).toEqual(NEUTRAL);
    }
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT);

    // Another client is not affected.
    await requestSignInLink(deps, { email: 'other@example.test', clientAddress: '203.0.113.10' });
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT + 1);
  });

  it('shares one counter between requests with no known address', async () => {
    const { mail, deps } = setup();
    for (let request = 1; request <= SIGN_IN_LIMIT + 1; request += 1) {
      await requestSignInLink(deps, {
        email: `learner${request}@example.test`,
        clientAddress: null,
      });
    }
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT);
  });

  it('lets requests through again when the window has passed', async () => {
    const { mail, deps } = setup();
    let time = Date.parse('2026-11-12T10:00:00Z');
    const limiter = createRateLimiter({
      limit: SIGN_IN_LIMIT,
      windowMs: SIGN_IN_WINDOW_MS,
      now: () => new Date(time),
    });
    const request = () =>
      requestSignInLink(
        { ...deps, limiter },
        { email: 'learner@example.test', clientAddress: '203.0.113.1' },
      );

    for (let count = 0; count < SIGN_IN_LIMIT + 1; count += 1) await request();
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT);

    time += SIGN_IN_WINDOW_MS - 1000;
    await request();
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT);

    time += 2000;
    await request();
    expect(mail.sent).toHaveLength(SIGN_IN_LIMIT + 1);
  });

  it('bounds the number of remembered keys', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const key of ['a', 'b', 'c', 'd']) expect(limiter.hit(key)).toBe(true);
    // "a" was dropped to make room, the others are still counted.
    expect(limiter.hit('d')).toBe(false);
    expect(limiter.hit('c')).toBe(false);
    expect(limiter.hit('a')).toBe(true);
  });
});

describe('safeNextPath', () => {
  it('keeps a path on this site', () => {
    expect(safeNextPath('/settings')).toBe('/settings');
    expect(safeNextPath('/lesson/abc?step=2#top')).toBe('/lesson/abc?step=2#top');
  });

  it('turns everything else into the home page', () => {
    const backslash = String.fromCharCode(92);
    const refused = [
      'https://evil.example/',
      'http://evil.example',
      '//evil.example',
      '///evil.example',
      `/${backslash}evil.example`,
      `${backslash}${backslash}evil.example`,
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
      'settings',
      '',
      '/sign-in',
      '/sign-in?next=%2Fsettings',
      '/auth/callback?token=x',
      `/${'a'.repeat(600)}`,
      null,
      undefined,
      7,
    ];
    for (const value of refused) expect(safeNextPath(value), String(value)).toBe('/');
  });

  it('is applied when the link and the sign in path are built', () => {
    expect(callbackUrl(APP_URL, '//evil.example')).toBe(`${APP_URL}/auth/callback?next=%2F`);
    expect(signInPathFor('/settings')).toBe('/sign-in?next=%2Fsettings');
    expect(signInPathFor('/')).toBe('/sign-in');
    expect(signInPathFor('https://evil.example')).toBe('/sign-in');
  });
});

describe('completeSignIn', () => {
  async function requested(next?: string) {
    const context = setup();
    await requestSignInLink(context.deps, {
      email: 'learner@example.test',
      ...(next === undefined ? {} : { next }),
      clientAddress: '203.0.113.1',
    });
    return { ...context, ...lastLink(context.mail) };
  }

  it('sets a session for a valid token and goes to next', async () => {
    const { container, token, next } = await requested('/settings');
    const result = await completeSignIn({ auth: container.auth }, { token, next });

    if (!result.ok) throw new Error('the link was refused');
    expect(result.redirectTo).toBe('/settings');
    expect(result.session.email).toBe('learner@example.test');
    expect(await container.auth.getSession(result.session.sessionToken)).toMatchObject({
      userId: result.session.userId,
    });
    // The new user got a profile and the default plan through the bus.
    expect((await container.identity.getProfile(result.session.userId)).id).toBe(
      result.session.userId,
    );
    expect(await container.stores.events.count('user.signed_up')).toBe(1);
  });

  it('rejects a reused token', async () => {
    const { container, token } = await requested();
    const first = await completeSignIn({ auth: container.auth }, { token, next: '/' });
    const second = await completeSignIn({ auth: container.auth }, { token, next: '/' });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, redirectTo: LINK_ERROR_PATH });
    expect(LINK_ERROR_PATH).toBe('/sign-in?error=link');
  });

  it('rejects a missing, unknown or oversized token without a session', async () => {
    const { container } = setup();
    for (const token of [null, undefined, '', 'f'.repeat(64), 'x'.repeat(5000), 12]) {
      const result = await completeSignIn({ auth: container.auth }, { token, next: '/settings' });
      expect(result).toEqual({ ok: false, redirectTo: LINK_ERROR_PATH });
    }
  });

  it('rejects an absolute or protocol relative next', async () => {
    for (const bad of ['https://evil.example/', '//evil.example', 'http://localhost:3000/x']) {
      // Asked for at request time: the link itself already carries "/".
      const { container, token, next } = await requested(bad);
      expect(next).toBe('/');
      // Tampered with afterwards: the callback checks again.
      const result = await completeSignIn({ auth: container.auth }, { token, next: bad });
      expect(result).toMatchObject({ ok: true, redirectTo: '/' });
    }
  });
});

describe('sessionCookieOptions', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const session = { expiresAt: '2026-12-12T10:00:00Z' };

  it('is httpOnly, lax, site wide and lasts as long as the session', () => {
    expect(sessionCookieOptions(session, { secure: false, now })).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it('is secure when APP_URL is https and never has a negative age', () => {
    expect(sessionCookieOptions(session, { secure: true, now }).secure).toBe(true);
    const expired = { expiresAt: '2026-11-11T10:00:00Z' };
    expect(sessionCookieOptions(expired, { secure: true, now }).maxAge).toBe(0);
  });

  it('matches the lifetime core-auth gives a new session', async () => {
    const { container } = setup();
    const created = await container.auth.createDevSession('learner@example.test');
    const { maxAge } = sessionCookieOptions(created, { secure: false });
    const thirtyDays = 30 * 24 * 60 * 60;
    expect(maxAge).toBeGreaterThan(thirtyDays - 60);
    expect(maxAge).toBeLessThanOrEqual(thirtyDays);
  });
});

describe('signOutSession', () => {
  it('removes the session and is safe to repeat', async () => {
    const { container } = setup();
    const session = await container.auth.createDevSession('learner@example.test');
    expect(await container.auth.getSession(session.sessionToken)).not.toBeNull();

    await signOutSession({ auth: container.auth }, session.sessionToken);
    expect(await container.auth.getSession(session.sessionToken)).toBeNull();
    await expect(
      signOutSession({ auth: container.auth }, session.sessionToken),
    ).resolves.toBeUndefined();
  });

  it('does nothing without a cookie value', async () => {
    const { container } = setup();
    for (const token of [null, undefined, '']) {
      await expect(signOutSession({ auth: container.auth }, token)).resolves.toBeUndefined();
    }
  });
});

describe('devLinkFor', () => {
  it('returns the newest link for that email only', async () => {
    const { mail, deps } = setup();
    expect(devLinkFor(mail, 'a@example.test')).toBeNull();
    await requestSignInLink(deps, { email: 'a@example.test', clientAddress: '203.0.113.1' });
    const first = devLinkFor(mail, 'a@example.test');
    await requestSignInLink(deps, { email: 'b@example.test', clientAddress: '203.0.113.2' });
    await requestSignInLink(deps, { email: 'A@example.test', clientAddress: '203.0.113.3' });

    const newest = devLinkFor(mail, ' A@Example.test ');
    expect(newest).toBe(lastLink(mail).link);
    expect(newest).not.toBe(first);
    expect(devLinkFor(mail, 'b@example.test')).not.toBe(newest);
    expect(devLinkFor(mail, 'c@example.test')).toBeNull();
    expect(devLinkFor(mail, 'not-an-email')).toBeNull();
  });
});

describe('request helpers', () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it('takes the client address from the last X-Forwarded-For entry', () => {
    expect(clientAddressFrom(headers({}))).toBeNull();
    expect(clientAddressFrom(headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
    // The first entry is whatever the client typed. The proxy appended the last one.
    expect(clientAddressFrom(headers({ 'x-forwarded-for': '10.0.0.1, 203.0.113.7' }))).toBe(
      '203.0.113.7',
    );
    expect(clientAddressFrom(headers({ 'x-forwarded-for': `1.1.1.1, ${'9'.repeat(200)}` }))).toBe(
      null,
    );
  });

  it('accepts a POST from this site and refuses one from another site', () => {
    const app = 'https://stufen.example.test';
    expect(isSameOriginPost(headers({ origin: app }), app)).toBe(true);
    expect(isSameOriginPost(headers({ origin: 'https://evil.example' }), app)).toBe(false);
    expect(isSameOriginPost(headers({ origin: 'http://stufen.example.test' }), app)).toBe(false);
    expect(isSameOriginPost(headers({ origin: 'null' }), app)).toBe(false);
    expect(isSameOriginPost(headers({ 'sec-fetch-site': 'cross-site' }), app)).toBe(false);
    expect(isSameOriginPost(headers({ 'sec-fetch-site': 'same-origin' }), app)).toBe(true);
    // No browser headers at all: a script, which carries nobody else's cookie.
    expect(isSameOriginPost(headers({}), app)).toBe(true);
  });
});
