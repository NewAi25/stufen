// The rules of the `f` shortcut that opens feedback (docs/06-ui-ux.md
// section 8). Plain functions, so the tests can call them without a browser.

/** Routes whose screens use letter keys themselves. The shortcut is off there. */
const SHORTCUT_OFF = ['/lesson', '/review'] as const;

/** True on screens where an exercise is on: lesson and review. */
export function isExerciseRoute(pathname: string): boolean {
  return SHORTCUT_OFF.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function feedbackShortcutEnabled(pathname: string): boolean {
  return !isExerciseRoute(pathname);
}

/** What the shortcut needs to know about a key press. A KeyboardEvent fits. */
export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

/** What it needs to know about the element that has the focus. An HTMLElement fits. */
export interface ShortcutTarget {
  tagName: string;
  isContentEditable?: boolean;
}

const TEXT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/** True while the learner is typing: a text field, a select or editable text. */
export function isTypingTarget(target: ShortcutTarget | null): boolean {
  if (target === null) return false;
  return target.isContentEditable === true || TEXT_TAGS.includes(target.tagName.toUpperCase());
}

/** True for a plain `f`: no Ctrl, Alt or Meta, not held down, not handled already. */
export function isFeedbackKey(event: ShortcutKey): boolean {
  if (event.key !== 'f') return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  return event.repeat !== true && event.defaultPrevented !== true;
}
