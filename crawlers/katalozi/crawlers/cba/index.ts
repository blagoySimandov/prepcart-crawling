import { City, BrochureStore } from "../../constants.js";
import { KataloziCrawler } from "../../index.js";
import { KataloziCrawlerConfig } from "../../types.js";

export interface CbaKataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}
const STORE_ID = "cba-bg";
const PROJECT_ID = "prepcart-prod";

export class CbaKataloziCrawler extends KataloziCrawler {
  constructor() {
    const kataloziConfig: KataloziCrawlerConfig = {
      storeId: STORE_ID,
      projectId: PROJECT_ID,
    };
    super(kataloziConfig);
  }
}

async function main() {
  try {
    const crawler = new CbaKataloziCrawler();
    
    // Crawl Sofia for CBA brochures
    await crawler.startWithCities([City.Sofia], BrochureStore.CBA);
    
    console.log("✅ Crawler finished successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Crawler failed:", error);
    process.exit(1);
  }
}

main();