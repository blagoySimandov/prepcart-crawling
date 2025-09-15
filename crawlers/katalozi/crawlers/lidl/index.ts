import { City } from "../../constants.js";
import { KataloziCrawler } from "../../index.js";
import { KataloziCrawlerConfig } from "../../types.js";

export interface LidlKataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}
const STORE_ID = "lidl-bg";
const PROJECT_ID = "prepcart-prod";

export class LidlKataloziCrawler extends KataloziCrawler {
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
    const crawler = new LidlKataloziCrawler();
    await crawler.startWithCities([City.Sofia, City.Plovdiv]);
    console.log("✅ Crawler finished successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Crawler failed:", error);
    process.exit(1);
  }
}

main();
