export enum BrochureStore {
  KAUFLAND = "KAUFLAND",
  LIDL = "LIDL",
  BILLA = "BILLA",
}

export const BROCHURE_HREF_PREFIXES: Record<BrochureStore, string> = {
  [BrochureStore.KAUFLAND]:
    "https://katalozi-bg.info/catalogs/promo-katalog-Kaufland/",
  [BrochureStore.LIDL]: "https://katalozi-bg.info/catalogs/promo-katalog-Lidl/",
  [BrochureStore.BILLA]:
    "https://katalozi-bg.info/catalogs/promo-katalog-Billa/",
};
