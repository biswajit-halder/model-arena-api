import { describe, expect, it } from 'vitest';
import app from '../../src/index';
import { jsonRequest, makeEnv } from '../helpers/mock';

describe('admin seed and zero-quota demo', () => {
  it('issues a key, seeds fixtures and serves demo battles without model calls', async () => {
    const env = makeEnv();
    const admin = { 'x-admin-token': 'admin-token' };

    const keyResponse = await app.fetch(
      jsonRequest('/admin/keys', { label: 'demo' }, admin),
      env,
    );
    expect(keyResponse.status).toBe(200);
    const issued = (await keyResponse.json()) as { key: string };
    expect(issued.key).toMatch(/^mak_/);

    const seed = await app.fetch(
      new Request('http://localhost/admin/seed', { method: 'POST', headers: admin }),
      env,
    );
    expect(await seed.json()).toMatchObject({ battles_seeded: 4, examples_seeded: 4 });

    const examples = await app.fetch(
      new Request('http://localhost/v1/demo/examples'),
      env,
    );
    const exampleBody = (await examples.json()) as { examples: unknown[] };
    expect(exampleBody.examples).toHaveLength(4);

    const battle = await app.fetch(
      jsonRequest('/v1/demo/battles', { example_id: 'cdn' }),
      env,
    );
    expect(battle.status).toBe(200);
    expect(await battle.json()).toMatchObject({ cache: 'HIT', calls_spent: 0 });
  });
});
