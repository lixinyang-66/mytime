import { cookies } from 'next/headers';
import crypto from 'crypto';

const SPACE_COOKIE = 'mytime_space_session';
const ONE_MONTH = 60 * 60 * 24 * 30;

function getSecret(): string {
  return process.env.SESSION_SECRET || 'mytime-dev-secret';
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`${getSecret()}::${password}`).digest('hex');
}

function signSpace(spaceId: number): string {
  return crypto.createHmac('sha256', getSecret()).update(`mytime-space-${spaceId}`).digest('hex');
}

export function createSpaceToken(spaceId: number): string {
  return `${spaceId}.${signSpace(spaceId)}`;
}

export function getAuthedSpaceId(): number | null {
  const token = cookies().get(SPACE_COOKIE)?.value;
  if (!token) return null;

  const [rawSpaceId, signature] = token.split('.');
  const spaceId = Number(rawSpaceId);
  if (!Number.isInteger(spaceId) || spaceId <= 0) return null;
  if (signature !== signSpace(spaceId)) return null;

  return spaceId;
}

export function setSpaceAuthCookie(spaceId: number): void {
  cookies().set(SPACE_COOKIE, createSpaceToken(spaceId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_MONTH,
    path: '/',
  });
}

export function clearSpaceAuthCookie(): void {
  cookies().set(SPACE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
}

export function requireSpaceAuthResponse(): { spaceId: number } | Response {
  const spaceId = getAuthedSpaceId();
  if (!spaceId) {
    return Response.json({ error: '请先进入你的空间。' }, { status: 401 });
  }
  return { spaceId };
}
