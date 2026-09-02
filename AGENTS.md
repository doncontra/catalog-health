# AGENTS.md — Build Context

## Hard constraint

ChatGPT's in-app browser **does not discover tools registered inside iframes** and **does not support the declarative (form) API**. All tools register **imperatively in the top-level document** via `document.modelContext.registerTool()`.

- Never embed the app in an iframe.
- Never build it as an embedded Shopify-admin app.

## Tool design rules (from OpenAI's guide)

- Narrow inputs.
- Describe side effects in the tool description.
- Return enough info to verify the result.
- Set `annotations: { readOnlyHint: true }` on reads.

## Secrets & data flow

- The Shopify Admin API token lives **only in server-side env** (`SHOPIFY_SHOP`, `SHOPIFY_ADMIN_TOKEN`).
- Frontend talks to our `/api/*` routes.
- WebMCP tools call the **same internal functions** as UI buttons (shared logic, shared permissions).

## Degradation

The app must remain **fully usable without WebMCP** (plain browser). WebMCP is an additive layer.

## Commands

```bash
npm run dev      # Vite
npm run seed     # seeds demo store
npm run deploy   # Vercel
```
