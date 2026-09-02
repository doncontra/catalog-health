import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS } from "../data/demoCatalog";
import { applyChanges, auditCatalog, buildAgentView, compareProductIssues, draftIssueFix } from "./catalog";
import { CHECKS } from "./checks";

describe("catalog audit", () => {
  it("ranks the deterministic 30-product demo catalog", () => {
    const audit = auditCatalog(DEMO_PRODUCTS);
    expect(audit.productCount).toBe(30);
    expect(audit.issues.length).toBeGreaterThan(50);
    expect(audit.scores.health).toBeGreaterThanOrEqual(45);
    expect(audit.scores.health).toBeLessThan(80);
    expect(audit.issues).toEqual([...audit.issues].sort((a, b) => b.impact - a.impact || a.productTitle.localeCompare(b.productTitle)));
  });

  it("plants at least two specimens for every implemented check", () => {
    const audit = auditCatalog(DEMO_PRODUCTS);
    for (const checkId of Object.keys(CHECKS)) {
      expect(audit.issues.filter((issue) => issue.checkId === checkId).length, checkId).toBeGreaterThanOrEqual(2);
    }
  });

  it("drafts and applies only the affected field", () => {
    const audit = auditCatalog(DEMO_PRODUCTS);
    const issue = audit.issues.find((item) => item.draftable && item.field === "descriptionHtml");
    expect(issue).toBeDefined();
    const product = DEMO_PRODUCTS.find((item) => item.id === issue!.productId)!;
    const changes = draftIssueFix(product, issue!);
    const updated = applyChanges(product, changes);
    expect(updated.descriptionHtml).not.toBe(product.descriptionHtml);
    expect(updated.title).toBe(product.title);
  });

  it("shows pending changes in the agent view without mutating source data", () => {
    const product = DEMO_PRODUCTS[0];
    const before = buildAgentView(product);
    const after = buildAgentView(product, [{ field: "category", before: "", after: "Apparel & Accessories > Shoes" }]);
    expect(before.missingFields).toContain("category");
    expect(after.missingFields).not.toContain("category");
    expect(product.category).toBe("");
  });

  it("explains when a resolved issue is replaced by a lesser re-audit issue", () => {
    const before = auditCatalog(DEMO_PRODUCTS);
    const issue = before.issues.find((item) => item.checkId === "missing_description")!;
    const product = DEMO_PRODUCTS.find((item) => item.id === issue.productId)!;
    const updated = applyChanges(product, [{ field: "descriptionHtml", before: "", after: "<p>Short but present.</p>" }]);
    const after = auditCatalog(DEMO_PRODUCTS.map((item) => item.id === product.id ? updated : item));
    const delta = compareProductIssues(before, after, product.id);

    expect(delta.resolved).toBe(1);
    expect(delta.added).toBe(1);
    expect(delta.addedBySeverity.warning).toBe(1);
  });
});
