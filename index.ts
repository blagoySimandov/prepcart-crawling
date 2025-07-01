import FireCrawlApp from "@mendable/firecrawl-js";
import { extractPdfLinks } from "./extract-pdf-links.js";

const app = new FireCrawlApp({ apiKey: "fc-e4e262b5d22849f4a986b7c1f54f91a6" });
const scrapeResult = await app.scrapeUrl(
  "https://www.billa.bg/promocii/sedmichna-broshura",
  {
    formats: ["links"],
    onlyMainContent: true,
  },
);

interface ResultsWithLinks {
  links: string[];
}
const possibleDownloadLinks = (scrapeResult as ResultsWithLinks).links.filter(
  (link) => link.includes("#downloadAsPdf"),
);
const data = await extractPdfLinks(possibleDownloadLinks);
console.log(data.config.downloadPdfUrl);
