# Catalog Health Copilot

A **WebMCP-native web app** that audits a Shopify store's product catalog for search and AI-agent readiness, then fixes issues collaboratively: the merchant and their AI agent work on the same live page, the agent does the labor (scanning, drafting, applying fixes via structured tools), the human keeps judgment (approve, edit, dismiss).

[Live demo](https://catalog-health-copilot.mamandallc.workers.dev) · [MIT license](LICENSE) · [WebMCP Challenge](https://webmcp.devpost.com/)

- **Hackathon:** OpenAI WebMCP Challenge (deadline Sep 3, 2026, 1pm PT)
- **One-liner for submission:** "Your catalog is now your storefront in AI chats. Catalog Health Copilot lets a merchant and their agent find and fix the product-data issues that make stores invisible — together, on one live page."
- **Demo store:** Shopify development store connected through an installed Dev Dashboard app and a server-side client-credentials exchange
- **Stack:** Vite + React + TS (top-level page, no iframes) · Cloudflare Worker + static assets · Shopify Admin API (GraphQL) · OpenAI server-side for fix drafts · WebMCP imperative API
- **License:** [MIT](LICENSE)

## Judge quick start

1. Open the [live app](https://catalog-health-copilot.mamandallc.workers.dev) as a top-level page in ChatGPT's in-app browser, or in Chrome with `chrome://flags/#enable-webmcp-testing` enabled.
2. Ask the agent to **scan the catalog**, **list the three highest-impact issues**, and **show the worst draftable issue**.
3. Ask it to **generate a fix** and inspect the proposed field-level diff in the shared page.
4. Approve the change in the visible UI, then confirm that the app re-fetches Shopify and reports verification evidence.

The Catalog Health app requires no judge login. It connects only to a disposable Shopify development store containing deterministic products tagged `catalog-health-seed`. Server-side safeguards restrict writes to those fixtures.

## Why WebMCP

Catalog cleanup normally makes merchants jump between reports, product editors, spreadsheets, and AI chats. WebMCP turns the live audit page into a structured agent workspace: the agent can inspect and prioritize hundreds of findings without guessing at the UI, while the merchant retains the judgment calls and sees every draft, approval, write, and verification on the same page.

Together, the merchant and agent can complete a governed scan → explain → draft → review → apply → verify loop that is difficult to make reliable with visual browser automation alone. The app remains fully usable through ordinary controls when WebMCP is unavailable.

## How WebMCP is implemented

All ten tools register imperatively from the top-level document through `document.modelContext.registerTool()`. No iframe or declarative form API is used. Tool handlers invoke the same catalog controller functions as the visible buttons, so agent activity and human activity share state, permissions, progress, and verification.

```ts
document.modelContext.registerTool({
  name: "scan_catalog",
  description: "Fetch and audit the product catalog without writing product data.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  execute: () => controller.scanCatalog(),
});
```

The registered tools are `scan_catalog`, `get_health_score`, `list_issues`, `show_issue`, `generate_fix`, `apply_fix`, `apply_approved`, `dismiss_issue`, `verify_fix`, and `preview_agent_view`. Their complete schemas and side-effect descriptions are documented in [docs/04-TOOLS.md](docs/04-TOOLS.md), with the implementation in [`src/webmcp/registerTools.ts`](src/webmcp/registerTools.ts).

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/01-PROBLEM.md](docs/01-PROBLEM.md) | Problem statement (deep) |
| [docs/02-SOLUTION.md](docs/02-SOLUTION.md) | Product design, UX, demo storyboard |
| [docs/03-ARCHITECTURE.md](docs/03-ARCHITECTURE.md) | Technical decisions and constraints |
| [docs/04-TOOLS.md](docs/04-TOOLS.md) | WebMCP tool registry (the contract) |
| [docs/05-SCORING.md](docs/05-SCORING.md) | Catalog health model and check registry |
| [docs/06-BUILD.md](docs/06-BUILD.md) | 4-day execution plan, risks, checklist |

See [AGENTS.md](AGENTS.md) for build context and hard constraints.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The default is a fully interactive, deterministic 30-product demo. It does not need Shopify, OpenAI, WebMCP, or an iframe, and every scan/draft/apply/verify action remains available through ordinary browser controls.

Copy `.env.example` to `.env.local` when live integrations are ready. Never commit `.env.local`.

```dotenv
SHOPIFY_SHOP=your-development-store.myshopify.com
SHOPIFY_CLIENT_ID=your-client-id
SHOPIFY_CLIENT_SECRET=your-client-secret
OPENAI_API_KEY=sk-proj_...
OPENAI_MODEL=gpt-5.6-terra
ALLOW_LIVE_WRITES=true
VITE_USE_LIVE_API=true
```

- `SHOPIFY_CLIENT_SECRET` is server-only. The app exchanges its client credentials for a 24-hour Shopify access token and refreshes it automatically. The installed app needs `read_products` and `write_products`.
- `OPENAI_API_KEY` is server-only and optional. If the API is unavailable, drafting uses the same safe deterministic templates as demo mode.
- `ALLOW_LIVE_WRITES=true` enables the guarded demo-store mutation route. Any other value disables writes with HTTP 503.
- `VITE_USE_LIVE_API=true` tells the browser to use `/api/*`. Use `npm run cf:dev` locally so the Worker, static assets, and API routes run together.
- WebMCP is additive: supported top-level browsers receive ten imperative tools; ordinary browsers use the same controller through the UI.

## What is implemented

- Full scoring engine for the A–F registry in `docs/05-SCORING.md` except the intentionally deferred order-history `zombie_listing` check.
- Ranked issue queue, health/search/agent scores, field diff editing, human approval, session dismissal, agent-view preview, rescoring, and post-write verification.
- Imperative `document.modelContext.registerTool()` registration for all ten documented WebMCP tools. Registrations are scoped to page lifecycle with `AbortController`.
- Cloudflare Worker routes for Shopify catalog reads, audits, OpenAI-backed drafts with template fallback, allowlisted Shopify writes, and live verification.
- Server-enforced demo safeguards: exact seed-tag targeting, variant/media ownership checks, independent write/OpenAI rate limits, an emergency write kill switch, and structured mutation logs.
- Deterministic `npm run seed` source catalog with at least two specimens for every implemented check and five clean products.
- MIT license and credential-safe environment placeholders.

## Testing and deployment status

Automated domain/tool-contract tests, responsive browser QA, the live OpenAI draft route, Shopify client-credentials authentication, deterministic seeding, catalog reads, and controlled Shopify writes have been verified. The live store test covered product description, SEO title, taxonomy category, variant SKU, and image alt text writes with exact read-back verification.

The production app is deployed at [catalog-health-copilot.mamandallc.workers.dev](https://catalog-health-copilot.mamandallc.workers.dev). ChatGPT's in-app browser discovered all ten tools from the top-level HTTPS document. Production WebMCP calls for catalog scan, health score, filtered issue listing, issue navigation, and agent-view preview all returned structured live-Shopify results and updated the shared UI. State-changing production tool calls remain intentionally excluded from deployment smoke testing.

The staged test matrix and acceptance criteria are in [docs/TESTING.md](docs/TESTING.md).

## Commands

```bash
npm run dev      # Vite dev server
npm run seed     # seeds the demo store
npm run reset:catalog -- --confirm-seed-only # deletes/recreates tagged seed products only
npm run shopify:check # read-only connection and live audit check
npm run deploy   # deploy to Cloudflare Workers
```

`npm run seed` writes only tagged demo products and accounts for duplicate seed titles, so an interrupted run can safely resume. The reset command requires the exact confirmation flag, deletes only products that still carry `catalog-health-seed`, recreates the deterministic 30-product fixture, and verifies the final title counts. `npm run shopify:check` is read-only. The explicit scripts in `scripts/test-shopify-write.ts` and `scripts/test-shopify-mutations.ts` are state-changing integration tests and must only be run against a designated development store.

## Open-source license

Catalog Health Copilot is open-source software licensed under the [MIT License](LICENSE). The repository includes the complete application source, WebMCP registrations, assets, Cloudflare deployment configuration, deterministic demo data, tests, and setup instructions required to run the project.
