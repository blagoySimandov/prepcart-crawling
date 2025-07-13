import { extractPdfLinks } from "./extract-pdf-links.js";
import { extractIframeSrc } from "./extract-initial-link.js";
import { decodeDownloadLink } from "./decode-download-link.js";
import { extractDateRange } from "./util.js";
import { extractPdfContent } from "./extract-pdf-content.js";
import { pdfExists, storePdf } from "../storage.js";
import {
  firebaseBrochureService,
  BrochureRecord,
} from "../firebase-service.js";

const COUNTRY = "bulgaria";
const STORE_ID = "bila-bg";
const START_LINK = "https://www.billa.bg/promocii/sedmichna-broshura";
const BASE_INDEX = "0";

/**
 * Check if this brochure has already been crawled
 */
async function checkIfAlreadyCrawled(
  brochureId: string
): Promise<BrochureRecord | null> {
  const existingRecord = await firebaseBrochureService.getBrochureRecord(
    brochureId
  );
  if (existingRecord) {
    console.log(
      `📚 Brochure ${brochureId} has already been crawled on ${existingRecord.crawledAt.toISOString()}`
    );
    console.log(
      `   Store: ${existingRecord.storeId}, Country: ${existingRecord.country}`
    );
    console.log(
      `   Valid period: ${existingRecord.startDate.toDateString()} - ${existingRecord.endDate.toDateString()}`
    );
    if (existingRecord.cloudStoragePath) {
      console.log(`   Stored at: ${existingRecord.cloudStoragePath}`);
    }
  }
  return existingRecord;
}

/**
 * Store brochure information in Firebase after successful crawling
 */
async function storeBrochureInfo(
  brochureId: string,
  startDate: Date,
  endDate: Date,
  cloudStoragePath: string
): Promise<void> {
  const record: BrochureRecord = {
    brochureId,
    storeId: STORE_ID,
    country: COUNTRY,
    crawledAt: new Date(),
    startDate,
    endDate,
    cloudStoragePath,
  };

  await firebaseBrochureService.storeBrochureRecord(record);
  console.log(
    `💾 Brochure information stored in Firebase for ID: ${brochureId}`
  );
}

async function main() {
  try {
    console.log("🚀 Starting Bila Bulgaria crawler...");

    const { src } = await extractIframeSrc(START_LINK);
    if (!src) {
      throw new Error("No iframe found");
    }

    const data = await extractPdfLinks(src);
    console.log(data.slug);
    const parsedDates = extractDateRange(data.slug);
    if (parsedDates == null) {
      console.log("No date range found");
      process.exit(1);
    }

    const { startDate, endDate } = parsedDates;
    const brochureId = `${STORE_ID}-${startDate.getFullYear()}-${String(
      startDate.getMonth() + 1
    ).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

    console.log(`\nProcessing brochure ID: ${brochureId}`);
    console.log(
      `  - Valid from: ${startDate.toISOString().split("T")[0]} to ${
        endDate.toISOString().split("T")[0]
      }`
    );

    console.log(
      `📋 Checking if brochure ${brochureId} has already been crawled...`
    );
    const existingRecord = await checkIfAlreadyCrawled(brochureId);
    if (existingRecord) {
      console.log(
        `⚠️ Skipping crawling - brochure ${brochureId} already processed`
      );
      return;
    }

    console.log(
      `✅ Brochure ${brochureId} not found in database. Proceeding with crawling...`
    );

    const downloadLinkForThePdf = data.config.downloadPdfUrl;

    console.log(decodeDownloadLink(downloadLinkForThePdf));
    console.log(downloadLinkForThePdf);

    const content = await extractPdfContent(downloadLinkForThePdf);

    if (!content) {
      console.log("No content found");
      process.exit(1);
    }

    if (await pdfExists(STORE_ID, COUNTRY, startDate, endDate, BASE_INDEX)) {
      console.log("PDF already exists");
      process.exit(0);
    }

    console.log("  - Storing PDF in the cloud bucket...");
    const uploadResult = await storePdf(
      STORE_ID,
      COUNTRY,
      startDate,
      endDate,
      content,
      BASE_INDEX
    );
    console.log(`  - Upload completed: ${uploadResult}`);

    // Store brochure information in Firebase
    await storeBrochureInfo(brochureId, startDate, endDate, uploadResult);

    console.log(`✅ Bila Bulgaria crawler completed successfully!`);
  } catch (error) {
    console.error("❌ Error in Bila Bulgaria crawler:", error);
    process.exit(1);
  }
}

main();
