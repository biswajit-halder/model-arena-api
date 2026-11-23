import { describe, expect, it } from 'vitest';
import { battleCacheKey, normalizePrompt, utcDay } from '../../src/lib/hash';

describe('battleCacheKey', () => {
  it('is stable regardless of model order', async () => {
    const a = await battleCacheKey('  What is a CDN?  ', ['model/b', 'model/a'], 'v1');
    const b = await battleCacheKey('What is a CDN?', ['model/a', 'model/b'], 'v1');
    expect(a).toBe(b);
  });

  it('changes with the prompt, model set and template version', async () => {
    const base = await battleCacheKey('same prompt', ['model/a', 'model/b'], 'v1');
    expect(await battleCacheKey('other prompt', ['model/a', 'model/b'], 'v1')).not.toBe(base);
    expect(await battleCacheKey('same prompt', ['model/a', 'model/c'], 'v1')).not.toBe(base);
    expect(await battleCacheKey('same prompt', ['model/a', 'model/b'], 'v2')).not.toBe(base);
  });

  it('normalizes whitespace and control characters', () => {
    expect(normalizePrompt('  a\r\n\r\n\r\nb\t c  ')).toBe('a\n\nb c');
  });

  it('uses a UTC day for the quota ledger', () => {
    expect(utcDay(new Date('2026-11-23T23:59:00Z'))).toBe('2026-11-23');
  });
});
