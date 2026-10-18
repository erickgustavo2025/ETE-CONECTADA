import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { findSessionRecord } from '@/lib/session-record';
import type { SessionRecord } from '@/lib/session-record';

import { sessionCookiePolicy } from './session-cookie';
export { sessionDurationSeconds } from './session-cookie';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function currentSession(): Promise<SessionRecord | null> {
  if (process.env.NODE_ENV !== 'development') return null;
  const token = (await cookies()).get(sessionCookiePolicy().name)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  return findSessionRecord(getDb(), hashSessionToken(token));
}
