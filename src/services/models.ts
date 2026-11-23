import { ModelNotFreeError, ValidationError } from '../lib/errors';
import { freeModelsResponseSchema, parseOrThrow } from '../lib/validate';
import type { Env, FreeModel } from '../types';

const CACHE_KEY = 'models:free';

export function seedModels(env: Env): FreeModel[] {
  return env.DEFAULT_MODELS.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({ id, name: id, contextLength: null }));
}

function toFreeModel(input: {
  id: string;
  name?: string;
  context_length?: number | null;
}): FreeModel {
  return { id: input.id, name: input.name ?? input.id, contextLength: input.context_length ?? null };
}

export async function getFreeModels(
  env: Env,
): Promise<{ models: FreeModel[]; source: 'live' | 'kv' | 'seed' }> {
  const cached = await env.CACHE.get(CACHE_KEY, 'json');
  if (Array.isArray(cached) && cached.length >= 2) {
    return { models: cached as FreeModel[], source: 'kv' };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(Number(env.REQUEST_TIMEOUT_MS)),
      headers: { 'HTTP-Referer': 'https://github.com/biswajit-halder/model-arena-api' },
    });
    if (!response.ok) throw new Error(`models endpoint returned ${response.status}`);
    const parsed = parseOrThrow(freeModelsResponseSchema, await response.json());
    const models = parsed.data
      .filter(
        (model) =>
          model.id.endsWith(':free') &&
          (model.pricing?.prompt === '0' || model.pricing?.prompt === 0),
      )
      .map(toFreeModel);
    if (models.length < 2) throw new Error('fewer than 2 free models in live list');
    await env.CACHE.put(CACHE_KEY, JSON.stringify(models), {
      expirationTtl: Number(env.MODELS_CACHE_TTL_SECONDS),
    });
    return { models, source: 'live' };
  } catch {
    return { models: seedModels(env), source: 'seed' };
  }
}

/** Default = first two free models; explicit ids are validated against the live list. */
export async function resolveModels(env: Env, requested?: string[]): Promise<string[]> {
  const { models } = await getFreeModels(env);
  const allowed = new Set(models.map((model) => model.id));

  if (!requested || requested.length === 0) {
    return models.slice(0, 2).map((model) => model.id);
  }

  const unique = [...new Set(requested)];
  if (unique.length < 2 || unique.length > 3) {
    throw new ValidationError('Choose between 2 and 3 distinct models');
  }
  for (const model of unique) {
    if (!allowed.has(model)) throw new ModelNotFreeError(model);
  }
  return unique;
}
