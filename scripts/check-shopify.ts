import { fetchCatalog, getShopifyAccess } from "../api/_lib/shopify";
import { auditCatalog } from "../src/domain/catalog";

const access = await getShopifyAccess();
const products = await fetchCatalog();
const audit = auditCatalog(products);

process.stdout.write(`${JSON.stringify({
  shop: access.shop,
  scopes: access.scopes,
  productCount: products.length,
  seededProductCount: products.filter((product) => product.tags.includes("catalog-health-seed")).length,
  scores: audit.scores,
  issueCount: audit.issues.length,
  countsBySeverity: audit.countsBySeverity,
  topIssues: audit.issues.slice(0, 5).map((issue) => ({
    checkId: issue.checkId,
    severity: issue.severity,
    productTitle: issue.productTitle,
    field: issue.field,
  })),
}, null, 2)}\n`);
