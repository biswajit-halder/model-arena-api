import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  OPENROUTER_API_KEY: string;
  ADMIN_TOKEN: string;
  DEFAULT_MODELS: string;
  REQUEST_TIMEOUT_MS: string;
  CACHE_TTL_SECONDS: string;
  MODELS_CACHE_TTL_SECONDS: string;
  PER_MINUTE_LIMIT: string;
  DAILY_REQUEST_LIMIT: string;
  KEY_DAILY_LIMIT: string;
  TEMPLATE_VERSION: string;
  MIN_VOTES_FOR_LEADERBOARD: string;
  ALLOWED_ORIGIN: string;
}

export interface AuthContext {
  keyId: string;
  label: string;
  perMinuteLimit: number;
  dailyLimit: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { auth: AuthContext; battleCost: number };
};

export interface ApiKeyRow {
  id: string;
  key_hash: string;
  key_prefix: string;
  label: string;
  daily_limit: number;
  per_minute_limit: number;
  revoked: number;
  created_at: string;
  last_used_at: string | null;
}

export interface FreeModel {
  id: string;
  name: string;
  contextLength: number | null;
}

export interface ModelResult {
  model: string;
  status: 'ok';
  text: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  chars: number;
}

export interface FailedResult {
  model: string;
  status: 'error';
  code: string;
  retryable: boolean;
  message: string;
}

export interface Battle {
  id: string;
  prompt: string;
  template: string;
  model_set: string[];
  results: ModelResult[];
  failed: FailedResult[];
  cache: 'HIT' | 'MISS';
  calls_spent: number;
  created_at: string;
  api_key_id: string;
}

export interface LlmResult {
  model: string;
  text: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface LeaderboardRow {
  model: string;
  wins: number;
  losses: number;
  win_rate: number | null;
  avg_latency_ms: number | null;
  avg_tokens: number | null;
  samples: number;
}
