import { SESSION_COOKIE, createSessionToken, verifySessionToken } from './session.js';

const PUBLIC_API_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/session']);

export function resolveAuthConfig(config) {
  if (config === false) return null;
  const source = config ?? {
    passwordHash: process.env.OPICT_APP_PASSWORD_HASH,
    sessionSecret: process.env.OPICT_SESSION_SECRET,
  };
  if (!source.passwordHash || !source.sessionSecret) {
    throw new Error('OPICT_APP_PASSWORD_HASH and OPICT_SESSION_SECRET are required in production');
  }
  return source;
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const index = part.indexOf('=');
      if (index < 0) return [];
      const name = part.slice(0, index).trim();
      try {
        return [[name, decodeURIComponent(part.slice(index + 1).trim())]];
      } catch {
        return [];
      }
    }),
  );
}

export function requestIsAuthenticated(request, auth) {
  if (!auth) return true;
  const token = parseCookies(request.headers.cookie).opict_session;
  return verifySessionToken(auth.sessionSecret, token);
}

export function setSessionCookie(reply, token) {
  reply.header('set-cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

export function clearSessionCookie(reply) {
  reply.header('set-cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

export function registerAuthHook(app, auth) {
  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0];
    if (!auth || !pathname.startsWith('/api/') || PUBLIC_API_PATHS.has(pathname)) return;
    if (requestIsAuthenticated(request, auth)) return;
    return reply.code(401).send({ error: '로그인이 필요합니다' });
  });
}

export { createSessionToken };
