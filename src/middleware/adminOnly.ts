import type { MiddlewareHandler } from 'hono';
import { UnauthorizedError } from '../lib/errors';
import type { AppEnv } from '../types';

export const adminOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.header('x-admin-token');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    throw new UnauthorizedError('Invalid admin token');
  }
  await next();
};
