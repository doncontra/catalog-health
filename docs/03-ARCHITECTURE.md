# 03 — Technical Decisions

## Confirmed constraints (researched, non-negotiable)

| Constraint | Source |
| --- | --- |
| ChatGPT browser: imperative API only; no declarative/form tools; no tools inside iframes | learn.chatgpt.com/docs/webmcp |
| Tools must be re-registered per page/session; closing page removes them | WebMCP spec |
| Origin isolation required; tools permission defaults to `self` | Chrome docs |
| Judges test via ChatGPT in-app browser or Chrome flag | Devpost rules |
| Admin API: 100 pts/sec, mutations cost 10 | Shopify rate-limit docs |
| Hackathon deadline Sep 3, 1pm PT (≈4 days) | Devpost |

## Architecture

```
Browser (top-level page)
├── React UI  ──────────────┐
│   (buttons/queue/diffs)   │  same internal functions
├── webmcp/tools.ts ────────┘  (registerTool on load)
│         │ fetch
▼         ▼
Cloudflare Worker API
├── GET  /api/catalog        → Shopify GraphQL products query (paged)
├── POST /api/audit          → runs heuristics, returns issues + scores
├── POST /api/generate-fix   → OpenAI draft (fallback: templates)
├── POST /api/apply-fix      → productUpdate / productVariantsBulkUpdate
└── POST /api/verify         → re-fetch product, compare fields
        │
        ▼
Shopify dev store (custom app token: read_products, write_products)
```

## Key decisions

1. **Auth:** admin-created custom app on the dev store → Admin API access token in server env. No OAuth flow (dev-store-only path is officially supported; no review needed).
2. **Demo data:** `npm run seed` script creates ~30 products via `productCreate`, each planting specific issue types (every check in [05-SCORING](05-SCORING.md) gets ≥2 specimens) + 5 clean products. Deterministic seed = reproducible demo.
3. **Fix generation:** server-side OpenAI call with product context + style rules (literal, attribute-rich, ≤ limits). Offline fallback: deterministic templates, so the app never hard-depends on LLM uptime.
4. **State:** server returns the full audit; client holds it in memory; tools and UI share the same store (Zustand or plain context). No database — audit is recomputed on demand (catalogs are small; keeps architecture stateless).
5. **Safety:** every apply-fix writes only allowlisted fields, only for products carrying `catalog-health-seed`, and only after variant/media target IDs are verified against that product. The Worker independently rate-limits Shopify writes and OpenAI drafts; `ALLOW_LIVE_WRITES` is a fail-closed emergency switch; every mutation request emits structured outcome logs. Product deletion is not exposed by the app or API. The explicit CLI reset can delete and recreate only tagged seed fixtures after the operator supplies `--confirm-seed-only`.
6. **Graceful degradation:** `if (typeof document.modelContext?.registerTool === "function")` guard; app is fully functional in plain Chrome.
