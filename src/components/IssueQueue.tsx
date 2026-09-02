import type { CatalogIssue, IssueFilters, Severity } from "../domain/types";

const severityLabel: Record<Severity, string> = { critical: "Critical", warning: "Warning", info: "Info" };

interface IssueQueueProps {
  issues: CatalogIssue[];
  totalIssues: number;
  counts: Record<Severity, number>;
  selectedId?: string;
  filters: IssueFilters;
  onFilters: (filters: IssueFilters) => void;
  onSelect: (id: string) => void;
}

export function IssueQueue({ issues, totalIssues, counts, selectedId, filters, onFilters, onSelect }: IssueQueueProps) {
  const selectSeverity = (severity?: Severity) => onFilters({ ...filters, severity, limit: 100 });
  return <section className="issue-queue" aria-label="Prioritized issue queue">
    <div className="queue-heading"><h2>Issue queue</h2><span>{totalIssues} open issues</span></div>
    <div className="filter-row" role="group" aria-label="Filter issues by severity">
      <button className={!filters.severity ? "active" : ""} onClick={() => selectSeverity()}>All</button>
      <button className={filters.severity === "critical" ? "active" : ""} onClick={() => selectSeverity("critical")}>Critical <span>{counts.critical}</span></button>
      <button className={filters.severity === "warning" ? "active" : ""} onClick={() => selectSeverity("warning")}>Warning <span>{counts.warning}</span></button>
      <button className={filters.severity === "info" ? "active" : ""} onClick={() => selectSeverity("info")}>Info <span>{counts.info}</span></button>
    </div>
    <div className="queue-table-head"><span>Issue</span><span>Severity</span><span>Impact</span></div>
    <div className="issue-list">
      {issues.length ? issues.map((issue, index) => <button
        key={issue.id}
        className={`issue-row ${issue.severity} ${selectedId === issue.id ? "selected" : ""}`}
        onClick={() => onSelect(issue.id)}
        aria-pressed={selectedId === issue.id}
      >
        <span className="issue-rank">{index + 1}</span>
        <span className="issue-name"><strong>{issue.type}</strong><small>{issue.productTitle}</small></span>
        <span className={`severity ${issue.severity}`}><i />{severityLabel[issue.severity]}</span>
        <span className="impact">{issue.impact}</span>
      </button>) : <div className="empty-list">No issues match this filter.</div>}
    </div>
  </section>;
}
