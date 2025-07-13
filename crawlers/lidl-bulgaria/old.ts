import { pdfExists, storePdf } from "../storage.js";
import { extractPdfContent } from "../bila-bulgaria/extract-pdf-content.js";
import fetch from "node-fetch";

const COUNTRY = "bulgaria";
const STORE_ID = "lidl-bg";
const BASE_INDEX = "0";

async function getFlyerPdfUrl(): Promise<string | null> {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}`;
  };

  const startDateIdentifier = formatDate(today);
  const endDateIdentifier = formatDate(nextWeek);
  const flyerIdentifier = `${startDateIdentifier}-${endDateIdentifier}`;

  const url = `https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=${flyerIdentifier}&region_id=0&region_code=0`;
  console.log(`Fetching flyer metadata from: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(
        `No flyer found for identifier ${flyerIdentifier}. Status: ${response.status}`,
      );
      return null;
    }
    const data = (await response.json()) as { flyer?: { pdfUrl?: string } };
    return data?.flyer?.pdfUrl ?? null;
  } catch (error) {
    console.error(`Failed to fetch or parse flyer data`, error);
    return null;
  }
}

async function main() {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + 7);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (await pdfExists(STORE_ID, COUNTRY, startDate, endDate, BASE_INDEX)) {
    console.log(
      `PDF already exists for ${STORE_ID} for the week of ${
        startDate.toISOString().split("T")[0]
      }`,
    );
    process.exit(0);
  }

  const pdfUrl = await getFlyerPdfUrl();
  if (!pdfUrl) {
    console.log("Could not retrieve the PDF URL.");
    process.exit(0);
  }

  console.log(`Found PDF URL: ${pdfUrl}`);

  const content = await extractPdfContent(pdfUrl);
  if (!content) {
    console.log("Failed to extract PDF content.");
    process.exit(1);
  }

  console.log("Storing PDF in the cloud bucket...");
  const uploadResult = await storePdf(
    STORE_ID,
    COUNTRY,
    startDate,
    endDate,
    content,
    BASE_INDEX,
  );
  console.log(`Upload completed: ${uploadResult}`);
}

main().catch((error) => {
  console.error("Lidl crawler failed:", error);
  process.exit(1);
});
