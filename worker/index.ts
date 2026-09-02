import catalogHandler from "../api/catalog";
import auditHandler from "../api/audit";
import generateFixHandler from "../api/generate-fix";
import applyFixHandler from "../api/apply-fix";
import verifyHandler from "../api/verify";
import type { VercelRequest, VercelResponse } from "../api/_lib/vercel";
import { isRateLimited, rateLimitKind } from "./rateLimits";

type ApiHandler = (request: VercelRequest, response: VercelResponse) => Promise<void>;

const MAX_JSON_BODY_BYTES = 1_000_000;
const API_HANDLERS: Readonly<Record<string, ApiHandler>> = {
  "/api/catalog": catalogHandler,
  "/api/audit": auditHandler,
  "/api/generate-fix": generateFixHandler,
  "/api/apply-fix": applyFixHandler,
  "/api/verify": verifyHandler,
};

class ResponseAdapter implements VercelResponse {
  private statusCode = 200;
  private readonly headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  private payload: unknown = null;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  status(code: number): VercelResponse {
    this.statusCode = code;
    return this;
  }

  json(value: unknown): VercelResponse {
    this.payload = value;
    return this;
  }

  toResponse(): Response {
    return new Response(JSON.stringify(this.payload), { status: this.statusCode, headers: this.headers });
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function enforceSensitiveRouteLimit(request: Request, path: string, env: Env): Promise<Response | undefined> {
  const kind = rateLimitKind(request.method, path);
  if (!kind) return undefined;

  const actorKey = request.headers.get("cf-connecting-ip")?.trim() || "unidentified-client";
  const limiter = kind === "write" ? env.WRITE_RATE_LIMITER : env.OPENAI_RATE_LIMITER;
  if (!await isRateLimited(limiter, actorKey, kind)) return undefined;

  console.warn(JSON.stringify({ event: "api_rate_limited", kind, path, ray: request.headers.get("cf-ray") }));
  return Response.json(
    { error: kind === "write" ? "Too many catalog write requests. Try again in a minute." : "Too many draft requests. Try again in a minute." },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

async function parseRequest(request: Request): Promise<VercelRequest | Response> {
  if (request.method === "GET" || request.method === "HEAD") return { method: request.method };

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return jsonError("Request body is too large.", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return jsonError("Request body is too large.", 413);
  }
  if (!text) return { method: request.method };

  try {
    return { method: request.method, body: JSON.parse(text) as unknown };
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
}

async function handleApiRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const handler = API_HANDLERS[path];
  if (!handler) return jsonError("API route not found.", 404);

  const parsed = await parseRequest(request);
  if (parsed instanceof Response) return parsed;

  const response = new ResponseAdapter();
  await handler(parsed, response);
  return response.toResponse();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      const limited = await enforceSensitiveRouteLimit(request, url.pathname.replace(/\/$/, ""), env);
      if (limited) return limited;
      return await handleApiRequest(request);
    } catch (error) {
      console.error(JSON.stringify({
        message: "Unhandled API error",
        error: error instanceof Error ? error.message : "Unknown error",
        method: request.method,
        path: url.pathname,
      }));
      return jsonError("Unexpected server error.", 500);
    }
  },
} satisfies ExportedHandler<Env>;
