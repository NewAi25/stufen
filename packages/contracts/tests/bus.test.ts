// Behaviour of the in process event bus (P0-11). Acceptance check from
// docs/07-build-sequence.md: two subscribers on one event both run; onAny sees
// every emit; unsubscribe stops delivery.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/index';
import type { EventMap } from '../src/index';

const signup: EventMap['user.signed_up'] = { userId: 'u1' };
const lesson: EventMap['lesson.completed'] = { userId: 'u1', lessonId: 'l1', score: 0.8 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createEventBus', () => {
  it('delivers one emit to two subscribers on the same event', async () => {
    const bus = createEventBus();
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    bus.on('user.signed_up', first);
    bus.on('user.signed_up', second);

    await bus.emit('user.signed_up', signup);

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(signup);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(signup);
  });

  it('does not deliver to subscribers of a different event', async () => {
    const bus = createEventBus();
    const other = vi.fn(async () => {});
    bus.on('lesson.completed', other);

    await bus.emit('user.signed_up', signup);

    expect(other).not.toHaveBeenCalled();
  });

  it('onAny receives every emit with the event name and payload', async () => {
    const bus = createEventBus();
    const any = vi.fn(async () => {});
    bus.onAny(any);

    await bus.emit('user.signed_up', signup);
    await bus.emit('lesson.completed', lesson);

    expect(any).toHaveBeenCalledTimes(2);
    expect(any).toHaveBeenNthCalledWith(1, 'user.signed_up', signup);
    expect(any).toHaveBeenNthCalledWith(2, 'lesson.completed', lesson);
  });

  it('unsubscribe stops delivery and calling it twice is safe', async () => {
    const bus = createEventBus();
    const named = vi.fn(async () => {});
    const any = vi.fn(async () => {});
    const offNamed = bus.on('user.signed_up', named);
    const offAny = bus.onAny(any);

    await bus.emit('user.signed_up', signup);
    offNamed();
    offNamed();
    offAny();
    offAny();
    await bus.emit('user.signed_up', signup);

    expect(named).toHaveBeenCalledTimes(1);
    expect(any).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount()).toBe(0);
  });

  it('a throwing handler does not stop the other handler and onError is called once', async () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    const bad = vi.fn(async () => {
      throw new Error('boom');
    });
    const good = vi.fn(async () => {});
    bus.on('user.signed_up', bad);
    bus.on('user.signed_up', good);

    await expect(bus.emit('user.signed_up', signup)).resolves.toBeUndefined();

    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      'user.signed_up',
      expect.any(Error),
      expect.stringContaining('user.signed_up'),
    );
  });

  it('a synchronous throw is reported the same way', async () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    bus.onAny(() => {
      throw new Error('sync boom');
    });

    await expect(bus.emit('user.signed_up', signup)).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('user.signed_up', expect.any(Error), 'onAny#1');
  });

  it('without onError the failure goes to console.error and emit still resolves', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus();
    bus.on('user.signed_up', async () => {
      throw new Error('boom');
    });

    await expect(bus.emit('user.signed_up', signup)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[0]).toContain('user.signed_up');
  });

  it('emit with no listeners resolves', async () => {
    const bus = createEventBus();
    await expect(bus.emit('user.signed_up', signup)).resolves.toBeUndefined();
  });

  it('waits for slow handlers before resolving', async () => {
    const bus = createEventBus();
    let finished = false;
    bus.on('user.signed_up', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
    });

    await bus.emit('user.signed_up', signup);

    expect(finished).toBe(true);
  });

  it('a handler subscribed during an emit is not called for that emit', async () => {
    const bus = createEventBus();
    const late = vi.fn(async () => {});
    bus.on('user.signed_up', async () => {
      bus.on('user.signed_up', late);
    });

    await bus.emit('user.signed_up', signup);
    expect(late).not.toHaveBeenCalled();

    await bus.emit('user.signed_up', signup);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('listenerCount reflects subscriptions', () => {
    const bus = createEventBus();
    expect(bus.listenerCount()).toBe(0);
    expect(bus.listenerCount('user.signed_up')).toBe(0);

    const off = bus.on('user.signed_up', async () => {});
    bus.on('user.signed_up', async () => {});
    bus.on('lesson.completed', async () => {});
    bus.onAny(async () => {});

    expect(bus.listenerCount('user.signed_up')).toBe(2);
    expect(bus.listenerCount('lesson.completed')).toBe(1);
    expect(bus.listenerCount()).toBe(4);

    off();
    expect(bus.listenerCount('user.signed_up')).toBe(1);
    expect(bus.listenerCount()).toBe(3);
  });
});
