import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getContainer } from '../../../server/container';
import {
  isSameOriginPost,
  SESSION_COOKIE,
  SIGN_IN_PATH,
  signOutSession,
} from '../../../server/sign-in';

// Sign out. POST only, so a link or an image tag cannot trigger it, and only
// from a page of this site, so another site cannot sign a learner out.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { auth, config } = getContainer();
  if (!isSameOriginPost(request.headers, config.appUrl)) {
    return new NextResponse('Sign out must be sent from this site.', { status: 403 });
  }

  await signOutSession({ auth }, request.cookies.get(SESSION_COOKIE)?.value);

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: SIGN_IN_PATH, 'Cache-Control': 'no-store' },
  });
  // Same flags as when it was set, with no value and no lifetime.
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.appUrlIsHttps,
    maxAge: 0,
  });
  return response;
}
