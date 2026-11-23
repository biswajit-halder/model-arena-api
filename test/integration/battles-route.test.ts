import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index';
import { createAuthKey, jsonRequest, makeEnv, type TestEnv } from '../helpers/mock';

function chatResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

async function postBattle(env: TestEnv, key: string, prompt: string) {
  return app.fetch(
    jsonRequest('/v1/battles', { prompt }, { authorization: `Bearer ${key}` }),
    env,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /v1/battles', () => {
  it('fans out, caches the result and makes zero calls on a repeat', async () => {
    const env = makeEnv();
    const key = await createAuthKey(env);
    let chatCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        chatCalls += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as { model: string };
        return chatResponse(`answer from ${body.model}`);
      }),
    );

    const first = await postBattle(env, key, 'Explain a CDN');
    expect(first.status).toBe(201);
    const body = (await first.json()) as {
      id: string;
      cache: string;
      calls_spent: number;
      results: Array<{ model: string; text: string }>;
    };
    expect(body.results).toHaveLength(2);
    expect(body.cache).toBe('MISS');
    expect(body.calls_spent).toBe(2);
    expect(chatCalls).toBe(2);

    const quota = await app.fetch(
      new Request('http://localhost/v1/battles/quota', { headers: { authorization: `Bearer ${key}` } }),
      env,
    );
    expect(await quota.json()).toMatchObject({ used: 2, limit: 50, remaining: 48 });

    const second = await postBattle(env, key, 'Explain a CDN');
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ cache: 'HIT', calls_spent: 0, id: body.id });
    expect(chatCalls).toBe(2);

    const different = await postBattle(env, key, 'Explain a message queue');
    expect(different.status).toBe(201);
    expect(chatCalls).toBe(4);
  });

  it('returns partial answers when one model is rate limited', async () => {
    const env = makeEnv();
    const key = await createAuthKey(env);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model: string };
        return body.model === 'model/b:free'
          ? new Response('rate limited', { status: 429 })
          : chatResponse('surviving answer');
      }),
    );

    const response = await postBattle(env, key, 'A prompt with no cached answer');
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      results: unknown[];
      failed: Array<{ code: string }>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.failed).toMatchObject([{ code: 'rate_limited' }]);
  });

  it('rejects an unauthenticated request', async () => {
    const response = await app.fetch(
      jsonRequest('/v1/battles', { prompt: 'hi' }),
      makeEnv(),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
