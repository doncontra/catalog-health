import applyFix from "../api/apply-fix";
import verify from "../api/verify";
import type { VercelResponse } from "../api/_lib/vercel";
import { fetchCatalog, fetchProduct } from "../api/_lib/shopify";
import { auditCatalog } from "../src/domain/catalog";
import type { CatalogProduct, FieldChange } from "../src/domain/types";

function responseCapture(): VercelResponse & { statusCode: number; payload?: unknown } {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function unchangedProductShape(product: CatalogProduct) {
  const { descriptionHtml: _descriptionHtml, updatedAt: _updatedAt, ...stable } = product;
  return stable;
}

const beforeCatalog = await fetchCatalog();
const target = beforeCatalog.find((product) =>
  product.tags.includes("catalog-health-seed") && !product.descriptionHtml.trim(),
);
if (!target) throw new Error("No tagged seed product with a missing description is available for the controlled write test.");

const change: FieldChange = {
  field: "descriptionHtml",
  before: target.descriptionHtml,
  after: `<p>${target.title} is a practical outdoor product designed for dependable everyday use. Its straightforward construction, durable materials, and easy-care design make it suitable for commuting, travel, and relaxed weekends outside. Review the available product options to choose the version that best fits your needs.</p>`,
};
const beforeAudit = auditCatalog(beforeCatalog);
const applyResponse = responseCapture();
await applyFix({
  method: "POST",
  body: { productId: target.id, issueId: `${target.id}:missing_description`, changes: [change] },
}, applyResponse);
if (applyResponse.statusCode !== 200) throw new Error(`Apply route failed: ${JSON.stringify(applyResponse.payload)}`);

const verifyResponse = responseCapture();
await verify({
  method: "POST",
  body: { productId: target.id, fields: [change.field], expected: [change] },
}, verifyResponse);
if (verifyResponse.statusCode !== 200) throw new Error(`Verify route failed: ${JSON.stringify(verifyResponse.payload)}`);

const afterProduct = await fetchProduct(target.id);
const afterCatalog = await fetchCatalog();
const afterAudit = auditCatalog(afterCatalog);
const verifyPayload = verifyResponse.payload as { pass?: boolean };

process.stdout.write(`${JSON.stringify({
  productTitle: target.title,
  productId: target.id,
  updatedField: change.field,
  routeApplyStatus: applyResponse.statusCode,
  routeVerifyStatus: verifyResponse.statusCode,
  readBackMatches: verifyPayload.pass === true,
  unrelatedProductFieldsUnchanged: JSON.stringify(unchangedProductShape(target)) === JSON.stringify(unchangedProductShape(afterProduct)),
  missingDescriptionResolved: !afterAudit.issues.some((issue) => issue.productId === target.id && issue.checkId === "missing_description"),
  issueCountBefore: beforeAudit.issues.length,
  issueCountAfter: afterAudit.issues.length,
}, null, 2)}\n`);
