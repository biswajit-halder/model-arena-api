import { Hono } from 'hono';
import { countVotesForBattle, getBattle, insertBattle, insertUsage, listBattles } from '../db/queries';
import { newId } from '../lib/ids';
import { battleCacheKey } from '../lib/hash';
import { NotFoundError, UpstreamError } from '../lib/errors';
import { auth } from '../middleware/auth';
import { runBattle } from '../services/arena';
import { getCachedBattle, putCachedBattle } from '../services/cache';
import { getQuotaStatus, reserveBattleQuota } from '../services/quota';
import { consumeRateLimit } from '../services/rateLimit';
import { resolveModels } from '../services/models';
import { battleSchema, parseJsonOrThrow } from '../lib/validate';
import type { AppEnv, Battle } from '../types';

export const battles = new Hono<AppEnv>();

battles.post('/', auth, async (c) => {
  const input = await parseJsonOrThrow(c.req.raw, battleSchema);
  const models = await resolveModels(c.env, input.models);
  const cacheKey = await battleCacheKey(input.prompt, models, c.env.TEMPLATE_VERSION);

  // Cache hit: zero model calls, zero quota spend, zero rate-limit cost.
  const cached = await getCachedBattle(c.env, cacheKey);
  if (cached) {
    await insertUsage(c.env, {
      keyId: c.get('auth').keyId,
      battleId: cached.id,
      model: 'cache',
      cacheHit: true,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      status: 'cache_hit',
    });
    return c.json({ ...cached, cache: 'HIT', calls_spent: 0 }, 200);
  }

  await consumeRateLimit(c.env, c.get('auth').keyId, models.length);
  await reserveBattleQuota(c.env, models.length);

  const outcome = await runBattle(c.env, input.prompt, models);
  if (outcome.results.length === 0) {
    throw new UpstreamError('All models failed for this battle', outcome.failed);
  }

  const battle: Battle = {
    id: newId('bat'),
    api_key_id: c.get('auth').keyId,
    prompt: input.prompt,
    template: c.env.TEMPLATE_VERSION,
    model_set: models,
    results: outcome.results,
    failed: outcome.failed,
    cache: 'MISS',
    calls_spent: outcome.callsSpent,
    created_at: new Date().toISOString(),
  };

  await insertBattle(c.env, battle);
  await putCachedBattle(c.env, cacheKey, battle);
  for (const result of outcome.results) {
    await insertUsage(c.env, {
      keyId: battle.api_key_id,
      battleId: battle.id,
      model: result.model,
      cacheHit: false,
      tokensIn: result.tokens_in,
      tokensOut: result.tokens_out,
      latencyMs: result.latency_ms,
      status: 'ok',
    });
  }
  for (const failure of outcome.failed) {
    await insertUsage(c.env, {
      keyId: battle.api_key_id,
      battleId: battle.id,
      model: failure.model,
      cacheHit: false,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      status: failure.code,
    });
  }

  return c.json(battle, 201);
});

battles.get('/', auth, async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
  const items = await listBattles(c.env, c.get('auth').keyId, limit);
  return c.json({ items });
});

battles.get('/quota', auth, async (c) => {
  return c.json(await getQuotaStatus(c.env));
});

battles.get('/:id', auth, async (c) => {
  const battle = await getBattle(c.env, c.req.param('id'));
  if (!battle || battle.api_key_id !== c.get('auth').keyId) throw new NotFoundError('Battle not found');
  const votes = await countVotesForBattle(c.env, battle.id);
  return c.json({ ...battle, votes });
});
