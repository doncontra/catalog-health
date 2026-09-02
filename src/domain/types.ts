export type Severity = "critical" | "warning" | "info";
export type Category =
  | "identifiers"
  | "content"
  | "media"
  | "seo"
  | "commercial"
  | "agent_readiness";

export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

export interface CatalogVariant {
  id: string;
  title: string;
  sku: string;
  barcode: string;
  price: number;
  compareAtPrice?: number;
  inventoryQuantity: number;
  continueSelling: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface CatalogImage {
  id: string;
  url: string;
  altText: string;
}

export interface CatalogProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  category: string;
  tags: string[];
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  seo: { title: string; description: string };
  images: CatalogImage[];
  variants: CatalogVariant[];
  attributes: {
    material?: string;
    care?: string;
    dimensions?: string;
    intendedUse?: string;
  };
}

export interface CheckDefinition {
  id: string;
  label: string;
  category: Category;
  severity: Severity;
  points: number;
  message: string;
  field?: EditableField;
  draftable?: boolean;
  manual?: boolean;
}

export type EditableField =
  | "title"
  | "descriptionHtml"
  | "vendor"
  | "productType"
  | "category"
  | "seo.title"
  | "seo.description"
  | "image.altText"
  | "variant.barcode"
  | "variant.sku";

export interface FieldChange {
  field: EditableField;
  before: string;
  after: string;
  targetId?: string;
}

export interface CatalogIssue {
  id: string;
  checkId: string;
  type: string;
  category: Category;
  severity: Severity;
  points: number;
  impact: number;
  productId: string;
  productTitle: string;
  productHandle: string;
  message: string;
  field?: EditableField;
  draftable: boolean;
  manual: boolean;
  changes?: FieldChange[];
  status: "open" | "drafted" | "resolved" | "dismissed";
}

export interface AuditScores {
  health: number;
  search: number;
  agent: number;
  grade: "Excellent" | "Good" | "Needs work" | "At risk";
  byCategory: Record<Category, number>;
}

export interface AuditResult {
  scannedAt: string;
  productCount: number;
  scores: AuditScores;
  issues: CatalogIssue[];
  countsBySeverity: Record<Severity, number>;
}

export interface IssueDelta {
  resolved: number;
  added: number;
  addedBySeverity: Record<Severity, number>;
}

export interface AgentView {
  productId: string;
  title: string;
  literalTitle: boolean;
  productType: string;
  intendedUse: string;
  keyBenefits: string[];
  material: string;
  care: string;
  variantGrouping: "clear" | "unclear";
  identifiers: { complete: number; total: number };
  missingFields: string[];
}

export interface AppliedFix {
  issueId: string;
  productId: string;
  changes: FieldChange[];
  appliedAt: string;
  verified: boolean;
}

export interface IssueFilters {
  severity?: Severity;
  category?: Category;
  productId?: string;
  limit?: number;
}
