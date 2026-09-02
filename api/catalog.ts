import type { VercelRequest, VercelResponse } from "./_lib/vercel";
import { fail, method } from "./_lib/http";
import { fetchCatalog } from "./_lib/shopify";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "GET")) return;
  try { res.status(200).json(await fetchCatalog()); }
  catch (error) { fail(res, error); }
}
