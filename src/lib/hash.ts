/** SHA-256 via Web Crypto — available in Workers with no node:crypto dependency. */
export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizePrompt(prompt: string): string {
  return prompt
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Cache key includes everything that can change the comparison: a version tag,
 * the normalized prompt, the exact model set (order-independent) and the prompt
 * template version. A roster or template change can never serve a stale battle.
 */
export async function battleCacheKey(
  prompt: string,
  models: string[],
  templateVersion: string,
): Promise<string> {
  const payload = {
    v: 1,
    prompt: normalizePrompt(prompt),
    models: [...models].sort(),
    templateVersion,
  };
  return sha256(JSON.stringify(payload));
}

/** Opaque key: raw value shown once, only its hash is persisted. */
export function generateApiKey(): { raw: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const prefix = secret.slice(0, 8);
  return { raw: `mak_${prefix}${secret.slice(8)}`, prefix };
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
