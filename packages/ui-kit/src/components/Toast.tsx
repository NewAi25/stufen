import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  /** Default `info`. `error` is announced assertively. */
  tone?: ToastTone;
  /** Time before the toast leaves. Zero or less keeps it until dismissed. */
  durationMs?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show(options: ToastOptions): string;
  /** Removes a toast early. Unknown ids are ignored. */
  dismiss(id: string): void;
}

/** The clock used for auto dismiss. Tests pass a fake one. */
export interface ToastTimer {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface ToastProviderProps {
  children?: ReactNode;
  /** Default uses `setTimeout` and `clearTimeout`. */
  timer?: ToastTimer;
  /** Used when `show` gets no `durationMs`. Default 5000. */
  defaultDurationMs?: number;
  /** Accessible name of the dismiss button. Default "Dismiss". */
  dismissLabel?: string;
  /** Extra class for the fixed container that holds both live regions. */
  className?: string;
}

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

const systemTimer: ToastTimer = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const TONE_ICON: Record<ToastTone, string> = { info: 'i', success: '✓', error: '!' };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({
  children,
  timer = systemTimer,
  defaultDurationMs = 5000,
  dismissLabel = 'Dismiss',
  className,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const handles = useRef(new Map<string, unknown>());
  const nextId = useRef(0);

  const dismiss = useCallback(
    (id: string) => {
      const pending = handles.current;
      if (pending.has(id)) {
        timer.clear(pending.get(id));
        pending.delete(id);
      }
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [timer],
  );

  const show = useCallback(
    ({ message, tone = 'info', durationMs = defaultDurationMs }: ToastOptions) => {
      nextId.current += 1;
      const id = `st-toast-${nextId.current}`;
      setToasts((current) => [...current, { id, message, tone }]);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        handles.current.set(
          id,
          timer.set(() => dismiss(id), durationMs),
        );
      }
      return id;
    },
    [timer, defaultDurationMs, dismiss],
  );

  // Stop every running timer when the provider goes away.
  useEffect(() => {
    const pending = handles.current;
    return () => {
      for (const handle of pending.values()) timer.clear(handle);
      pending.clear();
    };
  }, [timer]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  function renderToast(toast: ToastItem) {
    return (
      <div key={toast.id} className={cx('st-toast', `st-toast--${toast.tone}`)}>
        <span className="st-toast__icon" aria-hidden="true">
          {TONE_ICON[toast.tone]}
        </span>
        <p className="st-toast__message">{toast.message}</p>
        <button
          type="button"
          className="st-toast__dismiss"
          aria-label={dismissLabel}
          onClick={() => dismiss(toast.id)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    );
  }

  // Both regions are always in the page so screen readers announce what is
  // added to them. Errors go to the assertive one.
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={cx('st-toast-viewport', className)}>
        <div className="st-toast-region" role="status" aria-live="polite" aria-atomic="false">
          {toasts.filter((toast) => toast.tone !== 'error').map(renderToast)}
        </div>
        <div className="st-toast-region" role="alert" aria-live="assertive" aria-atomic="false">
          {toasts.filter((toast) => toast.tone === 'error').map(renderToast)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return api;
}
