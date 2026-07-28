import { createLoginThrottle } from '../auth/throttle.js';
import { createSessionToken, clearSessionCookie, requestIsAuthenticated, setSessionCookie } from '../auth/auth-plugin.js';
import { verifyPassword } from '../auth/password.js';

export async function authRoutes(app, { auth }) {
  const throttle = createLoginThrottle();

  app.get('/api/auth/session', async (request) => ({
    authenticated: requestIsAuthenticated(request, auth),
  }));

  app.post('/api/auth/login', async (request, reply) => {
    if (!auth) return { ok: true };
    const client = request.ip;
    const lockout = throttle.check(client);
    if (lockout.locked) {
      reply.header('retry-after', String(Math.ceil(lockout.retryAfterMs / 1000)));
      return reply.code(429).send({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요' });
    }

    const password = request.body?.password;
    if (verifyPassword(password, auth.passwordHash)) {
      throttle.recordSuccess(client);
      setSessionCookie(reply, createSessionToken(auth.sessionSecret));
      return { ok: true };
    }

    throttle.recordFailure(client);
    return reply.code(401).send({ error: '비밀번호가 올바르지 않습니다' });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
