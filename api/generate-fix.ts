import type { VercelRequest, VercelResponse } from "./_lib/vercel";
import { draftIssueFix } from "../src/domain/catalog";
import type { CatalogIssue, CatalogProduct, FieldChange } from "../src/domain/types";
import { fail, method } from "./_lib/http";

type ResponsePayload = { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

async function draftWithOpenAI(product: CatalogProduct, issue: CatalogIssue, tone: "literal" | "brand", fallback: FieldChange[]): Promise<FieldChange[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !fallback.length) return fallback;
  const base = fallback[0];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      max_output_tokens: 700,
      input: [
        { role: "system", content: "You draft safe Shopify catalog field updates. Be concrete, literal, attribute-rich, concise, and truthful. Never invent certifications, measurements, identifiers, materials, or performance claims. Return JSON only." },
        { role: "user", content: JSON.stringify({ task: "Rewrite only the requested field", tone, field: base.field, currentValue: base.before, deterministicStartingPoint: base.after, issue: { type: issue.type, message: issue.message }, product: { title: product.title, vendor: product.vendor, productType: product.productType, category: product.category, attributes: product.attributes, tags: product.tags } }) },
      ],
      text: { format: { type: "json_schema", name: "catalog_field_draft", strict: true, schema: { type: "object", additionalProperties: false, properties: { after: { type: "string" } }, required: ["after"] } } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI drafting failed (${response.status}).`);
  const payload = await response.json() as ResponsePayload;
  const text = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no draft text.");
  const parsed = JSON.parse(text) as { after?: string };
  if (!parsed.after?.trim()) throw new Error("OpenAI returned an empty draft.");
  return [{ ...base, after: parsed.after.trim() }];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  try {
    const body = req.body as { product?: CatalogProduct; issue?: CatalogIssue; tone?: "literal" | "brand" };
    if (!body.product || !body.issue) return fail(res, new Error("product and issue are required."), 400);
    const fallback = draftIssueFix(body.product, body.issue, body.tone ?? "literal");
    if (!fallback.length) return fail(res, new Error("This issue is not auto-draftable."), 400);
    try {
      const changes = await draftWithOpenAI(body.product, body.issue, body.tone ?? "literal", fallback);
      res.status(200).json({ changes, source: process.env.OPENAI_API_KEY ? "openai" : "template" });
    } catch (error) {
      res.status(200).json({ changes: fallback, source: "template", fallbackReason: error instanceof Error ? error.message : "OpenAI unavailable." });
    }
  } catch (error) { fail(res, error); }
}
