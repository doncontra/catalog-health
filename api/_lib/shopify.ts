import type { CatalogProduct, FieldChange } from "../../src/domain/types";
import { assertSeedProductMutation } from "./mutationPolicy";

const API_VERSION = "2026-07";

interface ShopifyToken {
  accessToken: string;
  expiresAt: number;
  shop: string;
  clientId: string;
  scopes: string[];
}

let cachedToken: ShopifyToken | undefined;
let tokenRequest: Promise<ShopifyToken> | undefined;

function shopHost(): string {
  const configured = process.env.SHOPIFY_SHOP?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!configured) throw new Error("Shopify live mode needs SHOPIFY_SHOP on the server.");
  return configured.includes(".") ? configured : `${configured}.myshopify.com`;
}

async function requestClientCredentialsToken(): Promise<ShopifyToken> {
  const shop = shopHost();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Shopify live mode needs SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on the server.");
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || `Shopify authentication failed (${response.status}).`);
  const scopes = (payload.scope ?? "").split(/[ ,]+/).filter(Boolean);
  const missingScopes = ["read_products", "write_products"].filter((scope) =>
    !scopes.includes(scope) && !(scope.startsWith("read_") && scopes.includes(`write_${scope.slice(5)}`)),
  );
  if (missingScopes.length) throw new Error(`Shopify token is missing required scopes: ${missingScopes.join(", ")}. Release and approve an app version containing those scopes.`);
  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 86_399) * 1_000,
    shop,
    clientId,
    scopes,
  };
}

export async function getShopifyAccess(): Promise<{ shop: string; token: string; scopes: string[] }> {
  const shop = shopHost();
  const legacyToken = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (legacyToken) return { shop, token: legacyToken, scopes: ["legacy_token"] };
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  if (cachedToken && cachedToken.shop === shop && cachedToken.clientId === clientId && cachedToken.expiresAt - Date.now() > 300_000) {
    return { shop, token: cachedToken.accessToken, scopes: cachedToken.scopes };
  }
  tokenRequest ??= requestClientCredentialsToken().finally(() => { tokenRequest = undefined; });
  cachedToken = await tokenRequest;
  return { shop, token: cachedToken.accessToken, scopes: cachedToken.scopes };
}

export async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const { shop, token } = await getShopifyAccess();
  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) throw new Error(payload.errors?.map((error) => error.message).join("; ") || `Shopify request failed (${response.status}).`);
  return payload.data;
}

type ShopifyProductNode = {
  id: string; handle: string; title: string; descriptionHtml: string; vendor: string; productType: string;
  category?: { id: string; fullName?: string; name?: string }; tags: string[]; status: CatalogProduct["status"];
  createdAt: string; updatedAt: string; totalInventory: number;
  seo: { title?: string; description?: string };
  media: { nodes: Array<{ id: string; alt?: string; image?: { url: string } }> };
  variants: { nodes: Array<{ id: string; title: string; sku?: string; barcode?: string; price: string; compareAtPrice?: string; inventoryQuantity?: number; inventoryPolicy: string; selectedOptions: Array<{ name: string; value: string }> }> };
  metafields: { nodes: Array<{ key: string; value: string }> };
};

const PRODUCT_FIELDS = `
  id handle title descriptionHtml vendor productType tags status createdAt updatedAt totalInventory
  category { id fullName }
  seo { title description }
  media(first: 20) { nodes { id alt ... on MediaImage { image { url } } } }
  variants(first: 100) { nodes { id title sku barcode price compareAtPrice inventoryQuantity inventoryPolicy selectedOptions { name value } } }
  metafields(first: 20, namespace: "catalog_health") { nodes { key value } }
`;

function mapProduct(node: ShopifyProductNode): CatalogProduct {
  const attributes = Object.fromEntries(node.metafields.nodes.map((field) => [field.key, field.value]));
  return {
    id: node.id, handle: node.handle, title: node.title, descriptionHtml: node.descriptionHtml ?? "", vendor: node.vendor ?? "",
    productType: node.productType ?? "", category: node.category?.fullName ?? node.category?.name ?? "", tags: node.tags ?? [], status: node.status,
    createdAt: node.createdAt, updatedAt: node.updatedAt,
    seo: { title: node.seo?.title ?? "", description: node.seo?.description ?? "" },
    images: node.media.nodes.filter((media) => media.image?.url).map((media) => ({ id: media.id, url: media.image!.url, altText: media.alt ?? "" })),
    variants: node.variants.nodes.map((variant) => ({
      id: variant.id, title: variant.title, sku: variant.sku ?? "", barcode: variant.barcode ?? "", price: Number(variant.price),
      compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : undefined,
      inventoryQuantity: variant.inventoryQuantity ?? 0, continueSelling: variant.inventoryPolicy === "CONTINUE", selectedOptions: variant.selectedOptions,
    })),
    attributes: { material: attributes.material, care: attributes.care, dimensions: attributes.dimensions, intendedUse: attributes.intended_use },
  };
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  let cursor: string | null = null;
  do {
    const data: { products: { nodes: ShopifyProductNode[]; pageInfo: { hasNextPage: boolean; endCursor?: string } } } = await shopifyGraphql(`query Catalog($cursor: String) { products(first: 100, after: $cursor, sortKey: UPDATED_AT) { nodes { ${PRODUCT_FIELDS} } pageInfo { hasNextPage endCursor } } }`, { cursor });
    products.push(...data.products.nodes.map(mapProduct));
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor ?? null : null;
  } while (cursor);
  return products;
}

