import { Icon } from "./Icons";

interface TopBarProps {
  mode: "demo" | "live";
  scanning: boolean;
  scannedAt: string;
  webMcpAvailable: boolean;
  onScan: () => void;
}

export function TopBar({ mode, scanning, scannedAt, webMcpAvailable, onScan }: TopBarProps) {
  return <header className="topbar">
    <div className="brand">Catalog Health</div>
    <div className="store-identity"><Icon name="store" /><span>Northstar Supply</span></div>
    <div className="topbar-spacer" />
    <div className="connection"><span className={`status-dot ${mode}`} />{mode === "live" ? "Live store" : "Demo catalog"}</div>
    <div className="webmcp-state" role="status" title={webMcpAvailable ? "WebMCP tools registered" : "Agent tools are unavailable; all features remain available through the UI"}>
      {webMcpAvailable ? "Agent tools active" : "UI-only mode"}
    </div>
    <button className="button secondary compact" onClick={onScan} disabled={scanning}>
      <Icon name="refresh" />{scanning ? "Scanning…" : "Rescan catalog"}
    </button>
    <span className="last-scan">Scanned {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(scannedAt))}</span>
  </header>;
}
