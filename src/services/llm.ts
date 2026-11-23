import { openRouterSchema } from '../lib/validate';
import type { Env, LlmResult } from '../types';

/** Fixed v1 prompt. A version tag lives in the battle cache key; change both together. */
const SYSTEM_PROMPT = 'You are a concise assistant. Answer in at most four sentences, directly and factually.';

export class ModelCallFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ModelCallFailure';
  }
}

export async function callModel(env: Env, model: string, prompt: string): Promise<LlmResult> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/biswajit-halder/model-arena-api',
        'X-Title': 'Model Arena API',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(Number(env.REQUEST_TIMEOUT_MS)),
    });
  } catch (error) {
    throw new ModelCallFailure('network_error', true, error instanceof Error ? error.message : 'network error');
  }

  if (!response.ok) {
    const code = response.status === 429 ? 'rate_limited' : `http_${response.status}`;
    throw new ModelCallFailure(
      code,
      response.status === 429 || response.status >= 500,
      `OpenRouter returned HTTP ${response.status}`,
    );
  }

  let parsed;
  try {
    parsed = openRouterSchema.safeParse(await response.json());
  } catch {
    throw new ModelCallFailure('malformed_response', false, 'Upstream response was not valid JSON');
  }
  if (!parsed.success) {
    throw new ModelCallFailure('malformed_response', false, 'Upstream response lacked choices[0].message.content');
  }

  return {
    model,
    text: parsed.data.choices[0].message.content,
    latencyMs: Date.now() - started,
    tokensIn: parsed.data.usage?.prompt_tokens ?? 0,
    tokensOut: parsed.data.usage?.completion_tokens ?? 0,
  };
}
