import { describe, expect, it } from 'vitest';
import app from '../../src/index';
import { insertBattle } from '../../src/db/queries';
import type { Battle } from '../../src/types';
import { createAuthKey, jsonRequest, makeEnv, type TestEnv } from '../helpers/mock';

async function seedBattle(env: TestEnv): Promise<string> {
  const battle: Battle = {
    id: 'bat_test123',
    api_key_id: 'key_test',
    prompt: 'Which answer is better?',
    template: 'concise-v1',
    model_set: ['model/a:free', 'model/b:free'],
    results: [],
    failed: [],
    cache: 'MISS',
    calls_spent: 2,
    created_at: '2026-11-23T00:00:00.000Z',
  };
  await insertBattle(env, battle);
  return battle.id;
}

describe('votes and leaderboard', () => {
  it('allows one changeable vote per key and aggregates win rates', async () => {
    const env = makeEnv();
    const key = await createAuthKey(env);
    const battleId = await seedBattle(env);
    const auth = { authorization: `Bearer ${key}` };

    const first = await app.fetch(
      jsonRequest('/v1/votes', { battle_id: battleId, winner_model: 'model/a:free' }, auth),
      env,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ updated: false });

    const changed = await app.fetch(
      jsonRequest('/v1/votes', { battle_id: battleId, winner_model: 'model/b:free' }, auth),
      env,
    );
    expect(await changed.json()).toMatchObject({ updated: true });

    const board = await app.fetch(
      new Request('http://localhost/v1/leaderboard?min_votes=1', { headers: auth }),
      env,
    );
    const body = (await board.json()) as {
      items: Array<{ model: string; samples: number; win_rate: number | null }>;
    };
    expect(body.items.find((row) => row.model === 'model/b:free')).toMatchObject({
      samples: 1, win_rate: 1,
    });
    expect(body.items.find((row) => row.model === 'model/a:free')).toMatchObject({
      samples: 1, win_rate: 0,
    });
  });

  it('rejects votes for unknown battles and models outside the set', async () => {
    const env = makeEnv();
    const key = await createAuthKey(env);
    const auth = { authorization: `Bearer ${key}` };
    const battleId = await seedBattle(env);

    expect(
      (await app.fetch(
        jsonRequest('/v1/votes', { battle_id: 'bat_missing', winner_model: 'model/a:free' }, auth),
        env,
      )).status,
    ).toBe(404);
    expect(
      (await app.fetch(
        jsonRequest('/v1/votes', { battle_id: battleId, winner_model: 'model/z:free' }, auth),
        env,
      )).status,
    ).toBe(400);
  });
});
