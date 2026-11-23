import {
  createQuotaDay,
  getQuotaDay,
  reserveQuota as reserveQuotaInDb,
} from '../db/queries';
import { QuotaExhaustedError } from '../lib/errors';
import { utcDay } from '../lib/hash';
import type { Env } from '../types';

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  return Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));
}

/**
 * Reserve the whole fan-out cost atomically before any network call. Cached
 * and seeded battles never reach this function, so they spend zero quota.
 */
export async function reserveBattleQuota(
  env: Env,
  cost: number,
): Promise<{ used: number; limit: number }> {
  const day = utcDay();
  const limit = Number(env.DAILY_REQUEST_LIMIT);
  let used = await reserveQuotaInDb(env, { day, cost, limit });

  if (used === null) {
    const existing = await getQuotaDay(env, day);
    if (!existing) {
      await createQuotaDay(env, day, limit, 0);
      used = await reserveQuotaInDb(env, { day, cost, limit });
    }
  }
  if (used === null) throw new QuotaExhaustedError(secondsUntilUtcMidnight());
  return { used, limit };
}

export async function getQuotaStatus(env: Env) {
  const row = await getQuotaDay(env, utcDay());
  const limit = row?.daily_limit ?? Number(env.DAILY_REQUEST_LIMIT);
  const used = row?.calls_used ?? 0;
  return { day: utcDay(), used, limit, remaining: Math.max(0, limit - used) };
}
