import { ExtractedData, NavigationLink, CatalogueElement } from "./types.js";

/**
 * Recursively traverses catalogue elements to find navigation links.
 */
function findNavigationLinks(
  elements: readonly CatalogueElement[],
  foundLinks: NavigationLink[],
): void {
  for (const element of elements) {
    if (element.action?.type === "NAVIGATION" && element.action.data.path) {
      foundLinks.push({
        name: element.name,
        uri: element.action.data.path,
      });
    }
    if (element.elements?.length > 0) {
      findNavigationLinks(element.elements, foundLinks);
    }
  }
}

/**
 * Extracts all 'NAVIGATION' type items from the data object.
 * @param dataObject - The input object, correctly typed as ExtractedData.
 * @returns An array of objects, each containing a name and a URI.
 */
export function extractNavigationUris(
  dataObject: ExtractedData,
): NavigationLink[] {
  const navigationLinks: NavigationLink[] = [];

  if (Array.isArray(dataObject?.data)) {
    for (const item of dataObject.data) {
      const catalogue = item?.initialData?.catalogue;

      if (catalogue) {
        findNavigationLinks(catalogue, navigationLinks);
      }
    }
  }

  return navigationLinks;
}
