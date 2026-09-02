# Testing plan

Testing is split so implementation can be validated now without pretending external integrations are available.

## Judge quick start

- App: `https://catalog-health-copilot.mamandallc.workers.dev`
- The connected Shopify storefront is password-protected. Copy its current password from **Shopify Admin → Online Store → Preferences → Password protection** into the private Devpost testing instructions before judging. Do not commit the password to this public repository.
- The Catalog Health app itself does not require the storefront password; it uses server-side Shopify Admin credentials and never exposes them to the browser.

## Stage 1 — local deterministic checks (complete)

- TypeScript production build.
- Unit tests for audit detection, impact sorting, scoring bounds, drafting, field-scoped application, and agent-view projections.
- Contract test that all ten tools register imperatively on `document.modelContext`, with `readOnlyHint: true` on reads and explicit write descriptions on mutations.
- Browser workflow in demo mode: scan → select → generate → edit → approve → verify → score/queue update.
- Responsive visual checks at 1536×1024, 1024×768, and 390×844.
- Graceful degradation check with `document.modelContext` absent.

Result: 15/15 Vitest assertions pass, including seed-tag enforcement, variant/media ownership rejection, the emergency kill switch, the ten-change cap, and sensitive-route rate-limit selection. The TypeScript/Vite production build passes, and the full browser workflow passed at desktop and mobile sizes with no console errors or horizontal overflow.

## Stage 2 — OpenAI route check (complete)

- Start `npm run cf:dev` with `OPENAI_API_KEY` available to the Worker.
- POST a known demo product/issue to `/api/generate-fix`.
- Confirm the response contains only allowlisted field changes, reports `source: openai`, and never exposes the API key.
- Temporarily force an API failure and confirm deterministic template fallback still returns a usable draft.

Result: the live route returned HTTP 200 with `source: openai` and one allowlisted `descriptionHtml` change. Deterministic fallback remains covered by the route implementation.

## Stage 3 — Shopify integration (complete for single-write mutation families)

- Add `SHOPIFY_SHOP`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET` to `.env.local`; install an app version with `read_products`/`write_products` scopes.
- Run `npm run seed` only against the designated development store.
- Start `npm run cf:dev`; the Cloudflare build explicitly enables the live `/api/*` client path.
- Verify paginated catalog reads and the audit score against seeded products.
- Apply one change for each mutation family: product field, SEO field, category resolution, variant identifier, and image alt text.
- Confirm only the requested fields changed in Shopify Admin and `/api/verify` returns exact live values.
- Exercise sequential bulk apply with 10 items and confirm throttling/no deletes.

Results on `catalog-health-demo.myshopify.com`:

- Client-credentials exchange succeeded with the installed `write_products` scope (which includes product reads).
- The resumable seed created exactly 30 products tagged `catalog-health-seed`.
- The read-only live audit returned 254 initial issues and a health score of 43.
- Description, SEO title, taxonomy category, variant SKU, and image alt-text writes each returned HTTP 200 from `/api/apply-fix` and `/api/verify`, then matched an independent Shopify read-back.
- The description test confirmed unrelated product fields remained unchanged.
- The final live audit returned 251 issues and a health score of 44 while retaining exactly 30 tagged products.
- A live ten-item bulk mutation was intentionally left for the deployed UI/WebMCP pass; the controller enforces a maximum of ten and applies sequentially with per-item results.
- Every production apply request now emits a structured mutation ID and started/succeeded/rejected outcome without logging changed field values.
- `npm run reset:catalog -- --confirm-seed-only` is the recovery path: it deletes only exact-tagged fixtures, recreates the deterministic seed, and verifies all 30 products including duplicate-title counts.

## Stage 4 — deployment and WebMCP discovery (complete for read-only production workflow)

- Load the deployed app as a top-level HTTPS page—never in an iframe.
- Inspect registered tools and confirm all ten names, schemas, descriptions, and annotations.
- Close/reopen the page and confirm registration follows page lifecycle.
- Run the storyboard prompts: “Scan my catalog,” “Show me the worst one,” “Fix the top 5,” and agent-view preview.
- Confirm every tool call visibly mutates the same UI, no write occurs before approval, dismissals are preserved, and every apply is followed by verification.
- Repeat the complete workflow in an ordinary browser without WebMCP to prove graceful degradation.

Result on `https://catalog-health-copilot.mamandallc.workers.dev`:

- Cloudflare served the app as a top-level HTTPS page with Worker-first routing for `/api/*` and SPA fallback for frontend routes.
- ChatGPT's in-app browser discovered all ten imperative tools with the expected schemas, descriptions, and read-only annotations.
- `scan_catalog` fetched 30 live Shopify products and updated the visible UI to health 44/100 with 251 ranked issues.
- `get_health_score`, filtered `list_issues`, `show_issue`, and `preview_agent_view` returned structured production results and remained synchronized with the visible page.
- No console or framework-overlay errors appeared during the production browser smoke test.
- Production draft generation was not invoked because the browser safety review requires explicit approval before sending live product data to the server-side OpenAI integration. Production Shopify writes and the ten-item bulk mutation were also intentionally not invoked during deployment smoke testing.

## Acceptance bar

- No secrets appear in the client bundle, logs, repository, screenshots, or tool output.
- No destructive Shopify operation is exposed through the app or public API; the confirmed reset CLI is restricted to exact-tagged seed fixtures.
- UI and tool calls share the same action controller.
- Production build and tests pass.
- Core workflow passes on desktop and mobile without overflow or inaccessible controls.
- Live Shopify values match every applied fix, and ChatGPT/Chrome can discover the tools from the top-level document.
