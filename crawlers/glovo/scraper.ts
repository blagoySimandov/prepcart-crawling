import { CITY_CODE, DEFAULT_GLOVO_URL } from "./constants";
import { GlovoFetcher } from "./fetcher";
import { parseBodyElements } from "./parser";
import { ParsedProduct } from "./types";
import { randomDelay, writeObjectToFile } from "../util";
import { extractNavigationUris } from "./navigation-link-extractor";

export interface GlovoScraperConfig {
  minDelay?: number;
  maxDelay?: number;
  concurrency?: number;
}

export class GlovoScraper {
  static readonly DEFAULT_CONCURRENCY = 10;

  private fetcher: GlovoFetcher;
  private minDelay: number;
  private maxDelay: number;
  private concurrency: number;

  constructor(fetcher: GlovoFetcher, config: GlovoScraperConfig = {}) {
    this.fetcher = fetcher;
    this.minDelay = config.minDelay ?? 200;
    this.maxDelay = config.maxDelay ?? 500;
    this.concurrency = config.concurrency ?? GlovoScraper.DEFAULT_CONCURRENCY;
  }

  async scrapeDataViaContentUris(): Promise<ParsedProduct[]> {
    const response = await this.fetcher.fetchAndParseHtml(DEFAULT_GLOVO_URL);
    const products: ParsedProduct[] = [];
    const navigationLinks = extractNavigationUris(response);
    writeObjectToFile(navigationLinks, "navigation-links.json");

    const processLink = async (link: { uri: string }) => {
      const linkProducts: ParsedProduct[] = [];
      await this.processContentUri(link.uri, linkProducts);
      return linkProducts;
    };

    const results = await this.processConcurrently(
      navigationLinks,
      processLink,
    );
    results.forEach((linkProducts) => products.push(...linkProducts));

    return products;
  }

  private async processContentUri(
    contentUri: string,
    products: ParsedProduct[],
  ): Promise<void> {
    await randomDelay(this.minDelay, this.maxDelay);
    const response = await this.fetcher.requestContentUri(
      contentUri,
      CITY_CODE,
    );

    if (!response) return;

    const body = response.data.data.body;
    const nestedContentUris: string[] = [];

    parseBodyElements(body, nestedContentUris, products);
    console.log(`Found ${nestedContentUris.length} nested content uris`);

    for (const nestedUri of nestedContentUris) {
      await this.processContentUri(nestedUri, products);
    }
  }

  private async processConcurrently<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += this.concurrency) {
      const batch = items.slice(i, i + this.concurrency);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
    }

    return results;
  }
}
