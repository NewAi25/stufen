import { APP_VERSION } from '../../../version';

// Liveness check for the host and for the smoke test. Touches no box.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, version: APP_VERSION });
}
