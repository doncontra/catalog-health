import { CHECKS } from "./checks";
import type {
  AgentView,
  AuditResult,
  CatalogIssue,
  CatalogProduct,
  Category,
  FieldChange,
  IssueDelta,
  IssueFilters,
  Severity,
} from "./types";

const SEVERITY_MULTIPLIER: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };
const VAGUE_TYPES = new Set(["footwear", "apparel", "accessories", "misc"]);
const ATTRIBUTE_WORDS = /\b(cotton|wool|leather|mesh|rubber|steel|wood|nylon|polyester|cm|mm|inch|waterproof|lightweight|insulated|recycled|size|color|care|weight|trail|running|hiking)\b/i;
const COLOR_SIZE_TOKEN = /\b(black|white|blue|red|green|navy|sand|tan|small|medium|large|xl|xs|\d+)\b/gi;
const SEARCH_CATEGORIES: Category[] = ["identifiers", "content", "media", "seo", "commercial"];
const AGENT_CATEGORIES: Category[] = ["identifiers", "agent_readiness"];
const CATEGORY_LIST: Category[] = [...SEARCH_CATEGORIES, "agent_readiness"];

function textFromHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(value: string): number {
  const clean = textFromHtml(value);
  return clean ? clean.split(/\s+/).length : 0;
}

function normalTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function looksLikeHandle(product: CatalogProduct): boolean {
  return normalTitle(product.title) === product.handle.replace(/-/g, " ").toLowerCase();
}

function validGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop() ?? 0;
  const total = digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}

function makeIssue(product: CatalogProduct, checkId: string, targetId?: string): CatalogIssue {
  const check = CHECKS[checkId];
  return {
    id: `${product.id}:${checkId}${targetId ? `:${targetId}` : ""}`,
    checkId,
    type: check.label,
    category: check.category,
    severity: check.severity,
    points: check.points,
    impact: check.points * SEVERITY_MULTIPLIER[check.severity] * (product.status === "ACTIVE" ? 2 : 1),
    productId: product.id,
    productTitle: product.title,
    productHandle: product.handle,
    message: check.message,
    field: check.field,
    draftable: Boolean(check.draftable),
    manual: Boolean(check.manual),
    status: "open",
  };
}

function productIssues(product: CatalogProduct): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const custom = product.tags.some((tag) => /custom|handmade/i.test(tag));
  const emptyBarcode = product.variants.find((variant) => !variant.barcode);
  const invalidBarcode = product.variants.find((variant) => variant.barcode && !validGtin(variant.barcode));
  const emptySku = product.variants.find((variant) => !variant.sku);
  if (emptyBarcode && !custom) issues.push(makeIssue(product, "missing_barcode", emptyBarcode.id));
  if (invalidBarcode) issues.push(makeIssue(product, "barcode_not_structured", invalidBarcode.id));
  if (!product.vendor.trim()) issues.push(makeIssue(product, "missing_vendor"));
  if (!product.category.trim()) issues.push(makeIssue(product, "missing_category"));
  if (VAGUE_TYPES.has(product.productType.toLowerCase().trim())) issues.push(makeIssue(product, "vague_taxonomy"));
  if (emptySku) issues.push(makeIssue(product, "missing_sku", emptySku.id));

  const description = textFromHtml(product.descriptionHtml);
  if (!description) issues.push(makeIssue(product, "missing_description"));
  else if (wordCount(description) < 30 || description.length < 200) issues.push(makeIssue(product, "thin_description"));
  if (description && !ATTRIBUTE_WORDS.test(`${product.title} ${description}`) && (description.match(/!/g)?.length ?? 0) > 1) {
    issues.push(makeIssue(product, "marketing_not_literal"));
  }
  if (product.title.length > 70 || product.title === product.title.toUpperCase() || looksLikeHandle(product)) {
    issues.push(makeIssue(product, "title_issues"));
  }

  if (product.images.length === 0) issues.push(makeIssue(product, "no_images"));
  else {
    if (product.images.length === 1) issues.push(makeIssue(product, "single_image"));
    const missingAlt = product.images.find((image) => !image.altText.trim());
    if (missingAlt) issues.push(makeIssue(product, "missing_alt_text", missingAlt.id));
  }

  if (!product.seo.title.trim()) issues.push(makeIssue(product, "missing_seo_title"));
  if (!product.seo.description.trim()) issues.push(makeIssue(product, "missing_seo_description"));
  else if (product.seo.description.length < 70 || product.seo.description.length > 160) issues.push(makeIssue(product, "seo_description_length"));

  const totalInventory = product.variants.reduce((sum, variant) => sum + variant.inventoryQuantity, 0);
  const continuesSelling = product.variants.some((variant) => variant.continueSelling);
  if (product.status === "ACTIVE" && totalInventory === 0 && !continuesSelling) issues.push(makeIssue(product, "active_zero_inventory"));
  const age = Date.now() - new Date(product.updatedAt).getTime();
  if (product.status === "DRAFT" && age > 30 * 86_400_000) issues.push(makeIssue(product, "stale_draft"));

  const hasUnnamedOptions = product.variants.length > 1 && product.variants.some((variant) =>
    variant.selectedOptions.some((option) => /^(title|default title)$/i.test(option.name) || /default title/i.test(option.value)),
  );
  if (hasUnnamedOptions) issues.push(makeIssue(product, "no_variant_options"));
  if (!product.attributes.material && !product.attributes.care && !product.attributes.dimensions) {
    issues.push(makeIssue(product, "attributes_missing"));
  }
  if (product.status === "ACTIVE" && product.variants.some((variant) => variant.price <= 0 || (/sale/i.test(description) && !variant.compareAtPrice))) {
    issues.push(makeIssue(product, "unclear_pricing"));
  }
  return issues;
}

