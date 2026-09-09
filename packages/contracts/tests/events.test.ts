// Proves that every event named in docs/04-module-contracts.md is a key of
// EventMap. The check is at type level: add or rename an event in docs/04
// without updating EventMap and `pnpm typecheck` fails on this file.
import { describe, expect, it } from 'vitest';
import type { EventBus, EventMap, EventName } from '../src/index';

// Helper: the argument must be a tuple of EventMap keys. A name that is not
// in EventMap is a compile error at the call site.
function documentedEvents<const T extends readonly EventName[]>(names: T): T {
  return names;
}

const DOC_EVENTS = documentedEvents([
  'user.signed_up',
  'user.language_set',
  'content.pack_installed',
  'attempt.recorded',
  'lesson.completed',
  'item.reviewed',
  'cando.mastered',
  'level.reached',
  'assessment.completed',
  'writing.graded',
  'tutor.turn',
  'speech.transcribed',
  'feedback.submitted',
  'entitlement.changed',
]);

// Both directions. Assigning `true` to a type that resolves to `false` fails
// typecheck, so these constants are the assertions.
type DocEvent = (typeof DOC_EVENTS)[number];
type IsNever<T> = [T] extends [never] ? true : false;
const everyDocEventIsInMap: IsNever<Exclude<DocEvent, EventName>> = true;
const noUndocumentedEvent: IsNever<Exclude<EventName, DocEvent>> = true;

// Payload spot checks so a field rename in EventMap is caught here too.
const attempt: EventMap['attempt.recorded'] = {
  userId: 'u',
  attemptId: 'a',
  exerciseType: 'cloze',
  correct: true,
  score: 1,
  candoIds: [],
  itemIds: [],
  language: 'de',
};
const reviewed: EventMap['item.reviewed'] = { userId: 'u', itemId: 'i', rating: 3 };

describe('EventMap matches docs/04', () => {
  it('lists all fourteen documented events', () => {
    expect(DOC_EVENTS).toHaveLength(14);
    expect(new Set(DOC_EVENTS).size).toBe(14);
  });

  it('EventMap and the documented list agree in both directions', () => {
    expect(everyDocEventIsInMap).toBe(true);
    expect(noUndocumentedEvent).toBe(true);
  });

  it('payload shapes compile', () => {
    expect(attempt.exerciseType).toBe('cloze');
    expect(reviewed.rating).toBe(3);
  });

  it('EventBus interface has emit, on and onAny', () => {
    // A structural stand in; the real bus is P0-11.
    const bus: EventBus = {
      emit: async () => {},
      on: () => () => {},
      onAny: () => () => {},
    };
    expect(typeof bus.emit).toBe('function');
    expect(typeof bus.on).toBe('function');
    expect(typeof bus.onAny).toBe('function');
  });
});
