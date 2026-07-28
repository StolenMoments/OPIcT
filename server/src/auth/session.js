import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'opict_session';
export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

function signature(secret, expiresAt) {
  return createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
}

export function createSessionToken(secret, now = Date.now()) {
  const expiresAt = now + SESSION_TTL_MS;
  return `${expiresAt}.${signature(secret, expiresAt)}`;
}

export function verifySessionToken(secret, token, now = Date.now()) {
  if (typeof secret !== 'string' || typeof token !== 'string') return false;
  const [expiresText, provided] = token.split('.');
  const expiresAt = Number(expiresText);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !provided || !/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = Buffer.from(signature(secret, expiresAt), 'hex');
  const actual = Buffer.from(provided, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
