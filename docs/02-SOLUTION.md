# 02 — Product Design

## Core loop

**Scan → Prioritize → Co-fix → Verify.**

## UX (single top-level page, 3 zones)

- **Top bar:** Store Health Score gauge (0–100) with two sub-scores: **Search-ready** and **Agent-ready**. Score animates upward as fixes land.
- **Left:** Issue queue, sorted by impact (severity × published-status). Each card: issue type, product, why it matters (one line, e.g., "Google unpublishes products with identifier errors").
- **Right:** Detail pane — before/after diff of the proposed fix, **Approve / Edit / Dismiss**. An **"Agent view"** toggle renders "How an AI agent reads this product" — the structured summary an agent would extract today vs. after the fix.

## Co-working contract (what makes it WebMCP-native, not a chatbot)

- The agent acts **only through registered tools**; every action visibly mutates the same UI the merchant sees (cards resolve, score climbs, diffs appear).
- Writes are **always human-gated**: the agent drafts and queues; the merchant approves individually ("apply this"), in bulk ("fix the top 5"), or edits the draft first. Dismissals are respected and remembered for the session.
- Every write is followed by `verify_fix` — re-fetch from Shopify, show green check. **Trust through verification.**

## Demo storyboard (<3 min, shot by shot)

- **0:00–0:20 — Cold open:** in ChatGPT, ask "best trail-running shoe under $150" → our demo store's product is absent/misrepresented ("Walk on Clouds"). Voiceover: "This merchant doesn't know their catalog is invisible."
- **0:20–0:50 —** Open Catalog Health Copilot in ChatGPT's browser. "Scan my catalog." Agent calls `scan_catalog` → gauge fills at 62, queue populates. Agent narrates top 3 issues by impact.
- **0:50–1:40 —** "Show me the worst one." → `show_issue` navigates; diff appears. "Fix the top 5." → `generate_fix` + `apply_fix` ×5; cards resolve, score 62→81. One draft is off-brand → merchant edits inline → applies their version (human judgment, live).
- **1:40–2:20 — Agent-readiness lens:** `preview_agent_view` on the "Walk on Clouds" product → before: nonsense summary; after fix: "lightweight trail-running shoe, 290g, $139, in stock."
- **2:20–2:45 —** `verify_fix` re-fetches from Shopify; green checks; final score 94.
- **2:45–3:00 — Close:** "Every fix went straight into the live store. Built on WebMCP — the agent and the merchant worked the same page."
