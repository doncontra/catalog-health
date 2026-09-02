import type { AgentView } from "../domain/types";

function ViewColumn({ label, view }: { label: string; view: AgentView }) {
  return <div className="agent-view-column">
    <div className="agent-column-label">{label}</div>
    <dl>
      <div><dt>Product type</dt><dd>{view.productType}</dd></div>
      <div><dt>Intended use</dt><dd>{view.intendedUse}</dd></div>
      <div><dt>Key benefits</dt><dd>{view.keyBenefits.join(", ")}</dd></div>
      <div><dt>Material</dt><dd>{view.material}</dd></div>
      <div><dt>Care</dt><dd>{view.care}</dd></div>
      <div><dt>Identifiers</dt><dd>{view.identifiers.complete}/{view.identifiers.total} complete</dd></div>
    </dl>
    {view.missingFields.length ? <p className="missing-fields">Still unclear: {view.missingFields.join(", ")}</p> : <p className="complete-fields">All comparison fields are clear.</p>}
  </div>;
}

export function AgentViewPanel({ before, after }: { before: AgentView; after: AgentView }) {
  return <div className="agent-view-grid">
    <ViewColumn label="Current catalog" view={before} />
    <ViewColumn label="With pending draft" view={after} />
  </div>;
}
