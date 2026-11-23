import { z } from 'zod';
import { ValidationError } from './errors';

export const battleSchema = z.object({
  prompt: z.string().trim().min(1, 'prompt is required').max(4000),
  models: z.array(z.string().min(1)).min(2, 'at least 2 models required').max(3).optional(),
  template: z.string().min(1).max(40).optional(),
});

export const voteSchema = z.object({
  battle_id: z.string().min(1),
  winner_model: z.string().min(1),
});

export const demoBattleSchema = z.object({
  example_id: z.string().min(1),
});

/** Zod validates the *provider envelope*, not a model-generated schema. */
export const openRouterSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export const freeModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().nullable().optional(),
      pricing: z.object({ prompt: z.union([z.string(), z.number()]) }).optional(),
    }),
  ),
});

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      'Request validation failed',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export async function parseJsonOrThrow<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Body must be valid JSON');
  }
  return parseOrThrow(schema, body);
}
