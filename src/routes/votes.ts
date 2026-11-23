import { Hono } from 'hono';
import { getBattle, getVote, upsertVote } from '../db/queries';
import { NotFoundError, ValidationError } from '../lib/errors';
import { voteSchema, parseJsonOrThrow } from '../lib/validate';
import { auth } from '../middleware/auth';
import type { AppEnv } from '../types';

export const votes = new Hono<AppEnv>();

votes.post('/', auth, async (c) => {
  const input = await parseJsonOrThrow(c.req.raw, voteSchema);
  const battle = await getBattle(c.env, input.battle_id);
  if (!battle) throw new NotFoundError('Battle not found');
  if (!battle.model_set.includes(input.winner_model)) {
    throw new ValidationError('winner_model must be one of the models in this battle', {
      model_set: battle.model_set,
    });
  }

  const keyId = c.get('auth').keyId;
  const previous = await getVote(c.env, battle.id, keyId);
  await upsertVote(c.env, {
    battleId: battle.id,
    keyId,
    winner: input.winner_model,
    previous: previous?.winner_model ?? null,
  });

  return c.json({ battle_id: battle.id, winner_model: input.winner_model, updated: Boolean(previous) });
});
