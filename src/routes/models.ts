import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { getFreeModels } from '../services/models';
import type { AppEnv } from '../types';

export const models = new Hono<AppEnv>();

models.get('/', auth, async (c) => {
  const result = await getFreeModels(c.env);
  return c.json(result);
});
