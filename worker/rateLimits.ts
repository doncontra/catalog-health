export interface ApiRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitKind = "write" | "openai";

export function rateLimitKind(method: string, path: string): RateLimitKind | undefined {
  if (method !== "POST") return undefined;
  if (path === "/api/apply-fix") return "write";
  if (path === "/api/generate-fix") return "openai";
  return undefined;
}

export async function isRateLimited(limiter: ApiRateLimiter, actorKey: string, kind: RateLimitKind): Promise<boolean> {
  const { success } = await limiter.limit({ key: `${kind}:${actorKey}` });
  return !success;
}
