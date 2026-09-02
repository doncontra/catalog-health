import type { VercelRequest, VercelResponse } from "./_lib/vercel";
import { auditCatalog } from "../src/domain/catalog";
import type { CatalogProduct } from "../src/domain/types";
import { fail, method } from "./_lib/http";
import { fetchCatalog } from "./_lib/shopify";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  try {
    const supplied = (req.body as { products?: CatalogProduct[] } | undefined)?.products;
    const products = Array.isArray(supplied) ? supplied : await fetchCatalog();
    res.status(200).json(auditCatalog(products));
  } catch (error) { fail(res, error); }
}
