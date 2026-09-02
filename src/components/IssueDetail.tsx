import { useMemo, useState } from "react";
import { buildAgentView } from "../domain/catalog";
import type { AppliedFix, CatalogIssue, CatalogProduct, FieldChange } from "../domain/types";
import { AgentViewPanel } from "./AgentViewPanel";
import { Icon } from "./Icons";

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const paragraphHtml = (value: string) => `<p>${value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;")}</p>`;

const IMPACTS: Record<string, Array<{ icon: "search" | "spark" | "shield"; title: string; detail: string }>> = {
  identifiers: [
    { icon: "search", title: "Lower discoverability", detail: "Identifiers power product matching." },
    { icon: "spark", title: "Weaker AI matching", detail: "Agents cannot confidently reconcile items." },
    { icon: "shield", title: "Feed risk", detail: "Invalid identifiers can block listings." },
  ],
  content: [
    { icon: "search", title: "Lower search visibility", detail: "Short copy provides less ranking context." },
    { icon: "spark", title: "Weaker AI understanding", detail: "Agents may lack detail to recommend it." },
    { icon: "shield", title: "Lower confidence", detail: "Shoppers need concrete product details." },
  ],
  media: [
    { icon: "search", title: "Less image context", detail: "Search systems lose a useful signal." },
    { icon: "spark", title: "Reduced accessibility", detail: "Image meaning is unavailable as text." },
    { icon: "shield", title: "Lower confidence", detail: "Shoppers cannot fully assess the product." },
  ],
  seo: [
    { icon: "search", title: "Weak search result", detail: "The result may be vague or truncated." },
    { icon: "spark", title: "Missing context", detail: "Agents have less concise summary data." },
    { icon: "shield", title: "Fewer clicks", detail: "Clear snippets set better expectations." },
  ],
  commercial: [
    { icon: "search", title: "Stale availability", detail: "Listings can surface unavailable products." },
    { icon: "spark", title: "Unclear recommendation", detail: "Agents cannot confirm purchase readiness." },
    { icon: "shield", title: "Poor experience", detail: "Shoppers reach an unbuyable item." },
  ],
  agent_readiness: [
    { icon: "search", title: "Scattered signals", detail: "Related options appear as separate items." },
    { icon: "spark", title: "Weaker comparison", detail: "Agents cannot reason over all choices." },
    { icon: "shield", title: "Choice friction", detail: "Shoppers may miss the right variant." },
  ],
};

interface IssueDetailProps {
  issue?: CatalogIssue;
  product?: CatalogProduct;
  busy: boolean;
  appliedFix?: AppliedFix;
  onGenerate: (id: string, tone?: "literal" | "brand") => Promise<FieldChange[]>;
  onUpdateDraft: (id: string, field: FieldChange["field"], value: string) => void;
  onApply: (id: string) => Promise<AppliedFix>;
  onDismiss: (id: string) => void;
}

