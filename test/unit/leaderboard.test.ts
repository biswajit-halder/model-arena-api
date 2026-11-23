import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '../../src/services/leaderboard';

describe('buildLeaderboard', () => {
  it('computes win rates, hides tiny samples, and sorts by rate', () => {
    const rows = buildLeaderboard(
      [
        { model: 'a', wins: 6, losses: 2, samples: 8 },
        { model: 'b', wins: 2, losses: 6, samples: 8 },
        { model: 'c', wins: 1, losses: 0, samples: 1 },
      ],
      [
        { model: 'a', avg_latency_ms: 810.4, avg_tokens: 70.6 },
        { model: 'b', avg_latency_ms: 1200, avg_tokens: 90 },
      ],
      ['a', 'b', 'c', 'd'],
      3,
    );

    expect(rows.map((row) => row.model)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows[0]).toMatchObject({ win_rate: 0.75, avg_latency_ms: 810, avg_tokens: 71 });
    expect(rows[1]?.win_rate).toBe(0.25);
    expect(rows[2]?.win_rate).toBeNull();
    expect(rows[3]).toMatchObject({ samples: 0, avg_latency_ms: null });
  });

  it('returns a clean zero-vote state from the roster', () => {
    const rows = buildLeaderboard([], [], ['a', 'b'], 3);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.win_rate === null && row.samples === 0)).toBe(true);
  });
});
