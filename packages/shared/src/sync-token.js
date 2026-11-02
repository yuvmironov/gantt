import { createHmac, timingSafeEqual } from 'node:crypto';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signSyncToken({ userId, projectIds, secret, ttlSeconds = 300, now = Date.now() }) {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const payload = encode({
    sub: userId,
    projects: projectIds,
    exp: expiresAt,
  });
  return {
    token: `${payload}.${sign(payload, secret)}`,
    expiresAt,
  };
}

export function verifySyncToken(token, secret, now = Date.now()) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed?.sub || !Array.isArray(parsed.projects)) return null;
  if (Number(parsed.exp) <= Math.floor(now / 1000)) return null;
  return parsed;
}
