import { Hono } from 'hono';
import { getUsageAggregate, getUsageEvents } from '../db/queries';
import { auth } from '../middleware/auth';
import { getQuotaStatus } from '../services/quota';
import type { AppEnv } from '../types';

export const usage = new Hono<AppEnv>();

usage.get('/', auth, async (c) => {
  const hours = Math.min(720, Math.max(1, Number(c.req.query('hours') ?? 24)));
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const [aggregate, quota] = await Promise.all([
    getUsageAggregate(c.env, c.get('auth').keyId, since),
    getQuotaStatus(c.env),
  ]);
  return c.json({ hours, aggregate, global_quota: quota });
});

usage.get('/events', auth, async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
  return c.json({ items: await getUsageEvents(c.env, c.get('auth').keyId, limit) });
});
