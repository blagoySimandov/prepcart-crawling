import { pdfExists, storePdf } from "../storage.js";
import { extractPdfContent } from "../bila-bulgaria/extract-pdf-content.js";
import {
  firebaseBrochureService,
  BrochureRecord,
} from "../firebase-service.js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const COUNTRY = "bulgaria";
const STORE_ID = "kaufland-bg";
const START_LINK = "https://www.kaufland.bg/broshuri.html";

interface BrochureInfo {
  downloadUrl: string;
  startDate: Date;
  endDate: Date;
  id: string;
}

function parseDatesFromDetail(
  detail: string
): { startDate: Date; endDate: Date } | null {
  const dateMatch = detail.match(
    /(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/
  );
  if (!dateMatch || dateMatch.length < 3) return null;

  const parseDate = (dateStr: string): Date => {
    const [day, month, year] = dateStr.split(".");
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  };

  const startDate = parseDate(dateMatch[1]);
  const endDate = parseDate(dateMatch[2]);
  endDate.setUTCHours(23, 59, 59, 999);

  return { startDate, endDate };
}

function extractIdFromUrl(url: string): string | null {
  const idMatch = url.match(/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})/);
  return idMatch ? idMatch[1] : null;
}

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
  console.log(`Fetching main offers page from: ${START_LINK}`);
  const response = await fetch(START_LINK);
  const html = await response.text();
  const $ = cheerio.load(html);

  const foundBrochures: BrochureInfo[] = [];
  $("div.m-flyer-tile").each((_, el) => {
    const element = $(el);
    const downloadUrl = element.attr("data-download-url");
    const detail = element.attr("data-aa-detail");

    if (downloadUrl && detail) {
      const dates = parseDatesFromDetail(detail);
      const id = extractIdFromUrl(downloadUrl);
      if (dates && id) {
        foundBrochures.push({ ...dates, downloadUrl, id });
      }
    }
  });

  console.log(`Found ${foundBrochures.length} brochures on the page.`);
  for (const brochure of foundBrochures) {
    console.log(
      `  - ID: ${brochure.id}, URL: ${brochure.downloadUrl.substring(0, 60)}...`
    );
  }

  const now = new Date();
  const validBrochures = foundBrochures.filter(
    (b) => now >= b.startDate && now <= b.endDate
  );
  console.log(`\nFound ${validBrochures.length} currently valid brochures.`);

  if (validBrochures.length === 0) {
    console.log("No valid brochures to process.");
    process.exit(0);
  }

  for (const brochure of validBrochures) {
    const { downloadUrl, startDate, endDate, id } = brochure;
    console.log(`\nProcessing valid brochure ID: ${id}`);
    console.log(
      `  - Valid from: ${startDate.toISOString().split("T")[0]} to ${
        endDate.toISOString().split("T")[0]
      }`
    );

    console.log(`📋 Checking if brochure ${id} has already been crawled...`);
    const existingRecord = await checkIfAlreadyCrawled(id);
    if (existingRecord) {
      console.log(`⚠️ Skipping crawling - brochure ${id} already processed`);
      continue;
    }

    console.log(
      `✅ Brochure ${id} not found in database. Proceeding with crawling...`
    );

    if (await pdfExists(STORE_ID, COUNTRY, startDate, endDate, id)) {
      console.log(`  - PDF already exists for ID ${id}. Skipping.`);
      continue;
    }

    console.log("  - Downloading PDF content...");
    const content = await extractPdfContent(downloadUrl);
    if (!content) {
      console.error(
        `  - Failed to download or extract PDF content for ID ${id}.`
      );
      continue;
    }

    console.log("  - Storing PDF in the cloud bucket...");
    try {
      const uploadResult = await storePdf(
        STORE_ID,
        COUNTRY,
        startDate,
        endDate,
        content,
        id
      );
      console.log(`  - Upload completed: ${uploadResult}`);

      // Store brochure information in Firebase
      await storeBrochureInfo(id, startDate, endDate, uploadResult);
    } catch (error) {
      console.error(`  - Failed to upload PDF for ID ${id}.`, error);
    }
  }
}

main().catch((error) => {
  console.error("Kaufland crawler failed:", error);
  process.exit(1);
});
