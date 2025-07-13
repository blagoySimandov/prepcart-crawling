process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { BroshuraBgCrawler } from "../broshura-bg-crawler.js";

const COUNTRY = "bulgaria";
const STORE_ID = "lidl-bg";
const STORE_SLUG = "lidl";
const IMAGE_SUFFIX = "755x1298";
const BASE_INDEX = "0";

async function main() {
  try {
    console.log("🏪 Starting Fantastico Bulgaria crawler...");

    const crawler = new BroshuraBgCrawler({
      storeId: STORE_ID,
      country: COUNTRY,
      storeSlug: STORE_SLUG,
      imageSuffix: IMAGE_SUFFIX,
      baseIndex: BASE_INDEX,
    });

    const result = await crawler.crawlAndSaveWithCloudStorage();

    console.log(`🎉 Fantastico crawler completed successfully!`);
    console.log(`📄 Local file: ${result.filename}`);
    if (result.cloudPath) {
      console.log(`☁️ Cloud storage: ${result.cloudPath}`);
    }
  } catch (error) {
    console.error("❌ Error in fantastico-bulgaria crawler:", error);
    process.exit(1);
  }
}

main();
