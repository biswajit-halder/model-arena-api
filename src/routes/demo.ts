import { Hono } from 'hono';
import { NotFoundError } from '../lib/errors';
import { demoBattleSchema, parseJsonOrThrow } from '../lib/validate';
import { getSeedBattle, listSeedExamples } from '../services/cache';
import type { AppEnv } from '../types';

/** Public, zero-quota endpoints backed by KV fixtures from POST /admin/seed. */
export const demo = new Hono<AppEnv>();

demo.get('/examples', async (c) => {
  return c.json({ examples: await listSeedExamples(c.env) });
});

demo.post('/battles', async (c) => {
  const input = await parseJsonOrThrow(c.req.raw, demoBattleSchema);
  const battle = await getSeedBattle(c.env, input.example_id);
  if (!battle) throw new NotFoundError('Unknown demo example. Run POST /admin/seed first.');
  return c.json({ ...battle, cache: 'HIT', calls_spent: 0 });
});
