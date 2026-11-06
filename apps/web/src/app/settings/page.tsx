import type { Metadata } from 'next';
import { LIMIT_KEYS } from '@stufen/contracts';
import { Card } from '../../components/kit';
import { SignInSoonCard } from '../../components/SignInSoonCard';
import { LIMIT_LABELS, PLAN_LABELS } from '../../lib/plan-labels';
import { getContainer } from '../../server/container';
import { getSession } from '../../server/session';
import { SettingsForm } from './SettingsForm';

// Reads the session on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings | Stufen' };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return <SignInSoonCard title="Settings" />;

  const { identity, entitlements } = getContainer();
  const profile = await identity.ensureProfile(session.userId);
  const entitlement = await entitlements.plan(session.userId);
  const limits = await Promise.all(
    LIMIT_KEYS.map(async (key) => ({
      key,
      left: await entitlements.remaining(session.userId, key),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="app-page-title">Settings</h1>
      <SettingsForm
        email={session.email}
        displayName={profile.displayName ?? ''}
        timezone={profile.timezone}
        dailyGoalMinutes={profile.dailyGoalMinutes}
      />
      <Card title="Your plan" headingLevel={2}>
        <p>
          {PLAN_LABELS[entitlement.plan]} <span className="app-muted">({entitlement.plan})</span>
        </p>
        <dl className="app-facts">
          {limits.map(({ key, left }) => (
            <div key={key} className="app-facts__row">
              <dt>{LIMIT_LABELS[key]}</dt>
              <dd>{left} left today</dd>
            </div>
          ))}
        </dl>
        <p className="app-muted">The plan cannot be changed during the beta.</p>
      </Card>
    </div>
  );
}
