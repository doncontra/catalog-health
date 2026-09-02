# 04 — WebMCP Tool Registry (the contract)

**Names:** `snake_case`, ≤128 chars. All return MCP-style `{content:[{type:"text",text:...}]}` plus structured JSON. Write tools state side effects explicitly in descriptions.

## 1. `scan_catalog`
`readOnlyHint: true`. Runs full audit (fetches catalog, applies heuristics).
Returns: `{health_score, search_score, agent_score, counts_by_severity, top_issues:[{issue_id, type, product_title, impact}]}`.
Side effect: UI populates queue + gauge.

## 2. `get_health_score`
`readOnlyHint: true`. Returns current cached scores + per-category breakdown (A–F categories from [SCORING](05-SCORING.md)).

## 3. `list_issues`
`readOnlyHint: true`. Input: `{severity?: "critical"|"warning"|"info", category?: "identifiers"|"content"|"media"|"seo"|"commercial"|"agent_readiness", product_id?: string, limit?: number (default 20)}`.
Returns ranked issue cards.

## 4. `show_issue`
`readOnlyHint: true`. Input: `{issue_id}`. Navigates UI to that issue's detail with before/after diff. Returns the full issue payload so the agent can reason over it.

## 5. `generate_fix`
`readOnlyHint: true` (drafts, writes nothing). Input: `{issue_id, tone?: "literal"|"brand"}`.
Returns proposed field changes as `{field, before, after}[]` and renders the diff. Agent may refine conversationally and re-call.

## 6. `apply_fix`
**write**. Input: `{issue_id, overrides?: {field, value}[]}` (overrides = merchant/agent edits to the draft).
Side effects (stated in description): "Writes the approved changes to the Shopify product via the Admin API and marks the issue resolved in the UI."
Returns: updated fields + new running score. Server allowlist-validates all fields.

## 7. `apply_approved`
**write**. Input: `{issue_ids: string[]}` (max 10). Bulk-applies current drafts for the listed issues, sequentially with throttling.
Returns per-issue results + final score. Description: "Applies only issues that already have generated drafts; skips the rest."

## 8. `dismiss_issue`
**write** (UI state only, never touches Shopify). Input: `{issue_id, reason?: string}`. Removes from queue, deducts nothing. Preserves human judgment.

## 9. `verify_fix`
`readOnlyHint: true`. Input: `{product_id, fields: string[]}`. Re-fetches the product from Shopify and returns the live values of those fields + pass/fail comparison vs. last applied fix. "Return enough information to verify the result" — per OpenAI's tool guidance.

## 10. `preview_agent_view`
`readOnlyHint: true`. Input: `{product_id}`. Renders "how an AI agent reads this product": extracted structured summary (title-literalness, attributes present, variant grouping, taxonomy specificity, identifier completeness) before vs. after pending drafts. **This is the GEO differentiator.**