export function IssueDetail({ issue, product, busy, appliedFix, onGenerate, onUpdateDraft, onApply, onDismiss }: IssueDetailProps) {
  const [tab, setTab] = useState<"draft" | "agent">("draft");
  const agentViews = useMemo(() => product ? {
    before: buildAgentView(product),
    after: buildAgentView(product, issue?.changes ?? []),
  } : undefined, [product, issue?.changes]);

  if (!issue || !product) return <section className="issue-detail empty-detail"><div><Icon name="check"/><h2>No issue selected</h2><p>Choose an item from the queue to inspect it.</p></div></section>;
  const change = issue.changes?.[0];
  const resolved = issue.status === "resolved" || Boolean(appliedFix);
  const dismissed = issue.status === "dismissed";
  const impactItems = IMPACTS[issue.category];

  return <section className="issue-detail" id="issue-detail" aria-label="Selected issue detail">
    <div className="detail-header">
      <div className="issue-context"><span>{issue.type}</span><span className={`severity ${issue.severity}`}><i />{issue.severity}</span></div>
      <div className={`draft-state ${resolved ? "verified" : ""}`}>{resolved ? <><Icon name="check"/> Verified</> : change ? <><Icon name="edit"/> Draft · not applied</> : "Open issue"}</div>
      <h2>{product.title}</h2>
      <span className="handle">Handle: {product.handle}</span>
    </div>

    <div className="impact-strip">
      <strong>Impact</strong>
      {impactItems.map((item) => <div key={item.title}><Icon name={item.icon}/><span><b>{item.title}</b><small>{item.detail}</small></span></div>)}
    </div>

    <div className="detail-tabs" role="tablist">
      <button role="tab" aria-selected={tab === "draft"} className={tab === "draft" ? "active" : ""} onClick={() => setTab("draft")}>Edit draft</button>
      <button role="tab" aria-selected={tab === "agent"} className={tab === "agent" ? "active" : ""} onClick={() => setTab("agent")}>Agent view</button>
      <span className="draft-source">{change ? "Drafted for merchant review" : "No draft generated"}</span>
    </div>

    {tab === "draft" ? <div className="draft-workspace">
      {change ? <>
        <div className="diff-grid">
          <label className="diff-panel before"><span>Before <small>(from Shopify)</small></span><div className="diff-text"><i>−</i><p>{stripHtml(change.before) || "Empty field"}</p></div></label>
          <label className="diff-panel after"><span>Proposed fix <small>(editable)</small></span><div className="diff-text"><i>+</i><textarea aria-label="Proposed field value" value={change.field === "descriptionHtml" ? stripHtml(change.after) : change.after} disabled={resolved || busy} onChange={(event) => onUpdateDraft(issue.id, change.field, change.field === "descriptionHtml" ? paragraphHtml(event.target.value) : event.target.value)} /></div></label>
        </div>
        <div className="change-summary"><span>Change summary</span><p>Replace <code>{change.field}</code> with clearer, structured product information.</p><strong>{stripHtml(change.after).length - stripHtml(change.before).length >= 0 ? "+" : ""}{stripHtml(change.after).length - stripHtml(change.before).length} characters</strong></div>
      </> : <div className="draft-empty">
        <Icon name={issue.manual ? "edit" : issue.draftable ? "spark" : "info"}/>
        <div><h3>{issue.manual ? "Merchant input required" : issue.draftable ? "Ready to draft" : "Guidance only"}</h3><p>{issue.manual ? "This value must come from the product or manufacturer; the agent will not invent it." : issue.draftable ? "Generate a proposed change, then review or edit it before anything is written." : issue.message}</p></div>
        {issue.draftable ? <button className="button primary" disabled={busy} onClick={() => void onGenerate(issue.id).catch(() => undefined)}>{busy ? "Drafting…" : "Generate draft"}</button> : null}
      </div>}
    </div> : agentViews ? <AgentViewPanel before={agentViews.before} after={agentViews.after} /> : null}

    <div className={`verification-ribbon ${resolved ? "verified" : ""}`}>
      <Icon name={resolved ? "check" : "shield"}/>
      <div><strong>{resolved ? "Live values verified" : "Verification follows every write"}</strong><span>{resolved ? `Matched the approved change${appliedFix?.appliedAt ? ` at ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(appliedFix.appliedAt))}` : ""}.` : "After approval, we re-fetch this product and compare the changed fields."}</span></div>
    </div>

    <div className="detail-actions">
      <button className="button secondary" disabled={resolved || dismissed || busy} onClick={() => onDismiss(issue.id)}>Dismiss</button>
      <div className="action-spacer" />
      {change && !resolved ? <button className="button secondary" onClick={() => { setTab("draft"); document.querySelector<HTMLTextAreaElement>(".diff-panel textarea")?.focus(); }}><Icon name="edit"/>Edit draft</button> : null}
      <button className="button primary" disabled={!change || resolved || dismissed || busy} onClick={() => void onApply(issue.id).catch(() => undefined)}><Icon name="check"/>{busy ? "Applying…" : resolved ? "Applied & verified" : "Approve & apply"}</button>
    </div>
  </section>;
}
