import { describe, expect, it } from "vitest";
import { freshDemoCatalog } from "../../src/data/demoCatalog";
import type { FieldChange } from "../../src/domain/types";
import { assertSeedProductMutation, MutationPolicyError } from "./mutationPolicy";

function seededProduct() {
  const product = freshDemoCatalog().find((candidate) => candidate.images.length > 0 && candidate.variants.length > 0)!;
  product.tags.push("catalog-health-seed");
  return product;
}

describe("live mutation policy", () => {
  it("rejects products without the seed tag", () => {
    const product = freshDemoCatalog()[0];
    const changes: FieldChange[] = [{ field: "title", before: product.title, after: `${product.title} updated` }];

    expect(() => assertSeedProductMutation(product, changes)).toThrowError(
      new MutationPolicyError("Only products tagged catalog-health-seed can be modified.", 403),
    );
  });

  it("accepts variant and image IDs owned by the seeded product", () => {
    const product = seededProduct();
    const changes: FieldChange[] = [
      { field: "variant.sku", before: product.variants[0].sku, after: "SAFE-SKU", targetId: product.variants[0].id },
      { field: "image.altText", before: product.images[0].altText, after: "Updated alt text", targetId: product.images[0].id },
    ];

    expect(() => assertSeedProductMutation(product, changes)).not.toThrow();
  });

  it.each([
    { field: "variant.barcode", targetId: "gid://shopify/ProductVariant/other", message: "The selected variant does not belong to the seeded product." },
    { field: "image.altText", targetId: "gid://shopify/MediaImage/other", message: "The selected image does not belong to the seeded product." },
  ] as const)("rejects an unrelated $field target", ({ field, targetId, message }) => {
    const product = seededProduct();
    const changes: FieldChange[] = [{ field, before: "", after: "updated", targetId }];

    expect(() => assertSeedProductMutation(product, changes)).toThrowError(new MutationPolicyError(message, 400));
  });
});
