import { ParsedProduct, Promotion, RawProductTile } from "./types";

/**
 * Extracts and cleans product data from raw product tiles
 * @param rawProducts Array of raw product tile objects
 * @returns Array of cleaned product objects
 */
export function extractProductData(
  rawProducts: RawProductTile[],
): ParsedProduct[] {
  return rawProducts
    .filter((item) => item.type === "PRODUCT_TILE" && item.data)
    .map((item) => {
      const data = item.data;

      let cleanName = data.name || "";
      const lastSlashIndex = cleanName.lastIndexOf(" / ");
      if (lastSlashIndex > 0) {
        cleanName = cleanName.substring(0, lastSlashIndex);
      }

      const rawPromotions: Promotion[] = [];

      if (data.promotion) {
        rawPromotions.push({
          id: data.promotion.promoId || String(data.promotion.promotionId),
          title: data.promotion.title || "",
          type: data.promotion.type || "",
          newPrice: data.promotion.price,
          isPrime: data.promotion.isPrime || false,
        });
      }

      // Handle multiple promotions
      if (data.promotions && Array.isArray(data.promotions)) {
        data.promotions.forEach((promo) => {
          rawPromotions.push({
            id: promo.promoId || String(promo.promotionId),
            title: promo.title || "",
            type: promo.type || "",
            newPrice: promo.price,
            isPrime: promo.isPrime || false,
          });
        });
      }
      const dedupedPromotions = rawPromotions.filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.id === item.id),
      );

      const cleanProduct: ParsedProduct = {
        id: data.id || "",
        sku: data.externalId || "",
        name: cleanName,
        description: (data.description || "").trim(),
        price: data.price || 0,
        currency: data.priceInfo?.currencyCode || "BGN",
        priceDisplay: data.priceInfo?.displayText || `${data.price} BGN`,
        imageUrl: data.imageUrl || "",
        category: data.tracking?.subCategory || "Uncategorized",
        categoryId: data.tracking?.subCategoryId,
        isSponsored: data.sponsored || false,
        isRestricted: data.restricted || false,
        isWeighted: data.tracking?.isWeightedProduct || false,
        saleType: data.tracking?.productSaleType || "piece",
        promotions: dedupedPromotions,
      };

      return cleanProduct;
    });
}
