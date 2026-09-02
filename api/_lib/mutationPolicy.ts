import type { CatalogProduct, FieldChange } from "../../src/domain/types";

export const SEED_PRODUCT_TAG = "catalog-health-seed";

export class MutationPolicyError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 503) {
    super(message);
    this.name = "MutationPolicyError";
  }
}

export function requireLiveWritesEnabled(value = process.env.ALLOW_LIVE_WRITES): void {
  if (value !== "true") {
    throw new MutationPolicyError("Live catalog writes are temporarily disabled.", 503);
  }
}

export function assertSeedProductMutation(product: CatalogProduct, changes: FieldChange[]): void {
  if (!product.tags.includes(SEED_PRODUCT_TAG)) {
    throw new MutationPolicyError(`Only products tagged ${SEED_PRODUCT_TAG} can be modified.`, 403);
  }

  const variantIds = new Set(product.variants.map((variant) => variant.id));
  const imageIds = new Set(product.images.map((image) => image.id));

  for (const change of changes) {
    if (change.field === "variant.barcode" || change.field === "variant.sku") {
      if (!change.targetId || !variantIds.has(change.targetId)) {
        throw new MutationPolicyError("The selected variant does not belong to the seeded product.", 400);
      }
    }
    if (change.field === "image.altText") {
      if (!change.targetId || !imageIds.has(change.targetId)) {
        throw new MutationPolicyError("The selected image does not belong to the seeded product.", 400);
      }
    }
  }
}
