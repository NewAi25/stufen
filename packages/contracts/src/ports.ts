// Ports for infrastructure that boxes share without importing each other.
// core-auth, core-storage and core-mail implement these. Any box may depend
// on the interface. Readable copy: docs/04-module-contracts.md.

/** A signed in session. `sessionToken` is opaque and travels in a cookie. */
export interface AuthSession {
  sessionToken: string;
  userId: string;
  email: string;
  /** ISO 8601 timestamp. */
  expiresAt: string;
}

export interface AuthPort {
  /** Returns the session for a token, or null when missing, unknown or expired. */
  getSession(sessionToken: string | null | undefined): Promise<AuthSession | null>;
  /** Creates a one time link token for the email and sends it through a MailPort. */
  requestMagicLink(email: string, redirectTo: string): Promise<{ sent: true }>;
  /** Exchanges a link token for a session. Unknown or used tokens return null. */
  consumeMagicLink(token: string): Promise<AuthSession | null>;
  /** Returns the provider URL to redirect the browser to. */
  signInWithGoogle(redirectTo: string): Promise<{ url: string }>;
  signOut(sessionToken: string): Promise<void>;
}

export interface StoragePort {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** A URL the browser can fetch for a limited time. */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailPort {
  send(message: MailMessage): Promise<{ messageId: string }>;
}
