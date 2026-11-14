import { describe, expect, it } from 'vitest';
import { BAR_ITEMS, MORE_ITEMS, RAIL_ITEMS } from '../src/components/nav';
import {
  feedbackShortcutEnabled,
  isExerciseRoute,
  isFeedbackKey,
  isTypingTarget,
} from '../src/lib/feedback-shortcut';

const plain = { ctrlKey: false, altKey: false, metaKey: false };

describe('the f shortcut for feedback', () => {
  it('is a plain f and nothing else', () => {
    expect(isFeedbackKey({ key: 'f', ...plain })).toBe(true);
    expect(isFeedbackKey({ key: 'F', ...plain })).toBe(false);
    expect(isFeedbackKey({ key: 'g', ...plain })).toBe(false);
    expect(isFeedbackKey({ key: 'f', ...plain, ctrlKey: true })).toBe(false);
    expect(isFeedbackKey({ key: 'f', ...plain, altKey: true })).toBe(false);
    expect(isFeedbackKey({ key: 'f', ...plain, metaKey: true })).toBe(false);
    expect(isFeedbackKey({ key: 'f', ...plain, repeat: true })).toBe(false);
    expect(isFeedbackKey({ key: 'f', ...plain, defaultPrevented: true })).toBe(false);
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT', 'input', 'textarea'])(
    'does not fire while focus is in a %s',
    (tagName) => {
      expect(isTypingTarget({ tagName })).toBe(true);
    },
  );

  it('does not fire in editable text, and fires elsewhere', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it.each(['/lesson/abc', '/lesson', '/review', '/review/'])('is off on %s', (pathname) => {
    expect(isExerciseRoute(pathname)).toBe(true);
    expect(feedbackShortcutEnabled(pathname)).toBe(false);
  });

  it.each(['/', '/progress', '/settings', '/feedback', '/onboarding', '/lessons', '/reviewer'])(
    'is on on %s',
    (pathname) => {
      expect(feedbackShortcutEnabled(pathname)).toBe(true);
    },
  );
});

describe('navigation', () => {
  const all = [...RAIL_ITEMS, ...BAR_ITEMS, ...MORE_ITEMS];

  it.each(['Home', 'Review', 'Progress', 'Settings'])('%s links to its own page', (label) => {
    const items = all.filter((item) => item.label === label);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.href).toBe(item.route);
  });

  it.each(['Tutor', 'Write'])('%s stays on the coming soon page', (label) => {
    const items = all.filter((item) => item.label === label);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.href).toBe('/coming-soon');
  });
});
