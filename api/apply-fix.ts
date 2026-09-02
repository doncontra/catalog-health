import type { VercelRequest, VercelResponse } from "./_lib/vercel";
import type { EditableField, FieldChange } from "../src/domain/types";
import { fail, method } from "./_lib/http";
import { applyProductChanges } from "./_lib/shopify";
import { MutationPolicyError, requireLiveWritesEnabled } from "./_lib/mutationPolicy";

const ALLOWED_FIELDS = new Set<EditableField>(["title", "descriptionHtml", "vendor", "productType", "category", "seo.title", "seo.description", "image.altText", "variant.barcode", "variant.sku"]);
const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;

function validate(productId: string, changes: FieldChange[]): void {
  if (!PRODUCT_GID.test(productId)) throw new Error("productId must be a numeric Shopify Product GID.");
  if (!Array.isArray(changes) || !changes.length || changes.length > 10) throw new Error("Provide between 1 and 10 field changes.");
  for (const change of changes) {
    if (!ALLOWED_FIELDS.has(change.field)) throw new Error(`Field ${change.field} is not writeable.`);
    if (typeof change.after !== "string" || change.after.length > 20_000) throw new Error(`Invalid value for ${change.field}.`);
    if ((change.field.startsWith("image.") || change.field.startsWith("variant.")) && !change.targetId) throw new Error(`${change.field} requires a targetId.`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  const mutationId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let productId: string | undefined;
  let issueId: string | undefined;
  let changes: FieldChange[] | undefined;
  try {
    const body = req.body as { productId?: string; issueId?: string; changes?: FieldChange[] };
    if (!body.productId || !body.issueId || !body.changes) return fail(res, new Error("productId, issueId, and changes are required."), 400);
    productId = body.productId;
    issueId = body.issueId;
    changes = body.changes;
    validate(productId, changes);
    requireLiveWritesEnabled();
    console.log(JSON.stringify({ event: "catalog_mutation", outcome: "started", mutationId, startedAt, productId, issueId, fields: changes.map((change) => change.field), targets: changes.map((change) => change.targetId).filter(Boolean) }));
    await applyProductChanges(productId, changes, { mutationId, issueId });
    const appliedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: "catalog_mutation", outcome: "succeeded", mutationId, startedAt, appliedAt, productId, issueId, fields: changes.map((change) => change.field) }));
    res.status(200).json({ mutationId, issueId, productId, updatedFields: changes.map((change) => ({ field: change.field, value: change.after, targetId: change.targetId })), appliedAt });
  } catch (error) {
    const status = error instanceof MutationPolicyError
      ? error.status
      : error instanceof Error && /required|productId|writeable|Invalid|between/.test(error.message) ? 400 : 500;
    console.error(JSON.stringify({ event: "catalog_mutation", outcome: "rejected", mutationId, startedAt, failedAt: new Date().toISOString(), productId, issueId, fields: changes?.map((change) => change.field), status, error: error instanceof Error ? error.message : "Unknown error" }));
    fail(res, error, status);
  }
}
