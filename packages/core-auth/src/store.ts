// Storage port for core-auth: the reads and writes sign in needs, and nothing
// else. The in memory adapter below is for unit tests and local development.
// The Postgres adapter in postgres-store.ts implements the same port, and
// tests/store-contract.ts holds the behaviour both must show.
// Every timestamp is an ISO 8601 string.
//
// The service hands raw tokens to the port. Whether a token is stored as it
// is (in memory) or as a hash (Postgres) is the adapter's business.

export interface AuthUser {
  id: string;
  /** Trimmed and lower cased. Unique. */
  email: string;
  emailVerified: boolean;
  name: string | null;
  createdAt: string;
}

export interface AuthSessionRecord {
  /** Opaque session token. Unique. */
  token: string;
  userId: string;
  expiresAt: string;
}

export interface AuthLinkToken {
  /** Opaque one time token. Unique. */
  token: string;
  email: string;
  redirectTo: string;
  expiresAt: string;
  /**
   * Null on every token a store returns: a used token is deleted, not kept.
   * A link handed to insertLinkToken with usedAt set counts as used already
   * and is not stored.
   */
  usedAt: string | null;
}

export interface AuthStore {
  /**
   * Inserts the user unless one with the same email exists. Returns the stored
   * user and whether this call created it. Must be atomic, so two sign ins for
   * one new email create one user.
   */
  createUserIfAbsent(user: AuthUser): Promise<{ user: AuthUser; created: boolean }>;
  findUserById(userId: string): Promise<AuthUser | null>;
  markEmailVerified(userId: string): Promise<void>;

  insertSession(session: AuthSessionRecord): Promise<void>;
  findSession(token: string): Promise<AuthSessionRecord | null>;
  /** Deleting a session that does not exist is not an error. */
  deleteSession(token: string): Promise<void>;

  insertLinkToken(link: AuthLinkToken): Promise<void>;
  /** Null for a token that was never stored or has been used. Expiry is the caller's check. */
  findLinkToken(token: string): Promise<AuthLinkToken | null>;
  /**
   * Claims the token by removing it. Returns true when this call removed it,
   * false when it was unknown or already used. Must be atomic, so of any
   * number of calls racing for one token exactly one gets true. After that
   * findLinkToken returns null. `usedAt` is when the claim happened; an
   * adapter that deletes the token has nowhere to keep it.
   */
  markLinkTokenUsed(token: string, usedAt: string): Promise<boolean>;
}

/** Keeps everything in Maps. Loses all data when the process restarts. */
export function createInMemoryAuthStore(): AuthStore {
  const usersById = new Map<string, AuthUser>();
  const userIdByEmail = new Map<string, string>();
  const sessions = new Map<string, AuthSessionRecord>();
  const linkTokens = new Map<string, AuthLinkToken>();

  // Records are copied on the way in and on the way out, so a caller can never
  // change stored state by mutating an object it holds.
  return {
    async createUserIfAbsent(user) {
      const existingId = userIdByEmail.get(user.email);
      const existing = existingId === undefined ? undefined : usersById.get(existingId);
      if (existing) return { user: { ...existing }, created: false };
      usersById.set(user.id, { ...user });
      userIdByEmail.set(user.email, user.id);
      return { user: { ...user }, created: true };
    },

    async findUserById(userId) {
      const user = usersById.get(userId);
      return user ? { ...user } : null;
    },

    async markEmailVerified(userId) {
      const user = usersById.get(userId);
      if (user) user.emailVerified = true;
    },

    async insertSession(session) {
      sessions.set(session.token, { ...session });
    },

    async findSession(token) {
      const session = sessions.get(token);
      return session ? { ...session } : null;
    },

    async deleteSession(token) {
      sessions.delete(token);
    },

    async insertLinkToken(link) {
      if (link.usedAt !== null) return;
      linkTokens.set(link.token, { ...link });
    },

    async findLinkToken(token) {
      const link = linkTokens.get(token);
      return link ? { ...link } : null;
    },

    async markLinkTokenUsed(token) {
      // One synchronous step, so two calls in the same tick cannot both win.
      return linkTokens.delete(token);
    },
  };
}
