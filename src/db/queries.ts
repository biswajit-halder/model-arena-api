import type { Env, ApiKeyRow, Battle, ModelResult, FailedResult } from '../types';
import { battleCacheKey } from '../lib/hash';

/**
 * Every statement starts with a `-- q:<name>` tag. Cloudflare D1 ignores SQL
 * comments; the in-memory test double uses the tag to route to a handler, which
 * keeps tests free and deterministic without a second database driver.
 */
const Q = {
  findKey: `-- q:findKey
SELECT id, key_hash, key_prefix, label, daily_limit, per_minute_limit, revoked, created_at, last_used_at
FROM api_keys WHERE key_hash = ?`,
  touchKey: `-- q:touchKey
UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
  createKey: `-- q:createKey
INSERT INTO api_keys (id, key_hash, key_prefix, label, daily_limit, per_minute_limit, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
  listKeys: `-- q:listKeys
SELECT id, key_prefix, label, daily_limit, per_minute_limit, revoked, created_at, last_used_at FROM api_keys ORDER BY created_at DESC LIMIT 50`,
  getRate: `-- q:getRate
SELECT key_id, minute_start, day_start, minute_used, day_used FROM rate_counters WHERE key_id = ?`,
  createRate: `-- q:createRate
INSERT INTO rate_counters (key_id, minute_start, day_start, minute_used, day_used) VALUES (?, ?, ?, ?, ?)`,
  resetRate: `-- q:resetRate
DELETE FROM rate_counters WHERE key_id = ?`,
  incrementRate: `-- q:incrementRate
UPDATE rate_counters SET minute_used = minute_used + ?, day_used = day_used + ?
WHERE key_id = ? AND minute_start = ? AND day_start = ?
  AND minute_used + ? <= ? AND day_used + ? <= ?
RETURNING minute_used, day_used`,
  getQuota: `-- q:getQuota
SELECT day, calls_used, daily_limit FROM quota_daily WHERE day = ?`,
  createQuota: `-- q:createQuota
INSERT INTO quota_daily (day, calls_used, daily_limit, updated_at) VALUES (?, ?, ?, ?)`,
  reserveQuota: `-- q:reserveQuota
UPDATE quota_daily SET calls_used = calls_used + ?, updated_at = ?
WHERE day = ? AND calls_used + ? <= ?
RETURNING calls_used`,
  insertBattle: `-- q:insertBattle
INSERT INTO battles (id, api_key_id, prompt, cache_key, template, model_set, cache_hit, calls_spent, results_json, failed_json, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  getBattle: `-- q:getBattle
SELECT id, api_key_id, prompt, cache_key, template, model_set, cache_hit, calls_spent, results_json, failed_json, created_at FROM battles WHERE id = ?`,
  listBattles: `-- q:listBattles
SELECT id, prompt, created_at, cache_hit, calls_spent FROM battles WHERE api_key_id = ? ORDER BY created_at DESC LIMIT ?`,
  getVote: `-- q:getVote
SELECT winner_model FROM votes WHERE battle_id = ? AND api_key_id = ?`,
  upsertVote: `-- q:upsertVote
INSERT INTO votes (battle_id, api_key_id, winner_model, updated_at) VALUES (?, ?, ?, ?)
ON CONFLICT(battle_id, api_key_id) DO UPDATE SET winner_model = excluded.winner_model, updated_at = excluded.updated_at`,
  insertVoteEvent: `-- q:insertVoteEvent
INSERT INTO vote_events (id, battle_id, api_key_id, winner_model, previous_winner, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  countVotesForBattle: `-- q:countVotesForBattle
SELECT COUNT(*) AS count FROM votes WHERE battle_id = ?`,
  voteStats: `-- q:voteStats
SELECT je.value AS model,
  SUM(CASE WHEN v.winner_model = je.value THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN v.winner_model <> je.value THEN 1 ELSE 0 END) AS losses,
  COUNT(*) AS samples
FROM votes v JOIN battles b ON b.id = v.battle_id, json_each(b.model_set) je
GROUP BY je.value ORDER BY samples DESC, wins DESC`,
  usageStats: `-- q:usageStats
SELECT model, AVG(latency_ms) AS avg_latency_ms, AVG(tokens_in + tokens_out) AS avg_tokens FROM usage GROUP BY model`,
  insertUsage: `-- q:insertUsage
INSERT INTO usage (api_key_id, battle_id, model, cache_hit, tokens_in, tokens_out, latency_ms, status, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  usageAggregate: `-- q:usageAggregate
SELECT COUNT(DISTINCT battle_id) AS battles,
  SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) AS cache_hits,
  SUM(tokens_in + tokens_out) AS tokens,
  COUNT(*) AS calls
FROM usage WHERE api_key_id = ? AND created_at >= ?`,
  usageEvents: `-- q:usageEvents
SELECT model, status, cache_hit, latency_ms, tokens_in, tokens_out, created_at
FROM usage WHERE api_key_id = ? ORDER BY id DESC LIMIT ?`,
} as const;

export interface RateCounter {
  key_id: string;
  minute_start: number;
  day_start: number;
  minute_used: number;
  day_used: number;
}

export interface QuotaRow {
  day: string;
  calls_used: number;
  daily_limit: number;
}

export interface VoteStat {
  model: string;
  wins: number;
  losses: number;
  samples: number;
}

export interface UsageStat {
  model: string;
  avg_latency_ms: number;
  avg_tokens: number;
}

export async function findApiKeyByHash(
  env: Env,
  hash: string,
): Promise<ApiKeyRow | null> {
  return env.DB.prepare(Q.findKey).bind(hash).first<ApiKeyRow>();
}

export async function touchApiKey(env: Env, id: string): Promise<void> {
  await env.DB.prepare(Q.touchKey).bind(new Date().toISOString(), id).run();
}

export async function createKey(
  env: Env,
  input: { id: string; hash: string; prefix: string; label: string; daily: number; perMinute: number },
): Promise<void> {
  await env.DB.prepare(Q.createKey)
    .bind(input.id, input.hash, input.prefix, input.label, input.daily, input.perMinute, new Date().toISOString())
    .run();
}

export async function listKeys(env: Env): Promise<ApiKeyRow[]> {
  const result = await env.DB.prepare(Q.listKeys).all<ApiKeyRow>();
  return result.results ?? [];
}

export async function getRateCounter(env: Env, keyId: string): Promise<RateCounter | null> {
  return env.DB.prepare(Q.getRate).bind(keyId).first<RateCounter>();
}

export async function createRateCounter(
  env: Env,
  keyId: string,
  minuteStart: number,
  dayStart: number,
  cost: number,
): Promise<void> {
  await env.DB.prepare(Q.createRate)
    .bind(keyId, minuteStart, dayStart, cost, cost)
    .run();
}

export async function resetRateCounter(
  env: Env,
  keyId: string,
  minuteStart: number,
  dayStart: number,
  cost: number,
): Promise<void> {
  await env.DB.prepare(Q.resetRate).bind(keyId).run();
  await createRateCounter(env, keyId, minuteStart, dayStart, cost);
}

export async function incrementRateCounter(
  env: Env,
  args: {
    keyId: string;
    minuteStart: number;
    dayStart: number;
    cost: number;
    perMinute: number;
    perDay: number;
  },
): Promise<{ minute_used: number; day_used: number } | null> {
  return env.DB.prepare(Q.incrementRate)
    .bind(
      args.cost,
      args.cost,
      args.keyId,
      args.minuteStart,
      args.dayStart,
      args.cost,
      args.perMinute,
      args.cost,
      args.perDay,
    )
    .first<{ minute_used: number; day_used: number }>();
}

export async function getQuotaDay(env: Env, day: string): Promise<QuotaRow | null> {
  return env.DB.prepare(Q.getQuota).bind(day).first<QuotaRow>();
}

export async function createQuotaDay(env: Env, day: string, limit: number, cost: number): Promise<void> {
  await env.DB.prepare(Q.createQuota)
    .bind(day, cost, limit, new Date().toISOString())
    .run();
}

/** Atomic: no two concurrent battles can spend past the shared daily budget. */
export async function reserveQuota(
  env: Env,
  args: { day: string; cost: number; limit: number },
): Promise<number | null> {
  const row = await env.DB.prepare(Q.reserveQuota)
    .bind(args.cost, new Date().toISOString(), args.day, args.cost, args.limit)
    .first<{ calls_used: number }>();
  return row?.calls_used ?? null;
}

export async function insertBattle(env: Env, battle: Battle): Promise<void> {
  const cacheKey = await battleCacheKey(battle.prompt, battle.model_set, battle.template);
  await env.DB.prepare(Q.insertBattle)
    .bind(
      battle.id,
      battle.api_key_id,
      battle.prompt,
      cacheKey,
      battle.template,
      battle.model_set.join(','),
      battle.cache === 'HIT' ? 1 : 0,
      battle.calls_spent,
      JSON.stringify(battle.results),
      JSON.stringify(battle.failed),
      battle.created_at,
    )
    .run();
}

export async function getBattle(env: Env, id: string): Promise<Battle | null> {
  const row = await env.DB.prepare(Q.getBattle).bind(id).first<{
    id: string;
    api_key_id: string;
    prompt: string;
    template: string;
    model_set: string;
    cache_hit: number;
    calls_spent: number;
    results_json: string;
    failed_json: string;
    created_at: string;
  }>();
  if (!row) return null;
  return {
    id: row.id,
    api_key_id: row.api_key_id,
    prompt: row.prompt,
    template: row.template,
    model_set: row.model_set.split(',').filter(Boolean),
    results: JSON.parse(row.results_json) as ModelResult[],
    failed: JSON.parse(row.failed_json) as FailedResult[],
    cache: row.cache_hit ? 'HIT' : 'MISS',
    calls_spent: row.calls_spent,
    created_at: row.created_at,
  };
}

export async function listBattles(env: Env, keyId: string, limit: number) {
  const result = await env.DB.prepare(Q.listBattles).bind(keyId, limit).all<{
    id: string;
    prompt: string;
    created_at: string;
    cache_hit: number;
    calls_spent: number;
  }>();
  return result.results ?? [];
}

export async function getVote(
  env: Env,
  battleId: string,
  keyId: string,
): Promise<{ winner_model: string } | null> {
  return env.DB.prepare(Q.getVote).bind(battleId, keyId).first<{ winner_model: string }>();
}

export async function upsertVote(
  env: Env,
  args: { battleId: string; keyId: string; winner: string; previous: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(Q.upsertVote).bind(args.battleId, args.keyId, args.winner, now).run();
  await env.DB.prepare(Q.insertVoteEvent)
    .bind(newId('ve'), args.battleId, args.keyId, args.winner, args.previous, now)
    .run();
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export async function countVotesForBattle(env: Env, battleId: string): Promise<number> {
  const row = await env.DB.prepare(Q.countVotesForBattle).bind(battleId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getVoteStats(env: Env): Promise<VoteStat[]> {
  const result = await env.DB.prepare(Q.voteStats).all<VoteStat>();
  return result.results ?? [];
}

export async function getUsageStats(env: Env): Promise<UsageStat[]> {
  const result = await env.DB.prepare(Q.usageStats).all<UsageStat>();
  return result.results ?? [];
}

export async function insertUsage(
  env: Env,
  event: {
    keyId: string;
    battleId: string;
    model: string;
    cacheHit: boolean;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    status: string;
  },
): Promise<void> {
  await env.DB.prepare(Q.insertUsage)
    .bind(
      event.keyId,
      event.battleId,
      event.model,
      event.cacheHit ? 1 : 0,
      event.tokensIn,
      event.tokensOut,
      event.latencyMs,
      event.status,
      new Date().toISOString(),
    )
    .run();
}

export async function getUsageAggregate(env: Env, keyId: string, sinceIso: string) {
  const row = await env.DB.prepare(Q.usageAggregate)
    .bind(keyId, sinceIso)
    .first<{ battles: number; cache_hits: number; tokens: number; calls: number }>();
  return {
    battles: row?.battles ?? 0,
    cache_hits: row?.cache_hits ?? 0,
    tokens: row?.tokens ?? 0,
    calls: row?.calls ?? 0,
  };
}

export async function getUsageEvents(env: Env, keyId: string, limit: number) {
  const result = await env.DB.prepare(Q.usageEvents).bind(keyId, limit).all<{
    model: string;
    status: string;
    cache_hit: number;
    latency_ms: number;
    tokens_in: number;
    tokens_out: number;
    created_at: string;
  }>();
  return result.results ?? [];
}
