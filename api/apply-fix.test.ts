import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelResponse } from "./_lib/vercel";
import { applyProductChanges } from "./_lib/shopify";
import handler from "./apply-fix";

vi.mock("./_lib/shopify", () => ({ applyProductChanges: vi.fn() }));

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  const response: VercelResponse = {
    setHeader: vi.fn(),
    status(code) { statusCode = code; return response; },
    json(value) { payload = value; return response; },
  };
  return { response, result: () => ({ statusCode, payload }) };
}

describe("apply-fix API", () => {
  beforeEach(() => {
    vi.mocked(applyProductChanges).mockReset();
    vi.stubEnv("ALLOW_LIVE_WRITES", "true");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects placeholder product GIDs before calling Shopify", async () => {
    const recorder = responseRecorder();
    await handler({ method: "POST", body: {
      productId: "gid://shopify/Product/demo-13",
      issueId: "demo-issue",
      changes: [{ field: "title", before: "Before", after: "After" }],
    } }, recorder.response);

    expect(recorder.result()).toEqual({ statusCode: 400, payload: { error: "productId must be a numeric Shopify Product GID." } });
    expect(applyProductChanges).not.toHaveBeenCalled();
  });

  it("fails closed when the emergency write switch is off", async () => {
    vi.stubEnv("ALLOW_LIVE_WRITES", "false");
    const recorder = responseRecorder();
    await handler({ method: "POST", body: {
      productId: "gid://shopify/Product/123",
      issueId: "issue-123",
      changes: [{ field: "title", before: "Before", after: "After" }],
    } }, recorder.response);

    expect(recorder.result()).toEqual({ statusCode: 503, payload: { error: "Live catalog writes are temporarily disabled." } });
    expect(applyProductChanges).not.toHaveBeenCalled();
  });

  it("keeps the ten-change request limit", async () => {
    const recorder = responseRecorder();
    await handler({ method: "POST", body: {
      productId: "gid://shopify/Product/123",
      issueId: "issue-123",
      changes: Array.from({ length: 11 }, () => ({ field: "title", before: "Before", after: "After" })),
    } }, recorder.response);

    expect(recorder.result()).toEqual({ statusCode: 400, payload: { error: "Provide between 1 and 10 field changes." } });
    expect(applyProductChanges).not.toHaveBeenCalled();
  });
});
