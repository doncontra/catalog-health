# 01 — Problem Statement (deep)

## Problem

A Shopify merchant's product data is now consumed by **two machines** before any human sees it: search engines (Google/GMC) and AI shopping agents (ChatGPT/Gemini/Perplexity via Shopify Catalog/Agentic Storefronts). Incomplete, vague, or fragmented product data silently suppresses visibility in both — and merchants have no way to see what those machines see, nor a prioritized, low-effort way to fix it.

## Why it hurts now

- AI-referral sessions to Shopify stores grew **8x YoY**; AI-referred orders **13x YoY**; AI visitors convert **~50% higher** and carry **14% higher AOV** (Shopify Q1 2026 commerce data). **>50%** of AI-referred sessions land directly on product pages.
- Merchants are **opted into Agentic Storefronts by default** — their data is already being syndicated to AI chats whether it's ready or not. ChatGPT checkout takes a **4% fee**, so weak data literally costs margin on a new channel.
- **GTIN/identifier errors are the #1 Google Merchant Center disapproval reason**; ~half of GMC merchants hit them. Google unpublishes products with zero warning.

## Merchant-voiced evidence (from research)

- Shopify Community's recurring "most annoying manual task" threads cluster around: finding missing images, weak descriptions, GTIN/SEO issues, and products with poor signals — ideally with prioritized fixes.
- GTIN panic threads: "Google unpublished my products… all my products have barcodes FILLED" (data exists but isn't structured/synced correctly — exactly an audit problem).
- Merchants describe spending weekly hours rotating through product pages checking for broken images, thin content, outdated info ("quick-scan 5–10 product pages each week" — manual sampling, not systematic coverage).

## Why existing options fail

1. **Sidekick** edits one product/field at a time on request; it doesn't run a cross-catalog audit, doesn't prioritize by impact, can't tell you how an AI agent represents your product.
2. **SEO apps (StoreSEO, etc.)** batch-generate content but are rule-only, Google-only, and don't address agent-readiness (variant grouping, attribute completeness, literal-vs-marketing language).
3. **GMC/feed apps** are reactive: they surface errors after Google disapproves products, not before.
4. **Manual audits** sample a handful of pages weekly; catalogs of 100+ SKUs never get full coverage.

## The gap (= our opportunity)

No tool audits the **whole catalog through both lenses** (search-ready + agent-ready), quantifies a health score, ranks issues by impact, and then lets a human and an agent **fix them together in a shared UI** — which is precisely the interaction WebMCP was designed for and what the hackathon judges scored highest (WebMCP Leverage + human-agent experience).

## Audit spec (adopted from Shopify's GEO playbook)

Shopify's own GEO playbook defines the audit criteria (adopted as our spec):

- Complete primary fields (titles, descriptions, variant options, images, prices, taxonomy).
- Variants must be **grouped under one parent**, not split as separate products.
- **Specific taxonomy** ("women's waterproof hiking boots" ≠ "footwear").
- **Literal descriptions** over marketing fluff ("lightweight running shoe" ≠ "Walk on Clouds").
- Data in **structured fields**, not trapped in display logic.