export async function fetchProduct(productId: string): Promise<CatalogProduct> {
  const data = await shopifyGraphql<{ product: ShopifyProductNode | null }>(`query Product($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`, { id: productId });
  if (!data.product) throw new Error("Shopify product not found.");
  return mapProduct(data.product);
}

async function resolveCategoryId(path: string): Promise<string> {
  if (path.startsWith("gid://")) return path;
  const term = path.split(" > ").at(-1) ?? path;
  const data = await shopifyGraphql<{ taxonomy: { categories: { nodes: Array<{ id: string; fullName: string }> } } }>(`query Category($search: String!) { taxonomy { categories(first: 1, search: $search) { nodes { id fullName } } } }`, { search: term });
  const category = data.taxonomy.categories.nodes[0];
  if (!category) throw new Error(`No Shopify taxonomy category matched “${path}”.`);
  return category.id;
}

interface MutationContext {
  mutationId?: string;
  issueId?: string;
}

async function runLoggedShopifyMutation<T>(
  operation: string,
  productId: string,
  fields: string[],
  context: MutationContext,
  execute: () => Promise<T>,
): Promise<T> {
  const operationId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ event: "shopify_mutation", outcome: "started", operation, operationId, mutationId: context.mutationId, issueId: context.issueId, productId, fields, startedAt }));
  try {
    const result = await execute();
    console.log(JSON.stringify({ event: "shopify_mutation", outcome: "succeeded", operation, operationId, mutationId: context.mutationId, issueId: context.issueId, productId, fields, startedAt, completedAt: new Date().toISOString() }));
    return result;
  } catch (error) {
    console.error(JSON.stringify({ event: "shopify_mutation", outcome: "failed", operation, operationId, mutationId: context.mutationId, issueId: context.issueId, productId, fields, startedAt, failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown error" }));
    throw error;
  }
}

export async function applyProductChanges(productId: string, changes: FieldChange[], context: MutationContext = {}): Promise<void> {
  const product = await fetchProduct(productId);
  assertSeedProductMutation(product, changes);

  const basic: Record<string, unknown> = { id: productId };
  const seo: Record<string, string> = {};
  for (const change of changes) {
    if (["title", "descriptionHtml", "vendor", "productType"].includes(change.field)) basic[change.field] = change.after;
    if (change.field === "seo.title") seo.title = change.after;
    if (change.field === "seo.description") seo.description = change.after;
    if (change.field === "category") basic.category = await resolveCategoryId(change.after);
  }
  if (Object.keys(seo).length) basic.seo = seo;
  if (Object.keys(basic).length > 1) {
    const basicFields = changes.filter((change) => !change.field.startsWith("variant.") && change.field !== "image.altText").map((change) => change.field);
    await runLoggedShopifyMutation("productUpdate", productId, basicFields, context, async () => {
      const data = await shopifyGraphql<{ productUpdate: { userErrors: Array<{ field?: string[]; message: string }> } }>(`mutation UpdateProduct($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { field message } } }`, { product: basic });
      if (data.productUpdate.userErrors.length) throw new Error(data.productUpdate.userErrors.map((error) => error.message).join("; "));
    });
  }
  const variants = changes
    .filter((change) => change.field === "variant.barcode" || change.field === "variant.sku")
    .map((change) => change.field === "variant.barcode"
      ? { id: change.targetId, barcode: change.after }
      : { id: change.targetId, inventoryItem: { sku: change.after } });
  if (variants.length) {
    const variantFields = changes.filter((change) => change.field.startsWith("variant.")).map((change) => change.field);
    await runLoggedShopifyMutation("productVariantsBulkUpdate", productId, variantFields, context, async () => {
      const data = await shopifyGraphql<{ productVariantsBulkUpdate: { userErrors: Array<{ message: string }> } }>(`mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } } }`, { productId, variants });
      if (data.productVariantsBulkUpdate.userErrors.length) throw new Error(data.productVariantsBulkUpdate.userErrors.map((error) => error.message).join("; "));
    });
  }
  for (const change of changes.filter((item) => item.field === "image.altText")) {
    await runLoggedShopifyMutation("productUpdateMedia", productId, [change.field], context, async () => {
      const data = await shopifyGraphql<{ productUpdateMedia: { mediaUserErrors: Array<{ message: string }> } }>(`mutation UpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) { productUpdateMedia(productId: $productId, media: $media) { mediaUserErrors { message } } }`, { productId, media: [{ id: change.targetId, alt: change.after }] });
      if (data.productUpdateMedia.mediaUserErrors.length) throw new Error(data.productUpdateMedia.mediaUserErrors.map((error) => error.message).join("; "));
    });
  }
}
