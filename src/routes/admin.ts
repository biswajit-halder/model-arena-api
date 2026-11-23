import { Hono } from 'hono';
import { createKey, listKeys } from '../db/queries';
import { generateApiKey, sha256 } from '../lib/hash';
import { newId } from '../lib/ids';
import { adminOnly } from '../middleware/adminOnly';
import { seedModels } from '../services/models';
import type { AppEnv, Battle } from '../types';
import seedData from '../../seed/demo-battles.json';

export const admin = new Hono<AppEnv>();

admin.post('/keys', adminOnly, async (c) => {
  let label = 'demo';
  try {
    const body = (await c.req.json()) as { label?: string };
    if (body?.label) label = body.label.slice(0, 60);
  } catch {
    /* label is optional */
  }
  const { raw, prefix } = generateApiKey();
  await createKey(c.env, {
    id: newId('key'),
    hash: await sha256(raw),
    prefix,
    label,
    daily: Number(c.env.KEY_DAILY_LIMIT),
    perMinute: Number(c.env.PER_MINUTE_LIMIT),
  });
  return c.json({ key: raw, prefix, label, note: 'Store this key now — only its SHA-256 hash is retained.' });
});

admin.get('/keys', adminOnly, async (c) => {
  return c.json({ items: await listKeys(c.env) });
});

admin.post('/seed', adminOnly, async (c) => {
  const battles = seedData.battles as Array<{
    id: string;
    example_id: string;
    prompt: string;
    template: string;
    model_set: string[];
    results: Battle['results'];
    failed: Battle['failed'];
  }>;
  for (const battle of battles) {
    const record: Battle = {
      id: battle.id,
      api_key_id: 'demo',
      prompt: battle.prompt,
      template: battle.template,
      model_set: battle.model_set,
      results: battle.results,
      failed: battle.failed,
      cache: 'HIT',
      calls_spent: 0,
      created_at: '2026-11-23T00:00:00.000Z',
    };
    await c.env.CACHE.put(`demo:battle:${battle.example_id}`, JSON.stringify(record));
  }
  await c.env.CACHE.put('demo:examples', JSON.stringify(seedData.examples));
  await c.env.CACHE.put(
    'models:free',
    JSON.stringify(seedModels(c.env)),
    { expirationTtl: Number(c.env.MODELS_CACHE_TTL_SECONDS) },
  );
  return c.json({ battles_seeded: battles.length, examples_seeded: seedData.examples.length });
});
