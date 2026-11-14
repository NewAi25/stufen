import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@stufen/ui-kit';

export const metadata: Metadata = { title: 'Coming soon | Stufen' };

export default function ComingSoonPage() {
  return (
    <Card title="Coming soon" headingLevel={1}>
      <p>This part of Stufen is not built yet. It will appear here when it is ready.</p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </Card>
  );
}
