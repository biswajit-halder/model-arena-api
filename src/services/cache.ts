import type { Battle, Env } from '../types';

export async function getCachedBattle(env: Env, cacheKey: string): Promise<Battle | null> {
  const value = await env.CACHE.get(`battle:${cacheKey}`, 'json');
  return value ? (value as Battle) : null;
}

export async function putCachedBattle(env: Env, cacheKey: string, battle: Battle): Promise<void> {
  await env.CACHE.put(`battle:${cacheKey}`, JSON.stringify(battle), {
    expirationTtl: Number(env.CACHE_TTL_SECONDS),
  });
}

export async function getSeedBattle(env: Env, exampleId: string): Promise<Battle | null> {
  const value = await env.CACHE.get(`demo:battle:${exampleId}`, 'json');
  return value ? (value as Battle) : null;
}

export async function listSeedExamples(env: Env): Promise<Array<{ id: string; prompt: string }>> {
  const value = await env.CACHE.get('demo:examples', 'json');
  return (value as Array<{ id: string; prompt: string }> | null) ?? [];
}
