// In memory implementation of AuthPort (P0-25). No auth library: magic link
// tokens and sessions are random strings kept in an AuthStore. Everything it
// needs is passed in, so there is no module level state. The better-auth and
// Postgres adapter replaces this in Phase 1 behind the same port.
import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthPort, AuthSession, EventBus, MailPort } from '@stufen/contracts';
import { createInMemoryAuthStore } from './store';
import type { AuthStore, AuthUser } from './store';

export type AuthErrorCode = 'invalid_email' | 'invalid_redirect';

/** Thrown for input the caller can fix. `code` is stable; `message` is for logs. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface InMemoryAuthOptions {
  /** Magic link mail goes through this port. */
  mail: MailPort;
  /** Default: a fresh in memory store. */
  store?: AuthStore;
  /** When given, `user.signed_up` is emitted the first time a user is created. */
  bus?: EventBus;
  /** Clock. Default: the system clock. */
  now?: () => Date;
  /** Link and session tokens. Default: 32 random bytes as hex. */
  newToken?: () => string;
  /** User ids. Default: a random UUID. */
  newId?: () => string;
  /** Default: 30 days. */
  sessionTtlMs?: number;
  /** Default: 15 minutes. */
  linkTtlMs?: number;
  /** Used in the mail subject and text. Default: 'Stufen'. */
  appName?: string;
}

export type InMemoryAuth = AuthPort & {
  /**
   * Finds or creates the user and returns a session without any link. For
   * local development and for apps/web before real sign in exists.
   */
  createDevSession(email: string, name?: string): Promise<AuthSession>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 30 * DAY_MS;
const DEFAULT_LINK_TTL_MS = 15 * 60 * 1000;
const MAX_EMAIL_LENGTH = 254;
// Deliberately simple: something, an @, something, a dot, something, no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(email: string): string {
  const normalised = email.trim().toLowerCase();
  if (normalised.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalised)) {
    throw new AuthError('invalid_email', 'The email address is not valid.');
  }
  return normalised;
}

function isAllowedRedirect(redirectTo: string): boolean {
  if (redirectTo.startsWith('/')) {
    // '//host' and '/\host' are read by browsers as another site, not a path.
    return !redirectTo.startsWith('//') && !redirectTo.startsWith('/\\');
  }
  try {
    const { protocol } = new URL(redirectTo);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function assertRedirect(redirectTo: string): void {
  if (!isAllowedRedirect(redirectTo)) {
    throw new AuthError(
      'invalid_redirect',
      'redirectTo must be a path starting with "/" or an http or https URL.',
    );
  }
}

/** Appends the token as a query parameter, in front of any #fragment. */
function buildLink(redirectTo: string, token: string): string {
  const hashAt = redirectTo.indexOf('#');
  const base = hashAt === -1 ? redirectTo : redirectTo.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : redirectTo.slice(hashAt);
  return `${base}${base.includes('?') ? '&' : '?'}token=${token}${fragment}`;
}

export function createInMemoryAuth(options: InMemoryAuthOptions): InMemoryAuth {
  const { mail, bus } = options;
  const store = options.store ?? createInMemoryAuthStore();
  const now = options.now ?? (() => new Date());
  const newToken = options.newToken ?? (() => randomBytes(32).toString('hex'));
  const newId = options.newId ?? (() => randomUUID());
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const linkTtlMs = options.linkTtlMs ?? DEFAULT_LINK_TTL_MS;
  const appName = options.appName ?? 'Stufen';

  function isPast(isoTimestamp: string): boolean {
    return new Date(isoTimestamp).getTime() <= now().getTime();
  }

  function isoAfter(ms: number): string {
    return new Date(now().getTime() + ms).toISOString();
  }

  /** `email` must already be normalised. Emits user.signed_up on first creation. */
  async function findOrCreateUser(email: string, name: string | null): Promise<AuthUser> {
    const { user, created } = await store.createUserIfAbsent({
      id: newId(),
      email,
      emailVerified: false,
      name,
      createdAt: now().toISOString(),
    });
    if (created && bus) await bus.emit('user.signed_up', { userId: user.id });
    return user;
  }

  async function startSession(user: AuthUser): Promise<AuthSession> {
    const session = { token: newToken(), userId: user.id, expiresAt: isoAfter(sessionTtlMs) };
    await store.insertSession(session);
    return {
      sessionToken: session.token,
      userId: user.id,
      email: user.email,
      expiresAt: session.expiresAt,
    };
  }

  return {
    async getSession(sessionToken) {
      if (!sessionToken) return null;
      const session = await store.findSession(sessionToken);
      if (!session) return null;
      if (isPast(session.expiresAt)) {
        await store.deleteSession(session.token);
        return null;
      }
      const user = await store.findUserById(session.userId);
      if (!user) return null;
      return {
        sessionToken: session.token,
        userId: user.id,
        email: user.email,
        expiresAt: session.expiresAt,
      };
    },

    async requestMagicLink(email, redirectTo) {
      const to = normaliseEmail(email);
      assertRedirect(redirectTo);
      const token = newToken();
      await store.insertLinkToken({
        token,
        email: to,
        redirectTo,
        expiresAt: isoAfter(linkTtlMs),
        usedAt: null,
      });
      const minutes = Math.max(1, Math.round(linkTtlMs / 60_000));
      await mail.send({
        to,
        subject: `Your ${appName} sign in link`,
        text: [
          `Open this link to sign in to ${appName}:`,
          '',
          buildLink(redirectTo, token),
          '',
          `The link works once and expires in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
          'If you did not ask for it, you can ignore this email.',
        ].join('\n'),
      });
      return { sent: true };
    },

    async consumeMagicLink(token) {
      if (!token) return null;
      const link = await store.findLinkToken(token);
      if (!link || link.usedAt !== null || isPast(link.expiresAt)) return null;
      // The store claims the token atomically, so of two racing calls one wins.
      const claimed = await store.markLinkTokenUsed(token, now().toISOString());
      if (!claimed) return null;
      const user = await findOrCreateUser(link.email, null);
      if (!user.emailVerified) await store.markEmailVerified(user.id);
      return startSession(user);
    },

    async signInWithGoogle(redirectTo) {
      assertRedirect(redirectTo);
      // Placeholder route. This adapter talks to no provider; the real Google
      // flow arrives with better-auth in Phase 1 (P1-37).
      return { url: '/auth/dev-google?redirectTo=' + encodeURIComponent(redirectTo) };
    },

    async signOut(sessionToken) {
      await store.deleteSession(sessionToken);
    },

    async createDevSession(email, name) {
      const user = await findOrCreateUser(normaliseEmail(email), name ?? null);
      return startSession(user);
    },
  };
}
