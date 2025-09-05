import { City, BrochureStore } from "../../constants.js";
import { KataloziCrawler } from "../../index.js";
import { KataloziCrawlerConfig } from "../../types.js";
import { getApp } from "firebase-admin/app";

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

    await crawler.startWithCities([City.Sofia], BrochureStore.CBA);

    console.log("✅ Crawler finished successfully");
  } catch (error) {
    console.error("❌ Crawler failed:", error);
    throw error;
  } finally {
    // Close Firebase connection to allow process to exit
    try {
      const app = getApp();
      await app.delete();
      console.log("🔥 Firebase connection closed");
    } catch (e) {
      // App might not be initialized or already deleted
    }
  }
}

await main();

