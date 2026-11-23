import { callModel, ModelCallFailure } from './llm';
import type { Env, FailedResult, ModelResult } from '../types';

export interface ArenaOutcome {
  results: ModelResult[];
  failed: FailedResult[];
  callsSpent: number;
}

/**
 * Fan-out/fan-in with partial success: one failing model never discards the
 * other answers. All failures are surfaced to the caller as a 502 with detail.
 */
export async function runBattle(
  env: Env,
  prompt: string,
  models: string[],
): Promise<ArenaOutcome> {
  const settled = await Promise.allSettled(models.map((model) => callModel(env, model, prompt)));

  const results: ModelResult[] = [];
  const failed: FailedResult[] = [];

  settled.forEach((outcome, index) => {
    const model = models[index]!;
    if (outcome.status === 'fulfilled') {
      const answer = outcome.value;
      results.push({
        model,
        status: 'ok',
        text: answer.text,
        latency_ms: answer.latencyMs,
        tokens_in: answer.tokensIn,
        tokens_out: answer.tokensOut,
        chars: answer.text.length,
      });
      return;
    }
    const failure =
      outcome.reason instanceof ModelCallFailure
        ? outcome.reason
        : new ModelCallFailure('unknown_error', false, 'Unexpected model failure');
    failed.push({
      model,
      status: 'error',
      code: failure.code,
      retryable: failure.retryable,
      message: failure.message,
    });
  });

  return { results, failed, callsSpent: models.length };
}
