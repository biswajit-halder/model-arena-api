import type { MiddlewareHandler } from 'hono';
import { findApiKeyByHash, touchApiKey } from '../db/queries';
import { UnauthorizedError } from '../lib/errors';
import { sha256 } from '../lib/hash';
import type { AppEnv } from '../types';

export const auth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header('authorization') ?? '';
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const raw = bearer || c.req.header('x-api-key')?.trim() || '';
  if (!raw) throw new UnauthorizedError('Missing API key. Use Authorization: Bearer <key>.');

  const row = await findApiKeyByHash(c.env, await sha256(raw));
  if (!row || row.revoked) throw new UnauthorizedError('Invalid or revoked API key');

  c.set('auth', {
    keyId: row.id,
    label: row.label,
    perMinuteLimit: row.per_minute_limit,
    dailyLimit: row.daily_limit,
  });
  await touchApiKey(c.env, row.id);
  await next();
};
