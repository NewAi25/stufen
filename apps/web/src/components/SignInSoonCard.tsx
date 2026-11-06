import { Card } from './kit';

/** Shown on signed in pages while nobody is signed in. Sign in ships in Phase 1. */
export function SignInSoonCard({ title }: { title: string }) {
  return (
    <Card title={title} headingLevel={1}>
      <p>Sign in arrives in the next phase. This page will work once you can sign in.</p>
    </Card>
  );
}
