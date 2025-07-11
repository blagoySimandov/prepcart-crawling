import { extractPdfLinks } from "./extract-pdf-links.js";
import { extractIframeSrc } from "./extract-initial-link.js";
import { decodeDownloadLink } from "./decode-download-link.js";
import { extractDateRange } from "./util.js";
import { extractPdfContent } from "./extract-pdf-content.js";
import { pdfExists, storePdf } from "../storage.js";

const COUNTRY = "bulgaria";
const STORE_ID = "bila-bg";
const START_LINK = "https://www.billa.bg/promocii/sedmichna-broshura";
const BASE_INDEX = "0";

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

const uploadResult = await storePdf(
  STORE_ID,
  COUNTRY,
  startDate,
  endDate,
  content,
  BASE_INDEX,
);
console.log(`Upload completed: ${uploadResult}`);
