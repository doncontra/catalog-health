import type { VercelRequest, VercelResponse } from "./_lib/vercel";
import type { CatalogProduct, FieldChange } from "../src/domain/types";
import { fail, method } from "./_lib/http";
import { fetchProduct } from "./_lib/shopify";

function liveValue(product: CatalogProduct, field: string, targetId?: string): string {
  if (field === "title" || field === "descriptionHtml" || field === "vendor" || field === "productType" || field === "category") return product[field];
  if (field === "seo.title") return product.seo.title;
  if (field === "seo.description") return product.seo.description;
  if (field === "image.altText") return (product.images.find((image) => image.id === targetId) ?? product.images[0])?.altText ?? "";
  if (field === "variant.barcode") return (product.variants.find((variant) => variant.id === targetId) ?? product.variants[0])?.barcode ?? "";
  if (field === "variant.sku") return (product.variants.find((variant) => variant.id === targetId) ?? product.variants[0])?.sku ?? "";
  throw new Error(`Field ${field} cannot be verified.`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  try {
    const body = req.body as { productId?: string; fields?: string[]; expected?: FieldChange[] };
    if (!body.productId || !body.fields?.length) return fail(res, new Error("productId and fields are required."), 400);
    const product = await fetchProduct(body.productId);
    const values = Object.fromEntries(body.fields.map((field) => {
      const expected = body.expected?.find((change) => change.field === field);
      return [field, liveValue(product, field, expected?.targetId)];
    }));
    const comparisons = (body.expected ?? []).filter((change) => body.fields?.includes(change.field)).map((change) => ({ field: change.field, expected: change.after, actual: liveValue(product, change.field, change.targetId), matches: liveValue(product, change.field, change.targetId) === change.after }));
    res.status(200).json({ pass: comparisons.every((item) => item.matches), productId: product.id, fields: values, comparisons, verifiedAt: new Date().toISOString() });
  } catch (error) { fail(res, error); }
}
