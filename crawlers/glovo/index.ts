import { writeObjectToFile } from "../util.js";
import { GlovoScraper } from "./scraper.js";
import { GlovoFetcher } from "./fetcher.js";

async function main() {
  const webshareApiToken = process.env.WEBSHARE_API_TOKEN;
  if (!webshareApiToken) {
    throw new Error("WEBSHARE_API_TOKEN environment variable is required");
  }

  const fetcher = new GlovoFetcher(webshareApiToken);
  await fetcher.initialize();

  const scraper = new GlovoScraper(fetcher);
  const products = await scraper.scrapeDataViaContentUris();
  writeObjectToFile(products, "products.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
