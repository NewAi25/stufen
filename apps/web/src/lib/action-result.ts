// The shape every server action returns. Shared by server and client code,
// so it lives outside src/server.

export type ActionResult = { ok: true } | { ok: false; field?: string; message: string };

export const NOT_SIGNED_IN: ActionResult = {
  ok: false,
  message: 'You are not signed in. Sign in and try again.',
};
