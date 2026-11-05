import { describe, expect, it } from 'vitest';
import type { AuthPort, AuthSession, MailMessage, MailPort, StoragePort } from '../src/index';

// Structural stand ins prove the ports are implementable from the public surface.
describe('ports', () => {
  it('MailPort can be implemented and returns a message id', async () => {
    const sent: MailMessage[] = [];
    const mail: MailPort = {
      send: async (message) => {
        sent.push(message);
        return { messageId: `m${sent.length}` };
      },
    };
    const result = await mail.send({ to: 'a@example.com', subject: 's', text: 't' });
    expect(result.messageId).toBe('m1');
    expect(sent).toHaveLength(1);
  });

  it('StoragePort round trips bytes', async () => {
    const files = new Map<string, Uint8Array>();
    const storage: StoragePort = {
      put: async (key, data) => void files.set(key, data),
      get: async (key) => files.get(key) ?? null,
      delete: async (key) => void files.delete(key),
      signedUrl: async (key) => `memory://${key}`,
    };
    await storage.put('u1/a.txt', new Uint8Array([1, 2, 3]), 'text/plain');
    expect(await storage.get('u1/a.txt')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await storage.get('missing')).toBeNull();
  });

  it('AuthPort session shape is usable', async () => {
    const session: AuthSession = {
      sessionToken: 't',
      userId: 'u1',
      email: 'a@example.com',
      expiresAt: new Date(0).toISOString(),
    };
    const auth: AuthPort = {
      getSession: async (token) => (token === 't' ? session : null),
      requestMagicLink: async () => ({ sent: true }),
      consumeMagicLink: async () => session,
      signInWithGoogle: async (redirectTo) => ({ url: redirectTo }),
      signOut: async () => undefined,
    };
    expect(await auth.getSession('t')).toEqual(session);
    expect(await auth.getSession(null)).toBeNull();
  });
});
