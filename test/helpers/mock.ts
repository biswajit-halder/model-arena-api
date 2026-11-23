import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { Env } from '../../src/types';

type Row = Record<string, unknown>;
const n = (value: unknown) => Number(value ?? 0);

/** Minimal in-memory D1 double: SQL statements are routed by their `-- q:tag`. */
class FakeD1 {
  apiKeys: Row[] = [];
  rateCounters: Row[] = [];
  quotaDaily: Row[] = [];
  battles: Row[] = [];
  votes: Row[] = [];
  voteEvents: Row[] = [];
  usage: Row[] = [];
  private nextUsageId = 1;

  prepare(sql: string) {
    const tag = sql.trimStart().split('\n')[0]!.replace('-- q:', '').trim();
    return new FakeStatement(this, tag);
  }

  dispatch(tag: string, p: unknown[]): Row[] {
    switch (tag) {
      case 'findKey':
        return this.apiKeys.filter((row) => row.key_hash === p[0]);
      case 'touchKey': {
        const row = this.apiKeys.find((item) => item.id === p[1]);
        if (row) row.last_used_at = p[0];
        return [];
      }
      case 'createKey':
        this.apiKeys.push({
          id: p[0], key_hash: p[1], key_prefix: p[2], label: p[3],
          daily_limit: p[4], per_minute_limit: p[5], revoked: 0, created_at: p[6], last_used_at: null,
        });
        return [];
      case 'listKeys':
        return this.apiKeys;
      case 'getRate':
        return this.rateCounters.filter((row) => row.key_id === p[0]);
      case 'createRate':
        this.rateCounters.push({
          key_id: p[0], minute_start: p[1], day_start: p[2], minute_used: p[3], day_used: p[4],
        });
        return [];
      case 'resetRate':
        this.rateCounters = this.rateCounters.filter((row) => row.key_id !== p[0]);
        return [];
      case 'incrementRate': {
        const row = this.rateCounters.find((item) => item.key_id === p[2]);
        if (!row || row.minute_start !== p[3] || row.day_start !== p[4]) return [];
        const newMinute = n(row.minute_used) + n(p[0]);
        const newDay = n(row.day_used) + n(p[1]);
        if (newMinute > n(p[6]) || newDay > n(p[8])) return [];
        row.minute_used = newMinute;
        row.day_used = newDay;
        return [{ minute_used: newMinute, day_used: newDay }];
      }
      case 'getQuota':
        return this.quotaDaily.filter((row) => row.day === p[0]);
      case 'createQuota':
        this.quotaDaily.push({ day: p[0], calls_used: p[1], daily_limit: p[2], updated_at: p[3] });
        return [];
      case 'reserveQuota': {
        const row = this.quotaDaily.find((item) => item.day === p[2]);
        if (!row) return [];
        const nextUsed = n(row.calls_used) + n(p[0]);
        if (nextUsed > n(p[4])) return [];
        row.calls_used = nextUsed;
        row.updated_at = p[1];
        return [{ calls_used: nextUsed }];
      }
      case 'insertBattle':
        this.battles.push({
          id: p[0], api_key_id: p[1], prompt: p[2], cache_key: p[3], template: p[4],
          model_set: p[5], cache_hit: p[6], calls_spent: p[7], results_json: p[8],
          failed_json: p[9], created_at: p[10],
        });
        return [];
      case 'getBattle':
        return this.battles.filter((row) => row.id === p[0]);
      case 'listBattles':
        return this.battles
          .filter((row) => row.api_key_id === p[0])
          .slice()
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, n(p[1]));
      case 'getVote':
        return this.votes.filter((row) => row.battle_id === p[0] && row.api_key_id === p[1]);
      case 'upsertVote': {
        const existing = this.votes.find(
          (row) => row.battle_id === p[0] && row.api_key_id === p[1],
        );
        if (existing) existing.winner_model = p[2];
        else this.votes.push({ battle_id: p[0], api_key_id: p[1], winner_model: p[2], updated_at: p[3] });
        return [];
      }
      case 'insertVoteEvent':
        this.voteEvents.push({
          id: p[0], battle_id: p[1], api_key_id: p[2], winner_model: p[3],
          previous_winner: p[4], created_at: p[5],
        });
        return [];
      case 'countVotesForBattle':
        return [{ count: this.votes.filter((row) => row.battle_id === p[0]).length }];
      case 'voteStats': {
        const counts = new Map<string, { model: string; wins: number; losses: number; samples: number }>();
        for (const battle of this.battles) {
          const models = String(battle.model_set).split(',').filter(Boolean);
          const battleVotes = this.votes.filter((vote) => vote.battle_id === battle.id);
          for (const model of models) {
            const stat = counts.get(model) ?? { model, wins: 0, losses: 0, samples: 0 };
            for (const vote of battleVotes) {
              stat.samples += 1;
              if (vote.winner_model === model) stat.wins += 1;
              else stat.losses += 1;
            }
            counts.set(model, stat);
          }
        }
        return [...counts.values()];
      }
      case 'usageStats': {
        const groups = new Map<string, { model: string; latency: number[]; tokens: number[] }>();
        for (const row of this.usage) {
          const model = String(row.model);
          const group = groups.get(model) ?? { model, latency: [], tokens: [] };
          group.latency.push(n(row.latency_ms));
          group.tokens.push(n(row.tokens_in) + n(row.tokens_out));
          groups.set(model, group);
        }
        return [...groups.values()].map((group) => ({
          model: group.model,
          avg_latency_ms: group.latency.reduce((a, b) => a + b, 0) / group.latency.length,
          avg_tokens: group.tokens.reduce((a, b) => a + b, 0) / group.tokens.length,
        }));
      }
      case 'insertUsage':
        this.usage.push({
          id: this.nextUsageId++, api_key_id: p[0], battle_id: p[1], model: p[2],
          cache_hit: p[3], tokens_in: p[4], tokens_out: p[5], latency_ms: p[6],
          status: p[7], created_at: p[8],
        });
        return [];
      case 'usageAggregate': {
        const rows = this.usage.filter(
          (row) => row.api_key_id === p[0] && String(row.created_at) >= String(p[1]),
        );
        return [{
          battles: new Set(rows.map((row) => row.battle_id)).size,
          cache_hits: rows.filter((row) => n(row.cache_hit) === 1).length,
          tokens: rows.reduce((sum, row) => sum + n(row.tokens_in) + n(row.tokens_out), 0),
          calls: rows.filter((row) => n(row.cache_hit) === 0).length,
        }];
      }
      case 'usageEvents':
        return this.usage
          .filter((row) => row.api_key_id === p[0])
          .slice()
          .reverse()
          .slice(0, n(p[1]));
      default:
        throw new Error(`Unexpected SQL tag: ${tag}`);
    }
  }
}

class FakeStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly tag: string,
  ) {}

  bind(...params: unknown[]) {
    const statement = new FakeStatement(this.db, this.tag);
    statement.params = params;
    return statement;
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.dispatch(this.tag, this.params)[0];
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T>(): Promise<{ results: T[]; success: boolean; meta: unknown }> {
    return { results: this.db.dispatch(this.tag, this.params) as T[], success: true, meta: {} };
  }

  async run(): Promise<{ success: boolean }> {
    this.db.dispatch(this.tag, this.params);
    return { success: true };
  }
}

class FakeKV {
  store = new Map<string, string>();

  async get(key: string, type?: string) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: string, _options?: unknown) {
    this.store.set(key, value);
  }
}

export interface TestEnv extends Env {
  fakeDb: FakeD1;
  fakeKv: FakeKV;
}

export function makeEnv(overrides: Partial<Env> = {}): TestEnv {
  const fakeDb = new FakeD1();
  const fakeKv = new FakeKV();
  const models = ['model/a:free', 'model/b:free', 'model/c:free'].map((id) => ({
    id, name: id, contextLength: null,
  }));
  fakeKv.store.set('models:free', JSON.stringify(models));

  return {
    DB: fakeDb as unknown as D1Database,
    CACHE: fakeKv as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test-key',
    ADMIN_TOKEN: 'admin-token',
    DEFAULT_MODELS: 'model/a:free,model/b:free,model/c:free',
    REQUEST_TIMEOUT_MS: '2000',
    CACHE_TTL_SECONDS: '86400',
    MODELS_CACHE_TTL_SECONDS: '3600',
    PER_MINUTE_LIMIT: '20',
    DAILY_REQUEST_LIMIT: '50',
    KEY_DAILY_LIMIT: '500',
    TEMPLATE_VERSION: 'concise-v1',
    MIN_VOTES_FOR_LEADERBOARD: '3',
    ALLOWED_ORIGIN: '*',
    fakeDb,
    fakeKv,
    ...overrides,
  };
}

export async function createAuthKey(env: TestEnv): Promise<string> {
  const { createKey } = await import('../../src/db/queries');
  const { generateApiKey, sha256 } = await import('../../src/lib/hash');
  const { newId } = await import('../../src/lib/ids');
  const { raw, prefix } = generateApiKey();
  await createKey(env, {
    id: newId('key'), hash: await sha256(raw), prefix, label: 'test',
    daily: Number(env.KEY_DAILY_LIMIT), perMinute: Number(env.PER_MINUTE_LIMIT),
  });
  return raw;
}

export function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
