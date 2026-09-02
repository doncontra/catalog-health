import { useMemo } from "react";
import { HealthOverview } from "./components/HealthOverview";
import { Icon } from "./components/Icons";
import { IssueDetail } from "./components/IssueDetail";
import { IssueQueue } from "./components/IssueQueue";
import { TopBar } from "./components/TopBar";
import { useCatalogController } from "./hooks/useCatalogController";
import { useWebMcp } from "./webmcp/useWebMcp";

export default function App() {
  const controller = useCatalogController();
  const webMcpAvailable = useWebMcp(controller);
  const selectedProduct = useMemo(() => controller.products.find((product) => product.id === controller.selectedIssue?.productId), [controller.products, controller.selectedIssue?.productId]);
  const appliedFix = controller.appliedFixes.find((fix) => fix.issueId === controller.selectedIssue?.id);
  const loadingLiveCatalog = controller.mode === "live" && controller.scanning && controller.products.length === 0;

  return <div className="app-shell">
    <TopBar mode={controller.mode} scanning={controller.scanning} scannedAt={controller.audit.scannedAt} webMcpAvailable={webMcpAvailable} onScan={() => void controller.scanCatalog().catch(() => undefined)} />
    {loadingLiveCatalog ? <section className="health-loading" aria-label="Catalog health summary" aria-busy="true">
      <Icon name="refresh" />
      <div><h1>Loading current catalog health</h1><p>Scores appear after the live Shopify catalog has been fetched and audited.</p></div>
    </section> : <HealthOverview audit={controller.audit} resolved={controller.appliedFixes.length} />}
    {controller.notice ? <div className={`notice ${controller.notice.kind}`} role="status">
      <Icon name={controller.notice.kind === "success" ? "check" : controller.notice.kind === "error" ? "info" : "spark"}/>
      <span>{controller.notice.text}</span>
      <button onClick={controller.clearNotice} aria-label="Dismiss notification"><Icon name="close"/></button>
    </div> : null}
    {loadingLiveCatalog ? <main className="catalog-loading" aria-busy="true">
      <Icon name="refresh" />
      <div><h2>Syncing the live catalog</h2><p>Fetching current Shopify product IDs and rebuilding the issue queue before any changes can be drafted or applied.</p></div>
    </main> : <main className="workspace">
      <IssueQueue
        issues={controller.issues}
        totalIssues={controller.audit.issues.length}
        counts={controller.audit.countsBySeverity}
        selectedId={controller.selectedIssue?.id}
        filters={controller.filters}
        onFilters={controller.setFilters}
        onSelect={controller.showIssue}
      />
      <IssueDetail
        issue={controller.selectedIssue}
        product={selectedProduct}
        busy={controller.scanning || controller.busyIssueId === controller.selectedIssue?.id}
        appliedFix={appliedFix}
        onGenerate={controller.generateFix}
        onUpdateDraft={controller.updateDraft}
        onApply={controller.applyFix}
        onDismiss={controller.dismissIssue}
      />
    </main>}
  </div>;
}
