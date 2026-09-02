import type { AuditResult } from "../domain/types";

function ScoreBar({ label, value }: { label: string; value: number }) {
  return <div className="score-bar-block">
    <div className="score-label">{label}</div>
    <div className="score-number">{value}<span>/100</span></div>
    <div className="linear-track"><span style={{ width: `${value}%` }} /></div>
  </div>;
}

export function HealthOverview({ audit, resolved }: { audit: AuditResult; resolved: number }) {
  const { scores } = audit;
  return <section className="health-overview" aria-label="Catalog health summary">
    <div className="score-ring" style={{ "--score": `${scores.health * 3.6}deg` } as React.CSSProperties}>
      <div className="score-ring-inner"><strong>{scores.health}</strong><span>/100</span><small>Catalog health</small></div>
    </div>
    <div className="grade-copy"><h1>{scores.grade}</h1><p>Your catalog has issues that may limit visibility in search and AI shopping agents.</p><span className="quiet-link">Prioritized by merchant impact</span></div>
    <ScoreBar label="Search-ready" value={scores.search} />
    <ScoreBar label="Agent-ready" value={scores.agent} />
    <dl className="scan-stats">
      <div><dt>Products scanned</dt><dd>{audit.productCount}</dd></div>
      <div><dt title="Resolved plus open issues">Total detected</dt><dd>{audit.issues.length + resolved}</dd></div>
      <div className="success-text"><dt>Resolved</dt><dd>{resolved}</dd></div>
      <div><dt>Open</dt><dd>{audit.issues.length}</dd></div>
    </dl>
  </section>;
}
