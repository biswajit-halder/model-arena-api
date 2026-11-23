import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/lib/errors';
import { battleSchema, openRouterSchema, parseOrThrow } from '../../src/lib/validate';

describe('validation schemas', () => {
  it('accepts a 2-model battle and rejects invalid ones', () => {
    expect(battleSchema.safeParse({ prompt: 'hi', models: ['a', 'b'] }).success).toBe(true);
    expect(battleSchema.safeParse({ prompt: 'hi', models: ['a'] }).success).toBe(false);
    expect(battleSchema.safeParse({ prompt: 'hi', models: ['a', 'b', 'c', 'd'] }).success).toBe(false);
    expect(battleSchema.safeParse({ prompt: '   ', models: ['a', 'b'] }).success).toBe(false);
    expect(battleSchema.safeParse({ prompt: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('validates the provider envelope, not model-generated JSON', () => {
    expect(
      openRouterSchema.safeParse({ choices: [{ message: { content: 'hello' } }] }).success,
    ).toBe(true);
    expect(openRouterSchema.safeParse({ choices: [] }).success).toBe(false);
    expect(openRouterSchema.safeParse({ choices: [{ message: {} }] }).success).toBe(false);
  });

  it('throws a machine-readable ValidationError with issue paths', () => {
    try {
      parseOrThrow(battleSchema, { prompt: '' });
      throw new Error('expected a validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
      expect((error as ValidationError).details).toBeDefined();
    }
  });
});
