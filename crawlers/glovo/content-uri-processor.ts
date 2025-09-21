import { parseBodyElements } from "./parser.js";
import { randomDelay } from "./delay-util.js";
import { GlovoFetcher } from "./fetcher.js";
import { ParsedProduct } from "./types.js";

export async function processContentUris(
  contentUris: string[],
  cityCode: string,
  products: ParsedProduct[],
  fetcher: GlovoFetcher,
): Promise<void> {
  for (const [index, contentUri] of contentUris.entries()) {
    try {
      await randomDelay(500, 1500);
      const response = await fetcher.requestContentUri(contentUri, cityCode);
      const body = response.data.data.body;

      const newContentUris: string[] = [];
      parseBodyElements(body, newContentUris, products);
    } catch (error) {
      console.error(`Error processing contentUri ${index}:`, error);
    }
  }
}
