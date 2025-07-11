import { pdfExists, storePdf } from "../storage.js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import PDFDocument from "pdfkit";
import { Writable } from "stream";
import { Buffer } from "node:buffer";

const COUNTRY = "bulgaria";
const STORE_ID = "cba-bg";
const START_LINK =
  "https://cbabg.com/%D0%B1%D1%80%D0%BE%D1%88%D1%83%D1%80%D0%B0";

function parseDatesAndIdFromTitle(
  title: string
): { startDate: Date; endDate: Date; id: string } | null {
  const dateMatch = title.match(/(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{4})/);
  if (!dateMatch || dateMatch.length < 6) return null;

  const [, startDay, startMonth, endDay, endMonth, year] = dateMatch;

  const startDate = new Date(
    Date.UTC(Number(year), Number(startMonth) - 1, Number(startDay))
  );
  const endDate = new Date(
    Date.UTC(Number(year), Number(endMonth) - 1, Number(endDay))
  );
  endDate.setUTCHours(23, 59, 59, 999);

  const id = `${year}-${startMonth}-${startDay}`;

  return { startDate, endDate, id };
}

async function createPdfFromImages(imageUrls: string[]): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: true, margin: 0 });
    const buffers: Buffer[] = [];

    const stream = new Writable({
      write(chunk, encoding, callback) {
        buffers.push(chunk);
        callback();
      },
    });

    doc.pipe(stream);

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          console.warn(`  - Failed to download image: ${imageUrl}`);
          continue;
        }
        const imageBuffer = await response.arrayBuffer();

        if (i > 0) {
          doc.addPage({ margin: 0 });
        }

        doc.image(Buffer.from(imageBuffer), 0, 0, {
          fit: [doc.page.width, doc.page.height],
          align: "center",
          valign: "center",
        });
      } catch (error) {
        console.warn(`  - Error processing image ${imageUrl}:`, error);
      }
    }

    doc.end();

    stream.on("finish", () => {
      resolve(Buffer.concat(buffers));
    });

    stream.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log(`Fetching main brochure page from: ${START_LINK}`);
  const mainResponse = await fetch(START_LINK);
  const mainHtml = await mainResponse.text();
  const $ = cheerio.load(mainHtml);

  const brochureTitleElement = $("h3.brochures_title").first();
  const brochureTitleHtml = brochureTitleElement.html();
  const brochureTitleText = brochureTitleElement.text().trim();

  if (!brochureTitleHtml) {
    console.error("Could not find brochure title element. Exiting.");
    process.exit(1);
  }

  const linkMatch = brochureTitleHtml.match(/href="([^"]+)"/);
  const brochureLink = linkMatch ? linkMatch[1] : null;

  if (!brochureLink) {
    console.error("Could not find brochure link. Exiting.");
    process.exit(1);
  }

  const dateInfo = parseDatesAndIdFromTitle(brochureTitleText);

  if (!dateInfo) {
    console.error("Could not parse date information from title. Exiting.");
    process.exit(1);
  }

  console.log(`Found brochure link: ${brochureLink}`);

  const { startDate, endDate, id } = dateInfo;
  console.log(`\nProcessing brochure ID: ${id}`);
  console.log(
    `  - Valid from: ${startDate.toISOString().split("T")[0]} to ${
      endDate.toISOString().split("T")[0]
    }`
  );

  if (await pdfExists(STORE_ID, COUNTRY, startDate, endDate, id)) {
    console.log(`  - PDF already exists for ID ${id}. Skipping.`);
    return;
  }

  console.log(`Fetching brochure content from: ${brochureLink}`);
  const response = await fetch(brochureLink);
  const html = await response.text();

  const imageIdRegex = /r_[a-f0-9_]+\.jpg/g;
  const matches = html.match(imageIdRegex);

  if (!matches) {
    console.error("Could not find brochure image IDs. Exiting.");
    process.exit(1);
  }

  const uniqueImageIds = [...new Set(matches)];
  const imageUrls = uniqueImageIds.map(
    (id) => `https://cbabg.com/assets/brochures/large/${id}`
  );

  console.log(`Found ${imageUrls.length} brochure pages.`);

  console.log("  - Creating PDF from images...");
  const pdfBuffer = await createPdfFromImages(imageUrls);

  if (pdfBuffer.length === 0) {
    console.error(`  - Failed to create PDF for ID ${id}.`);
    return;
  }

  console.log("  - Storing PDF in the cloud bucket...");
  try {
    const uploadResult = await storePdf(
      STORE_ID,
      COUNTRY,
      startDate,
      endDate,
      pdfBuffer.toString("base64"),
      id
    );
    console.log(`  - Upload completed: ${uploadResult}`);
  } catch (error) {
    console.error(`  - Failed to upload PDF for ID ${id}.`, error);
  }
}

main().catch((error) => {
  console.error("CBA crawler failed:", error);
  process.exit(1);
});
