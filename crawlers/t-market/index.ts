import { BroshuraBgCrawler } from "../broshura-bg-crawler.js";

const COUNTRY = "bulgaria";
const STORE_ID = "tmarket-bg";
const STORE_SLUG = "t-market";
const IMAGE_SUFFIX = "768x1334";
const BASE_INDEX = "0";

async function main() {
  try {
    console.log("🏪 Starting T-Market Bulgaria crawler...");

    const crawler = new BroshuraBgCrawler({
      storeId: STORE_ID,
      country: COUNTRY,
      storeSlug: STORE_SLUG,
      imageSuffix: IMAGE_SUFFIX,
      baseIndex: BASE_INDEX,
    });

    // Use the new Firebase-enabled crawler with cloud storage
    const result = await crawler.crawlAndSaveWithCloudStorage();

    console.log(`🎉 T-Market crawler completed successfully!`);
    console.log(`📄 Local file: ${result.filename}`);
    if (result.cloudPath) {
      console.log(`☁️ Cloud storage: ${result.cloudPath}`);
    }
  } catch (error) {
    console.error("❌ Error in T-Market crawler:", error);
    process.exit(1);
  }
}

main();
