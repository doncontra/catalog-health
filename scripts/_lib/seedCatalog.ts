import { shopifyGraphql as graphql } from "../../api/_lib/shopify";
import { SEED_PRODUCT_TAG } from "../../api/_lib/mutationPolicy";
import { DEMO_PRODUCTS } from "../../src/data/demoCatalog";

export interface SeedProductReference {
  id: string;
  title: string;
  tags: string[];
}

export async function listSeedProducts(): Promise<SeedProductReference[]> {
  const products: SeedProductReference[] = [];
  let cursor: string | null = null;
  do {
    const data: { products: { nodes: SeedProductReference[]; pageInfo: { hasNextPage: boolean; endCursor?: string } } } = await graphql(`
      query ExistingSeed($cursor: String) {
        products(first: 100, after: $cursor, query: "tag:${SEED_PRODUCT_TAG}") {
          nodes { id title tags }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { cursor });
    products.push(...data.products.nodes.filter((product) => product.tags.includes(SEED_PRODUCT_TAG)));
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor ?? null : null;
  } while (cursor);
  return products;
}

export async function seedCatalog(): Promise<{ created: number; skipped: number }> {
  const existing = await listSeedProducts();
  const remainingExistingByTitle = new Map<string, number>();
  for (const product of existing) remainingExistingByTitle.set(product.title, (remainingExistingByTitle.get(product.title) ?? 0) + 1);

  let created = 0;
  let skipped = 0;
  for (const [index, product] of DEMO_PRODUCTS.entries()) {
    const remaining = remainingExistingByTitle.get(product.title) ?? 0;
    if (remaining > 0) {
      remainingExistingByTitle.set(product.title, remaining - 1);
      skipped += 1;
      process.stdout.write(`${JSON.stringify({ event: "seed_product", outcome: "skipped_existing", position: index + 1, title: product.title })}\n`);
      continue;
    }

    const data = await graphql<{ productCreate: { product?: { id: string; variants: { nodes: Array<{ id: string }> } }; userErrors: Array<{ message: string }> } }>(`
      mutation SeedProduct($product: ProductCreateInput!) {
        productCreate(product: $product) { product { id variants(first: 1) { nodes { id } } } userErrors { message } }
      }
    `, { product: { title: product.title, descriptionHtml: product.descriptionHtml, vendor: product.vendor, productType: product.productType, tags: [...product.tags.filter((tag) => tag !== SEED_PRODUCT_TAG), SEED_PRODUCT_TAG], status: product.status, seo: product.seo } });
    if (data.productCreate.userErrors.length || !data.productCreate.product) throw new Error(data.productCreate.userErrors.map((error) => error.message).join("; ") || `Product ${product.title} was not created.`);
    created += 1;
    process.stdout.write(`${JSON.stringify({ event: "shopify_mutation", operation: "productCreate", outcome: "succeeded", productId: data.productCreate.product.id, title: product.title })}\n`);

    const variant = product.variants[0];
    const variantId = data.productCreate.product.variants.nodes[0]?.id;
    if (variantId) {
      const variantData = await graphql<{ productVariantsBulkUpdate: { userErrors: Array<{ message: string }> } }>(`
        mutation SeedVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
        }
      `, {
        productId: data.productCreate.product.id,
        variants: [{
          id: variantId,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice ?? null,
          inventoryItem: { sku: variant.sku || null },
          barcode: variant.barcode || null,
          inventoryPolicy: variant.continueSelling ? "CONTINUE" : "DENY",
        }],
      });
      if (variantData.productVariantsBulkUpdate.userErrors.length) throw new Error(variantData.productVariantsBulkUpdate.userErrors.map((error) => error.message).join("; "));
      process.stdout.write(`${JSON.stringify({ event: "shopify_mutation", operation: "productVariantsBulkUpdate", outcome: "succeeded", productId: data.productCreate.product.id, variantId })}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return { created, skipped };
}
