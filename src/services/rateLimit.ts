import {
  createRateCounter,
  getRateCounter,
  incrementRateCounter,
  resetRateCounter,
} from '../db/queries';
import { RateLimitedError } from '../lib/errors';
import type { Env } from '../types';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Per-key sliding windows, charged one unit per model call. */
export async function consumeRateLimit(env: Env, keyId: string, cost: number): Promise<void> {
  const perMinute = Number(env.PER_MINUTE_LIMIT);
  const perDay = Number(env.KEY_DAILY_LIMIT);
  const now = Date.now();
  const minuteStart = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const args = { keyId, minuteStart, dayStart, cost, perMinute, perDay };

  const row = await getRateCounter(env, keyId);
  if (!row) {
    await createRateCounter(env, keyId, minuteStart, dayStart, cost);
    return;
  }
  if (row.minute_start !== minuteStart || row.day_start !== dayStart) {
    await resetRateCounter(env, keyId, minuteStart, dayStart, cost);
    return;
  }
  const result = await incrementRateCounter(env, args);
  if (!result) {
    const retryAfter = Math.max(1, Math.ceil((minuteStart + MINUTE_MS - now) / 1000));
    throw new RateLimitedError('Rate limit exceeded for this API key', retryAfter);
  }
}
