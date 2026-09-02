import { describe, expect, it, vi } from "vitest";
import { isRateLimited, rateLimitKind } from "./rateLimits";

describe("sensitive API rate limits", () => {
  it("selects independent limits for writes and OpenAI drafts", () => {
    expect(rateLimitKind("POST", "/api/apply-fix")).toBe("write");
    expect(rateLimitKind("POST", "/api/generate-fix")).toBe("openai");
    expect(rateLimitKind("GET", "/api/generate-fix")).toBeUndefined();
    expect(rateLimitKind("POST", "/api/audit")).toBeUndefined();
  });

  it("uses a route-specific actor key and reports exhausted limits", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    await expect(isRateLimited({ limit }, "203.0.113.7", "write")).resolves.toBe(true);
    expect(limit).toHaveBeenCalledWith({ key: "write:203.0.113.7" });
  });
});
