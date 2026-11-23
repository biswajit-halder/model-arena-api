import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBattle } from '../../src/services/arena';
import { makeEnv } from '../helpers/mock';

function chatResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('runBattle fan-out', () => {
  it('keeps successful answers when one model fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model: string };
        return body.model === 'model/a:free'
          ? chatResponse('Answer from A')
          : new Response('rate limited', { status: 429 });
      }),
    );

    const outcome = await runBattle(makeEnv(), 'prompt', ['model/a:free', 'model/b:free']);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]).toMatchObject({
      model: 'model/a:free', text: 'Answer from A', tokens_in: 10, tokens_out: 20,
    });
    expect(outcome.failed).toMatchObject([{ model: 'model/b:free', code: 'rate_limited' }]);
    expect(outcome.callsSpent).toBe(2);
  });

  it('reports all failures instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const outcome = await runBattle(makeEnv(), 'prompt', ['model/a:free', 'model/b:free']);
    expect(outcome.results).toHaveLength(0);
    expect(outcome.failed).toHaveLength(2);
    expect(outcome.failed[0]?.retryable).toBe(true);
  });

  it('marks malformed provider payloads as permanent failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );
    const outcome = await runBattle(makeEnv(), 'prompt', ['model/a:free']);
    expect(outcome.failed[0]).toMatchObject({ code: 'malformed_response', retryable: false });
  });
});
