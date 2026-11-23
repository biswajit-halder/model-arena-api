import type { UsageStat, VoteStat } from '../db/queries';
import type { LeaderboardRow } from '../types';

/** Pure aggregation so the leaderboard math is unit-testable without D1. */
export function buildLeaderboard(
  voteStats: VoteStat[],
  usageStats: UsageStat[],
  roster: string[],
  minSamples: number,
): LeaderboardRow[] {
  const usage = new Map(usageStats.map((row) => [row.model, row]));
  const stats = new Map<string, VoteStat>();
  for (const row of voteStats) stats.set(row.model, row);
  for (const model of roster) {
    if (!stats.has(model)) stats.set(model, { model, wins: 0, losses: 0, samples: 0 });
  }

  return [...stats.values()]
    .map((row): LeaderboardRow => {
      const usageRow = usage.get(row.model);
      return {
        model: row.model,
        wins: row.wins,
        losses: row.losses,
        samples: row.samples,
        win_rate: row.samples >= minSamples ? Math.round((row.wins / row.samples) * 1000) / 1000 : null,
        avg_latency_ms: usageRow ? Math.round(usageRow.avg_latency_ms) : null,
        avg_tokens: usageRow ? Math.round(usageRow.avg_tokens) : null,
      };
    })
    .sort((a, b) => {
      const rateA = a.win_rate ?? -1;
      const rateB = b.win_rate ?? -1;
      return rateB - rateA || b.samples - a.samples || a.model.localeCompare(b.model);
    });
}
