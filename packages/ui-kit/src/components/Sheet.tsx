import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

export type SheetSide = 'bottom' | 'right';

export interface SheetProps {
  /** Whether the sheet is shown. Nothing renders while this is false. */
  open: boolean;
  /** Called on Escape, on a backdrop click and on the close button. */
  onClose: () => void;
  /** The dialog heading. Names the dialog through `aria-labelledby`. Required. */
  title: string;
  /** Optional line under the heading, linked with `aria-describedby`. */
  description?: string;
  /** Edge the panel sits on. Default `bottom`. */
  side?: SheetSide;
  children?: ReactNode;
  /** Accessible name of the close button. Default "Close". */
  closeLabel?: string;
  /** Element that takes focus on open. Default: the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  /** Class for the panel, the element with `role="dialog"`. */
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable]:not([contenteditable="false"])';

/** The elements Tab can reach inside `root`, in document order. */
function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      element.closest('[hidden]') === null,
  );
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = 'bottom',
  children,
  closeLabel = 'Close',
  initialFocusRef,
  className,
}: SheetProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initialFocus = useRef(initialFocusRef);
  const hasDescription = description !== undefined && description !== '';

  useEffect(() => {
    initialFocus.current = initialFocusRef;
  });

  // Opening: remember where focus was, lock page scroll, move focus inside.
  // Closing or unmounting: undo both.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // The panel is portalled to the body, so it copies the theme and motion
    // setting from where the sheet was rendered.
    const root = rootRef.current;
    const anchor = anchorRef.current;
    if (root !== null && anchor !== null) {
      for (const name of ['data-theme', 'data-motion']) {
        const value = anchor.closest(`[${name}]`)?.getAttribute(name);
        if (typeof value === 'string') root.setAttribute(name, value);
      }
    }

    const panel = panelRef.current;
    if (panel !== null) {
      const target = initialFocus.current?.current ?? focusableIn(panel)[0] ?? panel;
      target.focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previous !== null && previous.isConnected) previous.focus();
    };
  }, [open]);

  // Escape and the Tab trap. Subscribed again on each render so the handler
  // always calls the current onClose.
  useEffect(() => {
    if (!open) return undefined;
    function onDocumentKeyDown(event: KeyboardEvent): void {
      const panel = panelRef.current;
      if (panel === null) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableIn(panel);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      const inside = active !== null && panel.contains(active);
      if (event.shiftKey && (!inside || active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  });

  if (!open) return null;

  return (
    <>
      <span ref={anchorRef} hidden />
      {createPortal(
        <div ref={rootRef} className={cx('st-sheet', `st-sheet--${side}`)}>
          <div className="st-sheet__backdrop" onClick={onClose} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={hasDescription ? descriptionId : undefined}
            tabIndex={-1}
            className={cx('st-sheet__panel', className)}
          >
            <div className="st-sheet__header">
              <h2 className="st-sheet__title" id={titleId}>
                {title}
              </h2>
              <button
                type="button"
                className="st-sheet__close"
                aria-label={closeLabel}
                onClick={onClose}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {hasDescription ? (
              <p className="st-sheet__description" id={descriptionId}>
                {description}
              </p>
            ) : null}
            <div className="st-sheet__body">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
