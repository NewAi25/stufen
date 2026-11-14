'use client';

import { useEffect, useRef } from 'react';

/**
 * Controls that use Enter themselves. The key is left to them. A radio option
 * of a kit Choice is a button too, but it is chosen with the arrow and number
 * keys, so Enter on it belongs to the screen.
 */
const OWN_ENTER = 'button:not([role="radio"]), a[href], summary, select, [role="button"]';
const MULTILINE = 'textarea, [contenteditable]:not([contenteditable="false"])';

/**
 * Calls `onEnter` when Enter is pressed anywhere on the page, which is how the
 * lesson screen checks and continues. Enter on a button or a link keeps its
 * own meaning. In a multiline field Enter is a new line, and Ctrl plus Enter
 * (or Cmd plus Enter) triggers the action. An open dialog keeps its keys.
 */
export function useEnterKey(onEnter: () => void, enabled: boolean): void {
  const handler = useRef(onEnter);
  useEffect(() => {
    handler.current = onEnter;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat) return;
      if (event.altKey || event.shiftKey || event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"]')) return;
      const withModifier = event.ctrlKey || event.metaKey;
      if (target?.closest(MULTILINE)) {
        if (!withModifier) return;
      } else if (withModifier || target?.closest(OWN_ENTER)) {
        return;
      }
      event.preventDefault();
      handler.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