function categoryScore(products: CatalogProduct[], issues: CatalogIssue[], categories: Category[]): number {
  let scoreTotal = 0;
  let weightTotal = 0;
  for (const product of products) {
    const weight = product.status === "ACTIVE" ? 2 : 1;
    const penalty = issues
      .filter((issue) => issue.productId === product.id && categories.includes(issue.category))
      .reduce((sum, issue) => sum + issue.points, 0);
    scoreTotal += Math.max(0, 100 - penalty * 1.65) * weight;
    weightTotal += weight;
  }
  return weightTotal ? Math.round(scoreTotal / weightTotal) : 100;
}

export function auditCatalog(products: CatalogProduct[]): AuditResult {
  const issues = products.flatMap(productIssues);
  const titles = new Map<string, CatalogProduct[]>();
  const variantFamilies = new Map<string, CatalogProduct[]>();

  for (const product of products) {
    const title = normalTitle(product.title);
    titles.set(title, [...(titles.get(title) ?? []), product]);
    const family = title.replace(COLOR_SIZE_TOKEN, "").replace(/\s+/g, " ").trim();
    variantFamilies.set(family, [...(variantFamilies.get(family) ?? []), product]);
  }

  for (const group of titles.values()) {
    if (group.length > 1) group.forEach((product) => issues.push(makeIssue(product, "duplicate_titles")));
  }
  for (const group of variantFamilies.values()) {
    if (group.length >= 3) group.forEach((product) => issues.push(makeIssue(product, "variant_fragmentation")));
  }

  issues.sort((a, b) => b.impact - a.impact || a.productTitle.localeCompare(b.productTitle));
  const search = categoryScore(products, issues, SEARCH_CATEGORIES);
  const agent = categoryScore(products, issues, AGENT_CATEGORIES);
  const byCategory = Object.fromEntries(
    CATEGORY_LIST.map((category) => [category, categoryScore(products, issues, [category])]),
  ) as Record<Category, number>;
  const health = Math.round(search * 0.58 + agent * 0.42);
  const grade = health >= 90 ? "Excellent" : health >= 75 ? "Good" : health >= 60 ? "Needs work" : "At risk";
  return {
    scannedAt: new Date().toISOString(),
    productCount: products.length,
    scores: { health, search, agent, grade, byCategory },
    issues,
    countsBySeverity: {
      critical: issues.filter((issue) => issue.severity === "critical").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
    },
  };
}

function inferCategory(product: CatalogProduct): string {
  const text = `${product.title} ${product.productType}`.toLowerCase();
  if (/shoe|runner|boot|sneaker/.test(text)) return "Apparel & Accessories > Shoes";
  if (/jacket|shirt|tee|hoodie|pant/.test(text)) return "Apparel & Accessories > Clothing";
  if (/bottle|mug|tumbler/.test(text)) return "Home & Garden > Kitchen & Dining > Drinkware";
  if (/pack|bag|tote/.test(text)) return "Luggage & Bags";
  return "Apparel & Accessories";
}

function literalDescription(product: CatalogProduct): string {
  const kind = product.productType && !VAGUE_TYPES.has(product.productType.toLowerCase()) ? product.productType.toLowerCase() : "everyday product";
  const material = product.attributes.material || "durable materials";
  const use = product.attributes.intendedUse || "daily use";
  return `<p>${product.title} is a ${kind} designed for ${use}. Made with ${material}, it balances dependable performance, comfort, and straightforward care. Product options are grouped so shoppers can compare available sizes and colors in one place.</p>`;
}

