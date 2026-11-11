import { describe, expect, it } from 'vitest';
import { createContainer, getContainer } from '../src/server/container';
import { memoryConfig } from './helpers/config';

// A fresh container per test, so tests do not share stores.
function freshContainer() {
  return createContainer(memoryConfig());
}

describe('getContainer', () => {
  it('returns the same instance twice', () => {
    const first = getContainer();
    const second = getContainer();
    expect(second).toBe(first);
    expect(second.bus).toBe(first.bus);
    expect(second.auth).toBe(first.auth);
  });

  it('keeps the instance on globalThis so a module reload reuses it', () => {
    const key = Symbol.for('stufen.web.container');
    expect((globalThis as Record<symbol, unknown>)[key]).toBe(getContainer());
  });
});

describe('composition root wiring', () => {
  it('creates a profile and a free_beta entitlement on user.signed_up', async () => {
    const container = freshContainer();
    await container.bus.emit('user.signed_up', { userId: 'user-1' });

    const profile = await container.identity.getProfile('user-1');
    expect(profile.id).toBe('user-1');

    const stored = await container.stores.entitlements.getEntitlement('user-1');
    expect(stored?.plan).toBe('free_beta');
  });

  it('records the event in the analytics store, once', async () => {
    const container = freshContainer();
    await container.bus.emit('user.signed_up', { userId: 'user-2' });

    const rows = await container.stores.events.list({ name: 'user.signed_up' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('user-2');
  });

  it('runs the same reaction when core-auth creates a user', async () => {
    const container = freshContainer();
    const session = await container.auth.createDevSession('dev@stufen.local');

    const profile = await container.identity.getProfile(session.userId);
    expect(profile.id).toBe(session.userId);
    const stored = await container.stores.entitlements.getEntitlement(session.userId);
    expect(stored?.plan).toBe('free_beta');
    expect(await container.stores.events.count('user.signed_up')).toBe(1);
  });
});
