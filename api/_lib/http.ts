import type { VercelRequest, VercelResponse } from "./vercel";

export function method(req: VercelRequest, res: VercelResponse, allowed: "GET" | "POST"): boolean {
  if (req.method === allowed) return true;
  res.setHeader("Allow", allowed);
  res.status(405).json({ error: `Method ${req.method ?? "unknown"} not allowed.` });
  return false;
}

export function fail(res: VercelResponse, error: unknown, status = 500): void {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  res.status(status).json({ error: message });
}
