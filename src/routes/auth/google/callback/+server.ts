import { google, redirectURL } from '$lib/auth.server';
import { OAuth2RequestError } from 'oslo/oauth2';
import type { RequestEvent } from './$types';
import { redirect } from '@sveltejs/kit';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { nanoid } from '$lib/nanoid.server';
import { parseJWT } from 'oslo/jwt';

export async function GET(event: RequestEvent) {
  const { lucia, db } = event.locals;

  const code = event.url.searchParams.get('code');
  const state = event.url.searchParams.get('state');

  const storedState = event.cookies.get('google_auth_state');
  const storedCodeVerifier = event.cookies.get('google_auth_code_verifier');

  if (!code || !storedState || !storedCodeVerifier || state !== storedState) {
    // 400
    throw new Error('Invalid request');
  }

  console.log('hereeee');

  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectURL,
    grant_type: 'authorization_code',
    code_verifier: storedCodeVerifier
  });

  const jwt = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: params.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
    .then((res) => res.json())
    .then(({ id_token }) => id_token as string);

  const { sub: google_uid } = parseJWT(jwt)!.payload as any;

  const existingUser = await db
    .selectFrom('Users')
    .where('google_id', '=', google_uid)
    .selectAll()
    .executeTakeFirst();

  let userID = existingUser?.id;

  if (existingUser) {
  } else {
    const uid = nanoid();

    await db
      .insertInto('Users')
      .values({
        id: uid,
        google_id: google_uid
      })
      .execute();

    userID = uid;
  }

  const session = await lucia.createSession(userID!, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  event.cookies.set(sessionCookie.name, sessionCookie.value, {
    path: '.',
    ...sessionCookie.attributes
  });

  return redirect(302, '/');
}
