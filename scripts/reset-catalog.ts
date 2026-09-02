import { shopifyGraphql as graphql } from "../api/_lib/shopify";
import { SEED_PRODUCT_TAG } from "../api/_lib/mutationPolicy";
import { DEMO_PRODUCTS } from "../src/data/demoCatalog";
import { listSeedProducts, seedCatalog } from "./_lib/seedCatalog";

if (!process.argv.includes("--confirm-seed-only")) {
  throw new Error("Reset not confirmed. Run: npm run reset:catalog -- --confirm-seed-only");
}

const before = await listSeedProducts();
process.stdout.write(`${JSON.stringify({ event: "catalog_reset", outcome: "started", tag: SEED_PRODUCT_TAG, productsToDelete: before.length })}\n`);

for (const product of before) {
  if (!product.tags.includes(SEED_PRODUCT_TAG)) throw new Error(`Refusing to delete untagged product ${product.id}.`);
  const data = await graphql<{ productDelete: { deletedProductId?: string; userErrors: Array<{ message: string }> } }>(`
    mutation ResetSeedProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) { deletedProductId userErrors { message } }
    }
  `, { input: { id: product.id } });
  if (data.productDelete.userErrors.length || data.productDelete.deletedProductId !== product.id) {
    throw new Error(data.productDelete.userErrors.map((error) => error.message).join("; ") || `Shopify did not confirm deletion of ${product.id}.`);
  }
  process.stdout.write(`${JSON.stringify({ event: "shopify_mutation", operation: "productDelete", outcome: "succeeded", productId: product.id, title: product.title })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 120));
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  if ((await listSeedProducts()).length === 0) break;
  if (attempt === 19) throw new Error("Tagged products were still visible after the reset deletion window.");
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const seeded = await seedCatalog();
const after = await listSeedProducts();
const expectedTitleCounts = new Map<string, number>();
const actualTitleCounts = new Map<string, number>();
for (const product of DEMO_PRODUCTS) expectedTitleCounts.set(product.title, (expectedTitleCounts.get(product.title) ?? 0) + 1);
for (const product of after) actualTitleCounts.set(product.title, (actualTitleCounts.get(product.title) ?? 0) + 1);
const exactReset = after.length === DEMO_PRODUCTS.length && [...expectedTitleCounts].every(([title, count]) => actualTitleCounts.get(title) === count);
if (!exactReset) throw new Error(`Reset verification failed: expected ${DEMO_PRODUCTS.length} tagged products, found ${after.length}.`);

process.stdout.write(`${JSON.stringify({ event: "catalog_reset", outcome: "verified", deleted: before.length, created: seeded.created, taggedProducts: after.length })}\n`);
