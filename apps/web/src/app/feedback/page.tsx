import type { Metadata } from 'next';
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from '@stufen/contracts';
import { Card } from '../../components/kit';
import { listMyFeedback } from '../../server/actions/feedback-actions';
import { getContainer } from '../../server/container';
import { requireSession } from '../../server/session';

export const metadata: Metadata = { title: 'Feedback | Stufen' };

// Reads the session on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Bug',
  idea: 'Idea',
  confusing: 'Confusing',
  rating: 'Rating',
  other: 'Other',
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  seen: 'Seen',
  planned: 'Planned',
  done: 'Done',
  wontfix: 'Not planned',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

function FeedbackRow({ item }: { item: FeedbackItem }) {
  return (
    <li className="app-feedback-item">
      <p className="app-feedback-item__meta">
        <span className="app-feedback-item__kind">{KIND_LABELS[item.kind]}</span>
        <time dateTime={item.createdAt}>{DATE_FORMAT.format(new Date(item.createdAt))}</time>
        <span>Status: {STATUS_LABELS[item.status]}</span>
        {item.rating === null ? null : <span>Rating: {item.rating} of 5</span>}
      </p>
      {item.message === '' ? null : <p className="app-feedback-item__message">{item.message}</p>}
    </li>
  );
}

export default async function FeedbackPage() {
  // The list is personal, so this page needs a session. The feedback button
  // on every page keeps working signed out.
  const session = await requireSession('/feedback');
  const items = await listMyFeedback(getContainer(), session.userId);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Feedback" headingLevel={1}>
        <p>
          Tell us what is broken, confusing or missing. Use the round feedback button at the bottom
          right of any page. It takes less than half a minute.
        </p>
      </Card>

      <Card title="What you have sent" headingLevel={2}>
        {items.length === 0 ? (
          <p>You have not sent feedback yet.</p>
        ) : (
          <ul className="app-feedback-list">
            {items.map((item) => (
              <FeedbackRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
