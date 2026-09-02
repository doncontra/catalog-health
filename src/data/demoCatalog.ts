import type { CatalogProduct, CatalogVariant } from "../domain/types";

const PRODUCT_NAMES = [
  "Cloudline Trail Runner",
  "Ridgeline Waterproof Boot",
  "Meridian Day Pack",
  "Alpine Layer Jacket",
  "Transit Insulated Bottle",
  "Summit Merino Tee",
  "Drift Camp Mug",
  "Waypoint Hiking Pant",
  "Field Canvas Tote",
  "Switchback Running Vest",
];

const MATERIALS = ["breathable recycled mesh", "full-grain leather", "recycled ripstop nylon", "water-resistant shell fabric", "stainless steel"];

function variants(index: number, healthy: boolean): CatalogVariant[] {
  const variantCount = index % 4 === 0 ? 2 : 1;
  return Array.from({ length: variantCount }, (_, variantIndex) => ({
    id: `gid://shopify/ProductVariant/demo-${index}-${variantIndex}`,
    title: variantCount > 1 ? (variantIndex === 0 ? "Slate / 9" : "Sand / 10") : "Default Title",
    sku: healthy || index % 5 !== 0 ? `NS-${String(index).padStart(3, "0")}-${variantIndex + 1}` : "",
    barcode: healthy ? "012345678905" : index % 2 === 0 ? "" : `12345${index}`,
    price: index % 11 === 0 && !healthy ? 0 : 79 + (index % 8) * 10,
    compareAtPrice: index % 7 === 0 ? 149 : undefined,
    inventoryQuantity: index % 9 === 0 && !healthy ? 0 : 12 + index,
    continueSelling: false,
    selectedOptions: variantCount > 1
      ? [{ name: index % 8 === 0 && !healthy ? "Title" : "Color", value: variantIndex === 0 ? "Slate" : "Sand" }]
      : [{ name: "Title", value: "Default Title" }],
  }));
}

function makeProduct(index: number): CatalogProduct {
  const healthy = index >= 25;
  const familyName = PRODUCT_NAMES[index % PRODUCT_NAMES.length];
  const fragmented = index >= 12 && index <= 14;
  const baseTitle = fragmented ? `Aurora Fleece ${["Blue", "Red", "Black"][index - 12]}` : `${familyName}${index >= 10 ? ` ${Math.floor(index / 10) + 1}` : ""}`;
  const title = index === 23 ? "Meridian Day Pack 3" : baseTitle;
  const material = MATERIALS[index % MATERIALS.length];
  const productType = /Runner|Boot/.test(title) ? "Trail Running Shoes" : /Pack|Tote/.test(title) ? "Outdoor Bags" : /Bottle|Mug/.test(title) ? "Drinkware" : "Outdoor Apparel";
  const description = healthy
    ? `<p>${title} is designed for everyday outdoor use with ${material}. It offers a durable, lightweight build, straightforward care, and practical details for commuting, travel, and weekends outside. Multiple options are grouped here so shoppers can compare the right size and color.</p>`
    : index % 6 === 0
      ? ""
      : index % 6 === 1
        ? `<p>Meet ${title}. Comfortable, dependable, and ready for the trail.</p>`
        : index % 6 === 2
          ? `<p>GO ANYWHERE! FEEL UNSTOPPABLE! THIS CHANGES EVERYTHING!</p>`
          : `<p>${title} uses ${material} for comfortable daily use and dependable performance.</p>`;
  const now = new Date();
  const updatedAt = new Date(now.getTime() - (index % 10 === 4 && !healthy ? 55 : 4) * 86_400_000).toISOString();
  return {
    id: `gid://shopify/Product/demo-${index + 1}`,
    handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    title: index === 20 ? "CLOUDLINE-TRAIL-RUNNER-3" : index === 21 ? "RIDGELINE WATERPROOF BOOT THREE EXPEDITION EDITION WITH EXTRA LONG PRODUCT TITLE" : title,
    descriptionHtml: description,
    vendor: healthy || index % 4 !== 0 ? "Northstar Supply" : "",
    productType: healthy || index % 5 !== 0 ? productType : "Apparel",
    category: healthy || index % 3 !== 0 ? (/Runner|Boot/.test(title) ? "Apparel & Accessories > Shoes" : productType) : "",
    tags: index % 13 === 0 ? ["featured"] : [],
    status: index % 10 === 4 ? "DRAFT" : "ACTIVE",
    createdAt: new Date(now.getTime() - 120 * 86_400_000).toISOString(),
    updatedAt,
    seo: {
      title: healthy || index % 4 !== 1 ? `${title} | Northstar Supply` : "",
      description: healthy || index % 4 !== 2
        ? (!healthy && index % 7 === 3 ? "Shop this product from Northstar Supply." : `Explore ${title}, made with ${material} for everyday outdoor use. Shop available options from Northstar Supply.`)
        : "",
    },
    images: index % 8 === 0 && !healthy ? [] : [{
      id: `gid://shopify/MediaImage/demo-${index + 1}`,
      url: `https://cdn.shopify.com/s/files/1/0000/0001/products/demo-${index + 1}.jpg`,
      altText: healthy || index % 3 !== 1 ? `${title} product view` : "",
    }],
    variants: variants(index + 1, healthy),
    attributes: healthy || index % 3 === 2
      ? { material, care: "Spot clean and air dry", dimensions: "Standard fit", intendedUse: /Runner/.test(title) ? "trail running" : "everyday outdoor use" }
      : { intendedUse: /Runner/.test(title) ? "trail running" : undefined },
  };
}

export const DEMO_PRODUCTS: CatalogProduct[] = Array.from({ length: 30 }, (_, index) => makeProduct(index));

export function freshDemoCatalog(): CatalogProduct[] {
  return structuredClone(DEMO_PRODUCTS);
}
