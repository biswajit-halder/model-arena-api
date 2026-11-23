import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { createAuthKey, jsonRequest, makeEnv } from '../helpers/mock';

afterEach(() => vi.unstubAllGlobals());

describe('global quota circuit breaker', () => {
  it('stops uncached battles at the daily limit but still serves cached ones', async () => {
    const env = makeEnv({ DAILY_REQUEST_LIMIT: '3' });
    const key = await createAuthKey(env);
    let chatCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        chatCalls += 1;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'answer' } }] }),
          { status: 200 },
        );
      }),
    );

    const first = await app.fetch(
      jsonRequest('/v1/battles', { prompt: 'first prompt' }, { authorization: `Bearer ${key}` }),
      env,
    );
    expect(first.status).toBe(201);
    expect(chatCalls).toBe(2);

    const cached = await app.fetch(
      jsonRequest('/v1/battles', { prompt: 'first prompt' }, { authorization: `Bearer ${key}` }),
      env,
    );
    expect(cached.status).toBe(200);
    expect(chatCalls).toBe(2);

    const rejected = await app.fetch(
      jsonRequest('/v1/battles', { prompt: 'second prompt' }, { authorization: `Bearer ${key}` }),
      env,
    );
    expect(rejected.status).toBe(429);
    const body = (await rejected.json()) as { error: { code: string; retryable: boolean } };
    expect(body.error).toMatchObject({ code: 'QUOTA_EXHAUSTED', retryable: true });
    expect(rejected.headers.get('retry-after')).toBeTruthy();
    expect(chatCalls).toBe(2);
  });
});
