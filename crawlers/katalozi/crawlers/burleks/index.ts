import { City } from "../../constants.js";
import { KataloziCrawler } from "../../index.js";
import { KataloziCrawlerConfig } from "../../types.js";

export interface BurleksKataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}
const STORE_ID = "burleks-bg";
const PROJECT_ID = "prepcart-prod";

export class BurleksKataloziCrawler extends KataloziCrawler {
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
    const crawler = new BurleksKataloziCrawler();
    await crawler.startWithCities([
      City.Sofia,
      City.Plovdiv,
      City.Varna,
      City.Burgas,
      City.Ruse,
      City.StaraZagora,
      City.Razgrad,
    ]);
    console.log("✅ Crawler finished successfully");
  } catch (error) {
    console.error("❌ Crawler failed:", error);
    throw error;
  }
}

await main();
