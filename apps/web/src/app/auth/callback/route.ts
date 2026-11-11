import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../server/container';
import { completeSignIn, SESSION_COOKIE, sessionCookieOptions } from '../../../server/sign-in';

// The address a magic link points at. It trades the one time token for a
// session cookie and moves on at once, so the token does not stay in the
// address bar. Nothing here writes the token or the URL to a log.
export const dynamic = 'force-dynamic';

/** A redirect to a path on this site. The Location is relative on purpose. */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
      'Cache-Control': 'no-store',
      // The next page must not learn the link from the Referer header.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * Mail scanners often probe a link with HEAD before the reader clicks it.
 * Without this handler Next would answer HEAD by running GET, and the probe
 * would use the token up. HEAD changes nothing.
 */
export function HEAD(): NextResponse {
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { auth, config } = getContainer();
  const params = request.nextUrl.searchParams;
  const result = await completeSignIn(
    { auth },
    { token: params.get('token'), next: params.get('next') },
  );

  const response = seeOther(result.redirectTo);
  if (result.ok) {
    response.cookies.set(
      SESSION_COOKIE,
      result.session.sessionToken,
      sessionCookieOptions(result.session, { secure: config.appUrlIsHttps }),
    );
  }
  return response;
}
