import { extractProductData } from "./clean-model";
import { BodyRaw, ParsedProduct, RawProductTile } from "./types";
import { BODY_TYPES } from "./constants";

export function parseBodyElements(
  bodyArr: BodyRaw[],
  contentUris: string[],
  products: ParsedProduct[],
): void {
  if (!bodyArr) return;

  for (const body of bodyArr) {
    if (body.type === BODY_TYPES.GRID) {
      extractGridProducts(body, products);
    }

    if (body.type === BODY_TYPES.CONTENT_PLACEHOLDER && body.data.contentUri) {
      contentUris.push(body.data.contentUri);
    }
  }
}

function extractGridProducts(body: BodyRaw, products: ParsedProduct[]): void {
  const elements = body?.data?.elements;
  if (!elements) return;

  const cleanedProducts = extractProductData(elements as RawProductTile[]);
  products.push(...cleanedProducts);
}
