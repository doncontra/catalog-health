import type { CatalogController } from "../hooks/useCatalogController";
import type { Category, EditableField, Severity } from "../domain/types";

type JsonSchema = Record<string, unknown>;
type ToolResult = { content: Array<{ type: "text"; text: string }>; structuredContent: unknown };
type ToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>, context?: { signal?: AbortSignal }) => Promise<ToolResult> | ToolResult;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<void> | void;
    };
  }
}

function result(summary: string, structuredContent: unknown): ToolResult {
  return { content: [{ type: "text", text: summary }], structuredContent };
}

const emptySchema = { type: "object", properties: {}, additionalProperties: false };

export function registerCatalogTools(controller: CatalogController): AbortController | undefined {
  if (typeof document.modelContext?.registerTool !== "function") return undefined;
  const lifecycle = new AbortController();
  const register = (tool: ToolDefinition) => document.modelContext?.registerTool(tool, { signal: lifecycle.signal });

  const tools: ToolDefinition[] = [
    {
      name: "scan_catalog", title: "Scan catalog",
      description: "Fetch and audit the full product catalog for search and AI-agent readiness. Updates the visible issue queue and health score; does not write product data.",
      inputSchema: emptySchema, annotations: { readOnlyHint: true },
      execute: async () => {
        const audit = await controller.scanCatalog();
        const topIssues = audit.issues.slice(0, 5).map((issue) => ({ issue_id: issue.id, type: issue.type, product_title: issue.productTitle, impact: issue.impact }));
        const data = { health_score: audit.scores.health, search_score: audit.scores.search, agent_score: audit.scores.agent, counts_by_severity: audit.countsBySeverity, top_issues: topIssues };
        return result(`Scanned ${audit.productCount} products. Health score ${audit.scores.health}/100 with ${audit.issues.length} ranked issues.`, data);
      },
    },
    {
      name: "get_health_score", title: "Get health score",
      description: "Return the current cached health, search-ready, agent-ready, and category scores. Does not run a new scan or change the UI.",
      inputSchema: emptySchema, annotations: { readOnlyHint: true },
      execute: () => { const scores = controller.getHealthScore(); return result(`Current catalog health is ${scores.health}/100 (${scores.grade}).`, scores); },
    },
    {
      name: "list_issues", title: "List catalog issues",
      description: "List the currently ranked catalog issues using optional narrow filters. Does not change product data.",
      inputSchema: {
        type: "object", additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["critical", "warning", "info"] },
          category: { type: "string", enum: ["identifiers", "content", "media", "seo", "commercial", "agent_readiness"] },
          product_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      }, annotations: { readOnlyHint: true },
      execute: (input) => {
        const issues = controller.listIssues({ severity: input.severity as Severity | undefined, category: input.category as Category | undefined, productId: input.product_id as string | undefined, limit: input.limit as number | undefined });
        return result(`Found ${issues.length} matching issue${issues.length === 1 ? "" : "s"}.`, issues);
      },
    },
    {
      name: "show_issue", title: "Show issue",
      description: "Navigate the visible workspace to one issue and return its full audit payload. Does not write product data.",
      inputSchema: { type: "object", additionalProperties: false, properties: { issue_id: { type: "string" } }, required: ["issue_id"] },
      annotations: { readOnlyHint: true },
      execute: (input) => { const issue = controller.showIssue(String(input.issue_id)); return result(`Showing ${issue.type} for ${issue.productTitle}.`, issue); },
    },
    {
      name: "generate_fix", title: "Generate fix draft",
      description: "Generate and visibly queue a proposed field change for merchant review. This creates a draft only and never writes to Shopify.",
      inputSchema: { type: "object", additionalProperties: false, properties: { issue_id: { type: "string" }, tone: { type: "string", enum: ["literal", "brand"], default: "literal" } }, required: ["issue_id"] },
      annotations: { readOnlyHint: true },
      execute: async (input) => { const changes = await controller.generateFix(String(input.issue_id), (input.tone as "literal" | "brand") ?? "literal"); return result(`Drafted ${changes.length} field change. No Shopify write occurred.`, { issue_id: input.issue_id, changes }); },
    },
    {
      name: "apply_fix", title: "Apply approved fix",
      description: "Writes the reviewed changes to the Shopify product via the Admin API, marks the issue resolved in the visible UI, and verifies the live values. Requires an existing generated draft.",
      inputSchema: { type: "object", additionalProperties: false, properties: { issue_id: { type: "string" }, overrides: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: false, properties: { field: { type: "string" }, value: { type: "string" } }, required: ["field", "value"] } } }, required: ["issue_id"] },
      execute: async (input) => { const applied = await controller.applyFix(String(input.issue_id), input.overrides as Array<{ field: EditableField; value: string }> | undefined); return result(`Applied and ${applied.verified ? "verified" : "could not verify"} ${applied.changes.length} field change.`, applied); },
    },
    {
      name: "apply_approved", title: "Apply approved drafts",
      description: "Writes up to 10 already-generated drafts sequentially to Shopify, verifies each result, and updates the visible queue. Skips issues without drafts.",
      inputSchema: { type: "object", additionalProperties: false, properties: { issue_ids: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } } }, required: ["issue_ids"] },
      execute: async (input) => { const results = await controller.applyApproved(input.issue_ids as string[]); const finalScore = controller.getHealthScore().health; return result(`Processed ${results.length} issues. Current health score: ${finalScore}/100.`, { results, final_score: finalScore }); },
    },
    {
      name: "dismiss_issue", title: "Dismiss issue",
      description: "Removes an issue from the visible queue for this browser session and preserves the merchant's judgment. Never writes to Shopify.",
      inputSchema: { type: "object", additionalProperties: false, properties: { issue_id: { type: "string" }, reason: { type: "string", maxLength: 240 } }, required: ["issue_id"] },
      execute: (input) => { const issue = controller.dismissIssue(String(input.issue_id), input.reason as string | undefined); return result(`Dismissed ${issue.type} for this session. Shopify was not changed.`, issue); },
    },
    {
      name: "verify_fix", title: "Verify live fix",
      description: "Re-fetches specified product fields from Shopify and compares them with the last applied change. Returns live values and pass/fail evidence; does not write data.",
      inputSchema: { type: "object", additionalProperties: false, properties: { product_id: { type: "string" }, fields: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } } }, required: ["product_id", "fields"] },
      annotations: { readOnlyHint: true },
      execute: async (input) => { const verification = await controller.verifyFix(String(input.product_id), input.fields as string[]); return result(verification.pass ? "The live Shopify values match the applied fix." : "Verification found a mismatch.", verification); },
    },
    {
      name: "preview_agent_view", title: "Preview agent view",
      description: "Render and return how a shopping agent reads one product before and after pending drafts, including taxonomy, attributes, variant grouping, and identifier completeness. Does not write data.",
      inputSchema: { type: "object", additionalProperties: false, properties: { product_id: { type: "string" } }, required: ["product_id"] },
      annotations: { readOnlyHint: true },
      execute: (input) => { const view = controller.previewAgentView(String(input.product_id)); return result(`Agent view prepared for ${view.before.title}; ${view.after.missingFields.length} fields remain unclear after pending drafts.`, view); },
    },
  ];

  tools.forEach((tool) => {
    void Promise.resolve(register(tool)).catch((error: unknown) => {
      if (!lifecycle.signal.aborted) console.error(`WebMCP tool registration failed for ${tool.name}.`, error);
    });
  });
  return lifecycle;
}
