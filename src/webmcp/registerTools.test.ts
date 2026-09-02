import { describe, expect, it } from "vitest";
import type { CatalogController } from "../hooks/useCatalogController";
import { registerCatalogTools } from "./registerTools";

describe("WebMCP registry", () => {
  it("registers the complete imperative top-level tool contract", () => {
    const tools: Array<{ name: string; description: string; annotations?: { readOnlyHint?: boolean } }> = [];
    Object.defineProperty(globalThis, "document", { configurable: true, value: { modelContext: { registerTool: (tool: typeof tools[number]) => { tools.push(tool); } } } });
    const lifecycle = registerCatalogTools({} as CatalogController);
    expect(tools.map((tool) => tool.name)).toEqual([
      "scan_catalog", "get_health_score", "list_issues", "show_issue", "generate_fix",
      "apply_fix", "apply_approved", "dismiss_issue", "verify_fix", "preview_agent_view",
    ]);
    expect(tools.filter((tool) => ["scan_catalog", "get_health_score", "list_issues", "show_issue", "generate_fix", "verify_fix", "preview_agent_view"].includes(tool.name)).every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools.find((tool) => tool.name === "apply_fix")?.description).toMatch(/Writes.*Shopify.*verif/i);
    lifecycle?.abort();
  });
});
