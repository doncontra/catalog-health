# 05 — Catalog Health Model

## Overall score

0–100, computed **per product then weighted** (published products count 2×). Store score = weighted mean, minus a small penalty for store-level issues (e.g., variant-fragmentation clusters).

Two sub-scores shown:
- **Search-ready** (categories A–E)
- **Agent-ready** (category F + identifiers)

## Check registry

Each check: `id`, category, detection, severity, points, fix type.

### A. Identifiers (blocks GMC + agent matching)

| id | detection | severity | pts | fix |
| --- | --- | --- | --- | --- |
| `missing_barcode` | `variant.barcode` empty AND product not tagged custom/handmade | critical | 8 | auto-fixable only if merchant supplies value → manual-input fix |
| `barcode_not_structured` | barcode present but product's structured data/feed wouldn't include it (heuristic: barcode invalid length/check-digit) | warning | 4 | — |
| `missing_vendor` | vendor empty | warning | 4 | auto-draftable from title |
| `missing_category` | Shopify standard product category unset | critical | 8 | auto-suggested from title/type |
| `vague_taxonomy` | productType generic ∈ {footwear, apparel, accessories, misc} | warning | 4 | — |
| `missing_sku` | sku empty | info | 2 | — |

### B. Content quality

| id | detection | severity | pts | fix |
| --- | --- | --- | --- | --- |
| `missing_description` | 0 chars | critical | 10 | auto-draftable |
| `thin_description` | <30 words or <200 chars | warning | 6 | auto-draftable |
| `marketing_not_literal` | title/description dominated by slogans (heuristic: no concrete attribute tokens — size/color/material/dimension words absent; exclamation marks >1) | warning | 5 | Shopify GEO rule |
| `title_issues` | >70 chars, ALL-CAPS, or equals handle junk | warning | 4 | — |
| `duplicate_titles` | same normalized title across >1 product | warning | 4 | — |

### C. Media

| id | detection | severity | pts | fix |
| --- | --- | --- | --- | --- |
| `no_images` | media count 0 | critical | 10 | — |
| `single_image` | exactly 1 image | info | 3 | — |
| `missing_alt_text` | any image alt empty | warning | 5 | auto-draftable from title+variant |

### D. SEO

| id | detection | severity | pts | fix |
| --- | --- | --- | --- | --- |
| `missing_seo_title` | seo.title empty | warning | 5 | auto-draftable |
| `missing_seo_description` | seo.description empty | warning | 5 | auto-draftable |
| `seo_description_length` | <70 or >160 chars | info | 3 | — |

### E. Commercial signals

| id | detection | severity | pts | fix |
| --- | --- | --- | --- | --- |
| `active_zero_inventory` | status ACTIVE, totalInventory 0, no continue-selling | warning | 6 | — |
| `stale_draft` | DRAFT older than 30 days | info | 2 | — |
| `zombie_listing` (stretch) | no orders in 90d — requires `read_orders`; cut if time is short | — | — | — |

### F. Agent-readiness (the differentiator; from Shopify GEO playbook)

| id | detection | severity | pts | fix |
| --- | --- | --- | --- | --- |
| `variant_fragmentation` | ≥3 products whose titles differ only by a color/size token | critical | 8 | guidance card (merge into variants) — not auto-applied |
| `no_variant_options` | product has variants but options unnamed/placeholder ("Title", "Default Title") | warning | 4 | — |
| `attributes_missing` | no material/care/dimension metafields for categories where agents compare specs | info | 3 | — |
| `unclear_pricing` | active product with price 0 or missing compare-at where a sale badge is implied in text | info | 2 | — |

## Priority formula

`impact = points × severity_multiplier (critical=3, warning=2, info=1) × (published ? 2 : 1)`

Queue sorts by `impact` desc.

## Grades

- **90+** Excellent
- **75–89** Good
- **60–74** Needs work
- **<60** At risk
