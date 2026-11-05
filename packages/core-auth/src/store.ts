// Storage port for core-auth: the reads and writes sign in needs, and nothing
// else. The in memory adapter below is for unit tests and local development.
// The Postgres and better-auth adapter implements the same port in Phase 1.
// Every timestamp is an ISO 8601 string.

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
  /** Null until the link is consumed. */
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
  findLinkToken(token: string): Promise<AuthLinkToken | null>;
  /**
   * Sets usedAt if the token exists and is unused. Returns true when this call
   * claimed it, false otherwise. Must be atomic, so a link works once.
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
      linkTokens.set(link.token, { ...link });
    },

    async findLinkToken(token) {
      const link = linkTokens.get(token);
      return link ? { ...link } : null;
    },

    async markLinkTokenUsed(token, usedAt) {
      const link = linkTokens.get(token);
      if (!link || link.usedAt !== null) return false;
      link.usedAt = usedAt;
      return true;
    },
  };
}
