import Link from 'next/link';
import { Card } from '@stufen/ui-kit';

export default function NotFound() {
  return (
    <Card title="Page not found" headingLevel={1}>
      <p>There is nothing at this address.</p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </Card>
  );
}
