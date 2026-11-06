import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { FeedbackKind } from '@stufen/contracts';
import { Button } from './Button';
import { Choice } from './Choice';
import { RatingInput } from './RatingInput';
import { Sheet } from './Sheet';
import type { SheetSide } from './Sheet';
import { TextArea } from './TextArea';
import { cx } from './cx';

/** What the form hands to `onSubmit`. `message` is trimmed. */
export interface FeedbackFabInput {
  kind: FeedbackKind;
  message: string;
  /** Present only when the tester picked a rating. */
  rating?: number;
}

/** Every visible string of the sheet, so the host can translate them. */
export interface FeedbackFabLabels {
  /** Sheet heading. Default "Feedback". */
  title: string;
  /** Name of the kind group. Default "What is it?". */
  kind: string;
  /** Label of the message field. Default "Tell us what happened". */
  message: string;
  /** Label of the rating field. Default "How is Stufen so far?". */
  rating: string;
  /** Submit button. Default "Send". */
  submit: string;
  /** Cancel button. Default "Cancel". */
  cancel: string;
  /** Accessible name of the sheet close button. Default "Close". */
  close: string;
  /** Error under an empty message. Default "Write a short message.". */
  messageRequired: string;
  /** Error under a missing rating. Default "Pick a rating.". */
  ratingRequired: string;
  /** Shown when `onSubmit` rejects without a message. Default "Could not send. Try again.". */
  submitFailed: string;
}

export interface FeedbackFabProps {
  /** Receives the checked form values. The sheet closes when the promise resolves. */
  onSubmit: (input: FeedbackFabInput) => Promise<void>;
  /** Called after a successful submit, once the sheet has closed. */
  onSubmitted?: () => void;
  /** Accessible name of the floating button. Default "Give feedback". */
  label?: string;
  /** Words for the five kinds. Defaults: Bug, Idea, Confusing, Rating, Other. */
  kindLabels?: Partial<Record<FeedbackKind, string>>;
  /** Overrides for the visible strings. */
  labels?: Partial<FeedbackFabLabels>;
  /** Kind selected when the sheet opens. Default `idea`. */
  defaultKind?: FeedbackKind;
  /** Edge the sheet sits on. Default `bottom`. */
  side?: SheetSide;
  /** Renders nothing at all, neither the button nor the sheet. */
  hidden?: boolean;
  /** Class for the floating button. */
  className?: string;
}

const FEEDBACK_KINDS: readonly FeedbackKind[] = ['bug', 'idea', 'confusing', 'rating', 'other'];

const FEEDBACK_MESSAGE_MAX = 4000;
const FEEDBACK_RATING_MAX = 5;

const DEFAULT_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Bug',
  idea: 'Idea',
  confusing: 'Confusing',
  rating: 'Rating',
  other: 'Other',
};

const DEFAULT_LABELS: FeedbackFabLabels = {
  title: 'Feedback',
  kind: 'What is it?',
  message: 'Tell us what happened',
  rating: 'How is Stufen so far?',
  submit: 'Send',
  cancel: 'Cancel',
  close: 'Close',
  messageRequired: 'Write a short message.',
  ratingRequired: 'Pick a rating.',
  submitFailed: 'Could not send. Try again.',
};

function failureText(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.trim() !== '') return reason.message;
  if (typeof reason === 'string' && reason.trim() !== '') return reason;
  return fallback;
}

