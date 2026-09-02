import applyFix from "../api/apply-fix";
import verify from "../api/verify";
import type { VercelResponse } from "../api/_lib/vercel";
import { fetchCatalog, fetchProduct, shopifyGraphql } from "../api/_lib/shopify";
import type { CatalogProduct, EditableField, FieldChange } from "../src/domain/types";

function responseCapture(): VercelResponse & { statusCode: number; payload?: unknown } {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

async function applyAndVerify(product: CatalogProduct, change: FieldChange) {
  if (!product.tags.includes("catalog-health-seed")) throw new Error("Controlled write target is not a tagged seed product.");
  const applyResponse = responseCapture();
  await applyFix({
    method: "POST",
    body: { productId: product.id, issueId: `${product.id}:live_test:${change.field}`, changes: [change] },
  }, applyResponse);
  if (applyResponse.statusCode !== 200) throw new Error(`Apply ${change.field} failed: ${JSON.stringify(applyResponse.payload)}`);

  const verifyResponse = responseCapture();
  await verify({
    method: "POST",
    body: { productId: product.id, fields: [change.field], expected: [change] },
  }, verifyResponse);
  const payload = verifyResponse.payload as { pass?: boolean };
  if (verifyResponse.statusCode !== 200 || payload.pass !== true) {
    throw new Error(`Verify ${change.field} failed: ${JSON.stringify(verifyResponse.payload)}`);
  }
  return { field: change.field, productTitle: product.title, applyStatus: applyResponse.statusCode, verifyStatus: verifyResponse.statusCode, pass: true };
}

function distinctProduct(products: CatalogProduct[], used: Set<string>, predicate: (product: CatalogProduct) => boolean): CatalogProduct {
  const product = products.find((candidate) => candidate.tags.includes("catalog-health-seed") && !used.has(candidate.id) && predicate(candidate));
  if (!product) throw new Error("No suitable tagged seed product is available for the controlled mutation test.");
  used.add(product.id);
  return product;
}

const products = await fetchCatalog();
const used = new Set<string>();
const results: Array<{ field: EditableField; productTitle: string; applyStatus: number; verifyStatus: number; pass: boolean }> = [];

const seoProduct = distinctProduct(products, used, (product) => !product.seo.title.trim());
results.push(await applyAndVerify(seoProduct, {
  field: "seo.title",
  before: seoProduct.seo.title,
  after: `${seoProduct.title} | Live Verification`.slice(0, 70),
}));

const categoryProduct = distinctProduct(products, used, (product) => !product.category.trim());
results.push(await applyAndVerify(categoryProduct, {
  field: "category",
  before: categoryProduct.category,
  after: /runner|boot/i.test(categoryProduct.title) ? "Apparel & Accessories > Shoes" : "Apparel & Accessories > Clothing",
}));

const skuProduct = distinctProduct(products, used, (product) => product.variants.some((variant) => !variant.sku.trim()));
const skuVariant = skuProduct.variants.find((variant) => !variant.sku.trim())!;
results.push(await applyAndVerify(skuProduct, {
  field: "variant.sku",
  before: skuVariant.sku,
  after: `LIVE-${skuProduct.id.split("/").at(-1)}`,
  targetId: skuVariant.id,
}));

const mediaProduct = distinctProduct(products, used, (product) => product.images.length === 0);
const mediaData = await shopifyGraphql<{
  productUpdate: {
    product?: { media: { nodes: Array<{ id: string; alt?: string }> } };
    userErrors: Array<{ message: string }>;
  };
}>(`mutation AddVerificationMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product { media(first: 10) { nodes { id alt } } }
    userErrors { message }
  }
}`, {
  product: { id: mediaProduct.id },
  media: [{
    originalSource: "https://cdn.shopify.com/shopifycloud/brochure/assets/sell/image/image-@artdirection-large-1ba8d5de56c361cec6bc487b747c8774b9ec8203f392a99f53c028df8d0fb3fc.png",
    alt: "",
    mediaContentType: "IMAGE",
  }],
});
if (mediaData.productUpdate.userErrors.length) throw new Error(mediaData.productUpdate.userErrors.map((error) => error.message).join("; "));

let mediaReady: CatalogProduct | undefined;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const current = await fetchProduct(mediaProduct.id);
  if (current.images.length) { mediaReady = current; break; }
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}
if (!mediaReady?.images[0]) throw new Error("Shopify media processing did not finish within 30 seconds.");
results.push(await applyAndVerify(mediaReady, {
  field: "image.altText",
  before: mediaReady.images[0].altText,
  after: `${mediaReady.title} product view`,
  targetId: mediaReady.images[0].id,
}));

process.stdout.write(`${JSON.stringify({
  testedMutationFamilies: results.length,
  allPassed: results.every((result) => result.pass),
  results,
}, null, 2)}\n`);
