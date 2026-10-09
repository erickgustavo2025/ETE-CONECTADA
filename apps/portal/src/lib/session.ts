import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { findSessionRecord } from '@/lib/session-record';
import type { SessionRecord } from '@/lib/session-record';

export const sessionCookieName = 'ete_portal_session';
export const sessionDurationSeconds = 60 * 60 * 24 * 7;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function currentSession(): Promise<SessionRecord | null> {
  if (process.env.NODE_ENV !== 'development') return null;
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  return findSessionRecord(getDb(), hashSessionToken(token));
}
