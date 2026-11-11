// What the sign in form shows after a submit. Shared by the server action and
// the client form, so it lives outside src/server.

export interface SignInFormState {
  status: 'idle' | 'sent' | 'invalid';
  /** The neutral answer, or what is wrong with the email field. */
  message: string;
  /** Local development only: the link the console mail adapter printed. */
  devLink?: string;
}

export const SIGN_IN_IDLE: SignInFormState = { status: 'idle', message: '' };

/** How long a magic link works. The container hands this to core-auth. */
export const LINK_LIFETIME_MINUTES = 15;
