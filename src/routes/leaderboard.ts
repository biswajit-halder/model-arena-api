import { Hono } from 'hono';
import { getUsageStats, getVoteStats } from '../db/queries';
import { auth } from '../middleware/auth';
import { buildLeaderboard } from '../services/leaderboard';
import { seedModels } from '../services/models';
import type { AppEnv } from '../types';

export const leaderboard = new Hono<AppEnv>();

leaderboard.get('/', auth, async (c) => {
  const requested = Number(c.req.query('min_votes') ?? Number(c.env.MIN_VOTES_FOR_LEADERBOARD));
  const minSamples = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 3;
  const [voteStats, usageStats] = await Promise.all([
    getVoteStats(c.env),
    getUsageStats(c.env),
  ]);
  const roster = seedModels(c.env).map((model) => model.id);
  const items = buildLeaderboard(voteStats, usageStats, roster, minSamples);
  return c.json({ items, min_votes: minSamples });
});