export function FeedbackFab({
  onSubmit,
  onSubmitted,
  label = 'Give feedback',
  kindLabels,
  labels,
  defaultKind = 'idea',
  side = 'bottom',
  hidden = false,
  className,
}: FeedbackFabProps) {
  const formId = useId();
  const words = { ...DEFAULT_LABELS, ...labels };
  const kindWords = { ...DEFAULT_KIND_LABELS, ...kindLabels };

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>(defaultKind);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [messageError, setMessageError] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [pending, setPending] = useState(false);

  // The ref blocks a second submit that arrives before the pending state renders.
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const formRef = useRef<HTMLFormElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const firstFieldRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Focus goes to the selected kind when the sheet opens, not to the close button.
  const setKindGroup = useCallback((node: HTMLDivElement | null) => {
    firstFieldRef.current =
      node?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') ?? null;
  }, []);

  function clearErrors(): void {
    setMessageError('');
    setRatingError('');
    setSubmitError('');
  }

  function close(): void {
    setOpen(false);
    clearErrors();
  }

  function reset(): void {
    setKind(defaultKind);
    setMessage('');
    setRating(null);
    clearErrors();
  }

  function onKindChange(value: string): void {
    const next = FEEDBACK_KINDS.find((candidate) => candidate === value);
    if (next === undefined) return;
    setKind(next);
    clearErrors();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pendingRef.current) return;

    const trimmed = message.trim();
    const needsMessage = kind !== 'rating' && trimmed === '';
    const needsRating = kind === 'rating' && rating === null;
    setMessageError(needsMessage ? words.messageRequired : '');
    setRatingError(needsRating ? words.ratingRequired : '');
    setSubmitError('');
    if (needsMessage) {
      messageRef.current?.focus();
      return;
    }
    if (needsRating) {
      formRef.current
        ?.querySelector<HTMLElement>('.st-rating [role="radio"][tabindex="0"]')
        ?.focus();
      return;
    }

    const input: FeedbackFabInput =
      rating === null ? { kind, message: trimmed } : { kind, message: trimmed, rating };
    pendingRef.current = true;
    setPending(true);
    // Promise.resolve().then also catches an onSubmit that throws before returning.
    Promise.resolve()
      .then(() => onSubmit(input))
      .then(
        () => {
          pendingRef.current = false;
          if (!mountedRef.current) return;
          setPending(false);
          setOpen(false);
          reset();
          onSubmitted?.();
        },
        (reason: unknown) => {
          pendingRef.current = false;
          if (!mountedRef.current) return;
          setPending(false);
          setSubmitError(failureText(reason, words.submitFailed));
        },
      );
  }

  if (hidden) return null;

  const submitErrorId = `${formId}-error`;
  const hasSubmitError = submitError !== '';

  return (
    <>
      <button
        type="button"
        className={cx('st-feedback-fab', className)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg
          className="st-feedback-fab__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M21 12a8 8 0 0 1-8 8H4l2.3-3.1A8 8 0 1 1 21 12z" />
        </svg>
      </button>
      <Sheet
        open={open}
        onClose={close}
        title={words.title}
        closeLabel={words.close}
        side={side}
        initialFocusRef={firstFieldRef}
      >
        <form
          ref={formRef}
          className="st-feedback"
          noValidate
          aria-describedby={hasSubmitError ? submitErrorId : undefined}
          onSubmit={handleSubmit}
        >
          <div className="st-feedback__field">
            <p className="st-feedback__legend" aria-hidden="true">
              {words.kind}
            </p>
            <Choice
              ref={setKindGroup}
              label={words.kind}
              orientation="horizontal"
              value={kind}
              onChange={onKindChange}
              options={FEEDBACK_KINDS.map((value) => ({ value, label: kindWords[value] }))}
            />
          </div>
          <TextArea
            ref={messageRef}
            label={words.message}
            value={message}
            maxLength={FEEDBACK_MESSAGE_MAX}
            required={kind !== 'rating'}
            error={messageError}
            onChange={(event) => {
              setMessage(event.target.value);
              setMessageError('');
            }}
          />
          <RatingInput
            label={words.rating}
            max={FEEDBACK_RATING_MAX}
            value={rating}
            allowClear
            required={kind === 'rating'}
            error={ratingError}
            onChange={(next) => {
              setRating(next);
              setRatingError('');
            }}
          />
          {hasSubmitError ? (
            <p className="st-feedback__error" id={submitErrorId} role="alert">
              {submitError}
            </p>
          ) : null}
          <div className="st-feedback__actions">
            <Button variant="ghost" onClick={close}>
              {words.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {words.submit}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