export function draftIssueFix(product: CatalogProduct, issue: CatalogIssue, tone: "literal" | "brand" = "literal"): FieldChange[] {
  const targetId = issue.id.split(":").at(-1);
  const cleanTitle = product.title.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 70);
  const description = literalDescription(product);
  const brandLead = tone === "brand" ? `<p>Built for the days that keep moving. ${textFromHtml(description)}</p>` : description;
  const changes: Partial<Record<string, FieldChange>> = {
    title: { field: "title", before: product.title, after: cleanTitle },
    descriptionHtml: { field: "descriptionHtml", before: product.descriptionHtml, after: brandLead },
    vendor: { field: "vendor", before: product.vendor, after: "Northstar Supply" },
    productType: { field: "productType", before: product.productType, after: /shoe|runner|boot/i.test(product.title) ? "Trail Running Shoes" : inferCategory(product).split(" > ").at(-1) ?? "General" },
    category: { field: "category", before: product.category, after: inferCategory(product) },
    "seo.title": { field: "seo.title", before: product.seo.title, after: `${cleanTitle} | Northstar Supply`.slice(0, 70) },
    "seo.description": { field: "seo.description", before: product.seo.description, after: `Shop ${cleanTitle}, designed for ${product.attributes.intendedUse || "everyday use"} with ${product.attributes.material || "durable materials"}. Explore available options from Northstar Supply.`.slice(0, 160) },
    "image.altText": { field: "image.altText", before: product.images.find((image) => image.id === targetId)?.altText ?? "", after: `${product.title} product view`, targetId },
  };
  return issue.field && changes[issue.field] ? [changes[issue.field] as FieldChange] : [];
}

export function applyChanges(product: CatalogProduct, changes: FieldChange[]): CatalogProduct {
  const next = structuredClone(product);
  for (const change of changes) {
    if (change.field === "title" || change.field === "descriptionHtml" || change.field === "vendor" || change.field === "productType" || change.field === "category") next[change.field] = change.after;
    if (change.field === "seo.title") next.seo.title = change.after;
    if (change.field === "seo.description") next.seo.description = change.after;
    if (change.field === "image.altText") {
      const image = next.images.find((item) => item.id === change.targetId) ?? next.images[0];
      if (image) image.altText = change.after;
    }
    if (change.field === "variant.barcode") {
      const variant = next.variants.find((item) => item.id === change.targetId) ?? next.variants[0];
      if (variant) variant.barcode = change.after;
    }
    if (change.field === "variant.sku") {
      const variant = next.variants.find((item) => item.id === change.targetId) ?? next.variants[0];
      if (variant) variant.sku = change.after;
    }
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

export function filterIssues(issues: CatalogIssue[], filters: IssueFilters = {}): CatalogIssue[] {
  return issues
    .filter((issue) => !filters.severity || issue.severity === filters.severity)
    .filter((issue) => !filters.category || issue.category === filters.category)
    .filter((issue) => !filters.productId || issue.productId === filters.productId)
    .slice(0, filters.limit ?? 20);
}

export function compareProductIssues(before: AuditResult, after: AuditResult, productId: string): IssueDelta {
  const beforeIssues = before.issues.filter((issue) => issue.productId === productId);
  const afterIssues = after.issues.filter((issue) => issue.productId === productId);
  const beforeIds = new Set(beforeIssues.map((issue) => issue.id));
  const afterIds = new Set(afterIssues.map((issue) => issue.id));
  const addedIssues = afterIssues.filter((issue) => !beforeIds.has(issue.id));

  return {
    resolved: beforeIssues.filter((issue) => !afterIds.has(issue.id)).length,
    added: addedIssues.length,
    addedBySeverity: {
      critical: addedIssues.filter((issue) => issue.severity === "critical").length,
      warning: addedIssues.filter((issue) => issue.severity === "warning").length,
      info: addedIssues.filter((issue) => issue.severity === "info").length,
    },
  };
}

export function buildAgentView(product: CatalogProduct, pendingChanges: FieldChange[] = []): AgentView {
  const pending = pendingChanges.length ? applyChanges(product, pendingChanges) : product;
  const content = `${pending.title} ${textFromHtml(pending.descriptionHtml)}`;
  const benefits = [
    pending.attributes.material ? `${pending.attributes.material} construction` : "",
    /waterproof/i.test(content) ? "waterproof protection" : "",
    /lightweight/i.test(content) ? "lightweight" : "",
    /durable/i.test(content) ? "durable" : "",
  ].filter(Boolean);
  const complete = pending.variants.filter((variant) => variant.barcode && variant.sku).length;
  const missingFields = [
    !pending.category && "category",
    !pending.attributes.material && "material",
    !pending.attributes.care && "care",
    !pending.attributes.dimensions && "dimensions",
    complete < pending.variants.length && "variant identifiers",
  ].filter(Boolean) as string[];
  return {
    productId: pending.id,
    title: pending.title,
    literalTitle: ATTRIBUTE_WORDS.test(content),
    productType: pending.productType || pending.category || "Unclassified",
    intendedUse: pending.attributes.intendedUse || "Not stated",
    keyBenefits: benefits.length ? benefits : ["Not enough structured detail"],
    material: pending.attributes.material || "Not stated",
    care: pending.attributes.care || "Not stated",
    variantGrouping: pending.variants.length > 1 && pending.variants.some((variant) => variant.selectedOptions.some((option) => /default title/i.test(option.value))) ? "unclear" : "clear",
    identifiers: { complete, total: pending.variants.length },
    missingFields,
  };
}
