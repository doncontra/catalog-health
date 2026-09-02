import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { freshDemoCatalog } from "../data/demoCatalog";
import { applyChanges, auditCatalog, buildAgentView, compareProductIssues, draftIssueFix, filterIssues } from "../domain/catalog";
import type {
  AgentView,
  AppliedFix,
  AuditResult,
  CatalogIssue,
  CatalogProduct,
  FieldChange,
  IssueDelta,
  IssueFilters,
  Severity,
} from "../domain/types";

const LIVE_API = import.meta.env.VITE_USE_LIVE_API === "true";
const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.text();
    let message = detail;
    try {
      const payload = JSON.parse(detail) as { error?: string };
      message = payload.error ?? detail;
    } catch {
      // Non-JSON failures already contain the most useful available detail.
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

const isDemoProductId = (productId: string) => productId.startsWith("gid://shopify/Product/demo-");

const severityNames: Record<Severity, [singular: string, plural: string]> = {
  critical: ["critical issue", "critical issues"],
  warning: ["warning", "warnings"],
  info: ["informational issue", "informational issues"],
};

function describeIssueDelta(delta: IssueDelta): string {
  if (!delta.added) return "";
  const breakdown = (Object.entries(delta.addedBySeverity) as Array<[Severity, number]>)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${count} ${severityNames[severity][count === 1 ? 0 : 1]}`);
  const additions = delta.added === 1 ? breakdown[0] : `${delta.added} new issues (${breakdown.join(", ")})`;
  return ` Re-audit resolved ${delta.resolved} issue${delta.resolved === 1 ? "" : "s"} and detected ${delta.added === 1 ? `1 new ${additions.replace(/^1 /, "")}` : additions}.`;
}

export interface CatalogController {
  products: CatalogProduct[];
  audit: AuditResult;
  issues: CatalogIssue[];
  selectedIssue?: CatalogIssue;
  filters: IssueFilters;
  scanning: boolean;
  busyIssueId?: string;
  mode: "demo" | "live";
  notice?: { kind: "success" | "error" | "info"; text: string };
  appliedFixes: AppliedFix[];
  setFilters: (filters: IssueFilters) => void;
  clearNotice: () => void;
  scanCatalog: () => Promise<AuditResult>;
  getHealthScore: () => AuditResult["scores"];
  listIssues: (filters?: IssueFilters) => CatalogIssue[];
  showIssue: (issueId: string) => CatalogIssue;
  generateFix: (issueId: string, tone?: "literal" | "brand") => Promise<FieldChange[]>;
  updateDraft: (issueId: string, field: FieldChange["field"], value: string) => FieldChange[];
  applyFix: (issueId: string, overrides?: Array<{ field: FieldChange["field"]; value: string }>) => Promise<AppliedFix>;
  applyApproved: (issueIds: string[]) => Promise<Array<{ issueId: string; ok: boolean; error?: string }>>;
  dismissIssue: (issueId: string, reason?: string) => CatalogIssue;
  verifyFix: (productId: string, fields: string[]) => Promise<{ pass: boolean; productId: string; fields: Record<string, string>; verifiedAt: string }>;
  previewAgentView: (productId: string) => { before: AgentView; after: AgentView };
}

export function useCatalogController(): CatalogController {
  const [products, setProducts] = useState<CatalogProduct[]>(() => LIVE_API ? [] : freshDemoCatalog());
  const [audit, setAudit] = useState<AuditResult>(() => auditCatalog(LIVE_API ? [] : freshDemoCatalog()));
  const [selectedIssueId, setSelectedIssueId] = useState<string>(() => audit.issues.find((issue) => issue.draftable)?.id ?? audit.issues[0]?.id ?? "");
  const [selectedSnapshot, setSelectedSnapshot] = useState<CatalogIssue>();
  const [drafts, setDrafts] = useState<Record<string, FieldChange[]>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [appliedFixes, setAppliedFixes] = useState<AppliedFix[]>([]);
  const [filters, setFilters] = useState<IssueFilters>({ limit: 100 });
  const [scanning, setScanning] = useState(LIVE_API);
  const [busyIssueId, setBusyIssueId] = useState<string>();
  const [notice, setNotice] = useState<CatalogController["notice"]>(LIVE_API
    ? { kind: "info", text: "Loading the latest catalog from Shopify…" }
    : undefined);
  const initialScanStartedRef = useRef(false);
  const productsRef = useRef(products);
  const auditRef = useRef(audit);
  const draftsRef = useRef(drafts);
  const dismissedRef = useRef(dismissed);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { auditRef.current = audit; }, [audit]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => { dismissedRef.current = dismissed; }, [dismissed]);

  const allIssues = useMemo(() => audit.issues
    .filter((issue) => !dismissed.has(issue.id))
    .map((issue) => drafts[issue.id] ? { ...issue, changes: drafts[issue.id], status: "drafted" as const } : issue), [audit.issues, dismissed, drafts]);
  const issues = useMemo(() => filterIssues(allIssues, filters), [allIssues, filters]);
  const selectedIssue = allIssues.find((issue) => issue.id === selectedIssueId) ?? selectedSnapshot;

  const scanCatalog = useCallback(async () => {
    setScanning(true);
    setNotice({ kind: "info", text: "Scanning product fields, variants, media, and search data…" });
    try {
      const nextProducts = LIVE_API
        ? await api<CatalogProduct[]>("/api/catalog")
        : (await delay(420), productsRef.current);
      const nextAudit = LIVE_API
        ? await api<AuditResult>("/api/audit", { method: "POST", body: JSON.stringify({ products: nextProducts }) })
        : auditCatalog(nextProducts);
      setProducts(nextProducts);
      setAudit(nextAudit);
      if (!nextAudit.issues.some((issue) => issue.id === selectedIssueId)) setSelectedIssueId(nextAudit.issues.find((issue) => issue.draftable)?.id ?? nextAudit.issues[0]?.id ?? "");
      setNotice({ kind: "success", text: `Scan complete — ${nextAudit.issues.length} issues ranked across ${nextAudit.productCount} products.` });
      return nextAudit;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "The catalog scan failed." });
      throw error;
    } finally {
      setScanning(false);
    }
  }, [selectedIssueId]);

  useEffect(() => {
    if (!LIVE_API || initialScanStartedRef.current) return;
    initialScanStartedRef.current = true;
    void scanCatalog().catch(() => undefined);
  }, [scanCatalog]);

  const getHealthScore = useCallback(() => auditRef.current.scores, []);
  const listIssues = useCallback((nextFilters: IssueFilters = {}) => {
    const open = auditRef.current.issues.filter((issue) => !dismissedRef.current.has(issue.id));
    return filterIssues(open.map((issue) => draftsRef.current[issue.id] ? { ...issue, changes: draftsRef.current[issue.id], status: "drafted" as const } : issue), nextFilters);
  }, []);

  const showIssue = useCallback((issueId: string) => {
    const issue = auditRef.current.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue ${issueId} is not in the current audit.`);
    setSelectedIssueId(issueId);
    setSelectedSnapshot(undefined);
    document.querySelector("#issue-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return draftsRef.current[issueId] ? { ...issue, changes: draftsRef.current[issueId], status: "drafted" as const } : issue;
  }, []);

  const generateFix = useCallback(async (issueId: string, tone: "literal" | "brand" = "literal") => {
    const issue = auditRef.current.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue ${issueId} is not in the current audit.`);
    if (!issue.draftable) throw new Error(issue.manual ? "This issue needs merchant-supplied data before it can be applied." : "This issue provides guidance and cannot be auto-applied.");
    const product = productsRef.current.find((item) => item.id === issue.productId);
    if (!product) throw new Error("The affected product could not be found.");
    setBusyIssueId(issueId);
    try {
      const changes = LIVE_API
        ? (await api<{ changes: FieldChange[] }>("/api/generate-fix", { method: "POST", body: JSON.stringify({ product, issue, tone }) })).changes
        : (await delay(380), draftIssueFix(product, issue, tone));
      setDrafts((current) => {
        const next = { ...current, [issueId]: changes };
        draftsRef.current = next;
        return next;
      });
      setSelectedIssueId(issueId);
      setSelectedSnapshot({ ...issue, changes, status: "drafted" });
      setNotice({ kind: "success", text: "Draft ready for review. Nothing has been written to Shopify." });
      return changes;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? `Draft failed: ${error.message}` : "The draft could not be generated." });
      throw error;
    } finally {
      setBusyIssueId(undefined);
    }
  }, []);

  const updateDraft = useCallback((issueId: string, field: FieldChange["field"], value: string) => {
    const existing = draftsRef.current[issueId];
    if (!existing) throw new Error("Generate a draft before editing it.");
    const nextChanges = existing.map((change) => change.field === field ? { ...change, after: value } : change);
    setDrafts((current) => {
      const next = { ...current, [issueId]: nextChanges };
      draftsRef.current = next;
      return next;
    });
    return nextChanges;
  }, []);

  const verifyFix = useCallback(async (productId: string, fields: string[]) => {
    const product = productsRef.current.find((item) => item.id === productId);
    if (!product) throw new Error("The product could not be found for verification.");
    const expected = [...appliedFixes].reverse().find((fix) => fix.productId === productId)?.changes ?? [];
    if (LIVE_API) return api<{ pass: boolean; productId: string; fields: Record<string, string>; verifiedAt: string }>("/api/verify", {
      method: "POST",
      body: JSON.stringify({ productId, fields, expected }),
    });
    await delay(220);
    const values = Object.fromEntries(fields.map((field) => {
      const change = expected.find((item) => item.field === field);
      return [field, change?.after ?? "Verified in demo catalog"];
    }));
    return { pass: true, productId, fields: values, verifiedAt: new Date().toISOString() };
  }, [appliedFixes]);

  const applyFix = useCallback(async (issueId: string, overrides: Array<{ field: FieldChange["field"]; value: string }> = []) => {
    const issue = auditRef.current.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue ${issueId} is not in the current audit.`);
    const product = productsRef.current.find((item) => item.id === issue.productId);
    if (!product) throw new Error("The affected product could not be found.");
    if (LIVE_API && isDemoProductId(product.id)) {
      const error = new Error("This issue came from an expired demo audit. Rescan the live catalog, then review the current issue before applying it.");
      setNotice({ kind: "error", text: error.message });
      throw error;
    }
    const baseChanges = draftsRef.current[issueId];
    if (!baseChanges?.length) throw new Error("Generate and review a draft before applying this issue.");
    const changes = baseChanges.map((change) => {
      const override = overrides.find((item) => item.field === change.field);
      return override ? { ...change, after: override.value } : change;
    });
    setBusyIssueId(issueId);
    try {
      if (LIVE_API) await api("/api/apply-fix", { method: "POST", body: JSON.stringify({ productId: product.id, issueId, changes }) });
      else await delay(420);
      const previousAudit = auditRef.current;
      const updated = applyChanges(product, changes);
      const nextProducts = productsRef.current.map((item) => item.id === product.id ? updated : item);
      const nextAudit = auditCatalog(nextProducts);
      const issueDelta = compareProductIssues(previousAudit, nextAudit, product.id);
      const applied: AppliedFix = { issueId, productId: product.id, changes, appliedAt: new Date().toISOString(), verified: false };
      setProducts(nextProducts);
      productsRef.current = nextProducts;
      setAudit(nextAudit);
      auditRef.current = nextAudit;
      setSelectedSnapshot({ ...issue, changes, status: "resolved" });
      setAppliedFixes((current) => [applied, ...current]);
      const verification = LIVE_API
        ? await api<{ pass: boolean }>("/api/verify", { method: "POST", body: JSON.stringify({ productId: product.id, fields: changes.map((change) => change.field), expected: changes }) })
        : (await delay(180), { pass: true });
      const verified = { ...applied, verified: verification.pass };
      setAppliedFixes((current) => current.map((item) => item.issueId === issueId ? verified : item));
      setNotice({ kind: verification.pass ? "success" : "error", text: verification.pass ? `Applied and verified ${changes.length} field update${changes.length === 1 ? "" : "s"}.${describeIssueDelta(issueDelta)}` : "The write completed, but verification did not match." });
      return verified;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? `Apply failed: ${error.message}` : "The approved change could not be applied." });
      throw error;
    } finally {
      setBusyIssueId(undefined);
    }
  }, []);

  const applyApproved = useCallback(async (issueIds: string[]) => {
    if (issueIds.length > 10) throw new Error("apply_approved accepts at most 10 issues.");
    const results: Array<{ issueId: string; ok: boolean; error?: string }> = [];
    for (const issueId of issueIds) {
      if (!draftsRef.current[issueId]) {
        results.push({ issueId, ok: false, error: "Skipped: no reviewed draft." });
        continue;
      }
      try {
        await applyFix(issueId);
        results.push({ issueId, ok: true });
      } catch (error) {
        results.push({ issueId, ok: false, error: error instanceof Error ? error.message : "Apply failed." });
      }
      await delay(100);
    }
    return results;
  }, [applyFix]);

  const dismissIssue = useCallback((issueId: string, reason?: string) => {
    const issue = auditRef.current.issues.find((item) => item.id === issueId);
    if (!issue) throw new Error(`Issue ${issueId} is not in the current audit.`);
    setDismissed((current) => {
      const next = new Set(current).add(issueId);
      dismissedRef.current = next;
      return next;
    });
    setSelectedSnapshot({ ...issue, status: "dismissed" });
    setNotice({ kind: "info", text: reason ? `Dismissed: ${reason}` : "Issue dismissed for this session." });
    return { ...issue, status: "dismissed" as const };
  }, []);

  const previewAgentView = useCallback((productId: string) => {
    const product = productsRef.current.find((item) => item.id === productId);
    if (!product) throw new Error("The product could not be found.");
    const changes = Object.entries(draftsRef.current)
      .filter(([issueId]) => auditRef.current.issues.find((issue) => issue.id === issueId)?.productId === productId)
      .flatMap(([, values]) => values);
    return { before: buildAgentView(product), after: buildAgentView(product, changes) };
  }, []);

  return {
    products, audit, issues, selectedIssue, filters, scanning, busyIssueId,
    mode: LIVE_API ? "live" : "demo", notice, appliedFixes,
    setFilters, clearNotice: () => setNotice(undefined), scanCatalog, getHealthScore,
    listIssues, showIssue, generateFix, updateDraft, applyFix, applyApproved,
    dismissIssue, verifyFix, previewAgentView,
  };
}
