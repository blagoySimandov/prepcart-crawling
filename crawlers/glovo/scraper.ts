import { CITY_CODE, DEFAULT_GLOVO_URL } from "./constants.js";
import { GlovoFetcher } from "./fetcher.js";
import { parseBodyElements } from "./parser.js";
import { extractNavigationUris } from "./navigation-links-extractor.js";
import { randomDelay } from "./delay-util.js";
import { ParsedProduct } from "./types.js";
import { writeObjectToFile } from "../util.js";

export interface GlovoScraperConfig {
  minDelay?: number;
  maxDelay?: number;
}

export class GlovoScraper {
  private fetcher: GlovoFetcher;
  private minDelay: number;
  private maxDelay: number;

  constructor(fetcher: GlovoFetcher, config: GlovoScraperConfig = {}) {
    this.fetcher = fetcher;
    this.minDelay = config.minDelay ?? 200;
    this.maxDelay = config.maxDelay ?? 500;
  }

  async scrapeDataViaContentUris(): Promise<ParsedProduct[]> {
    const response = await this.fetcher.fetchAndParseHtml(DEFAULT_GLOVO_URL); //Go to some page to get the navigation links from the sidebar
    const products: ParsedProduct[] = [];
    const navigationLinks = extractNavigationUris(response);
    writeObjectToFile(navigationLinks, "navigation-links.json");

    for (const link of navigationLinks) {
      console.log("VISITING NAVIGATION URI: ", link.uri);
      await randomDelay(this.minDelay, this.maxDelay);
      const response = await this.fetcher.requestContentUri(
        link.uri,
        CITY_CODE,
      );
      const body = response.data.data.body;
      writeObjectToFile(body, "from-navigation.json");
      parseBodyElements(body, [], products);
    }

    return products;
  }
}
