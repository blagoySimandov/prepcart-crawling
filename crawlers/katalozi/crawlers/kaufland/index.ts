import { City, BrochureStore } from "../../constants.js";
import { KataloziCrawler } from "../../index.js";
import { KataloziCrawlerConfig } from "../../types.js";

export interface KauflandKataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}
const STORE_ID = "kaufland-bg";
const PROJECT_ID = "prepcart-prod";

export class KauflandKataloziCrawler extends KataloziCrawler {
  constructor() {
    const kataloziConfig: KataloziCrawlerConfig = {
      storeId: STORE_ID,
      projectId: PROJECT_ID,
    };
    super(kataloziConfig);
  }

  // Override to add Kaufland-specific logging
  async startWithCities(
    cities: City[],
    store: BrochureStore,
    storeInCloud?: boolean,
  ): Promise<void> {
    console.log("🛒 KAUFLAND Multi-City Crawler Starting...");
    console.log(`📍 Target cities: ${cities.join(', ')}`);
    
    // Call parent method
    await super.startWithCities(cities, store, storeInCloud);
    
    console.log("🛒 KAUFLAND Multi-City Crawler Complete!");
  }
}

async function main() {
  try {
    const crawler = new KauflandKataloziCrawler();
    
    // Example: Crawl all major Bulgarian cities at once
    await crawler.startWithCities([
      City.Sofia, 
      City.Plovdiv, 
      City.Varna, 
      City.Burgas, 
      City.Ruse
    ], BrochureStore.KAUFLAND);
    
    console.log("✅ Crawler finished successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Crawler failed:", error);
    process.exit(1);
  }
}

main();
