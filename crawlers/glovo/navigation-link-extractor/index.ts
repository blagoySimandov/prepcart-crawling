import { CatalogueElement, NavigationLink, ExtractedData } from "../types";

/**
 * Recursively traverses catalogue elements to find leaf navigation links.
 * Only extracts navigation links that don't have children.
 */
function findLeafNavigationLinks(
  elements: readonly CatalogueElement[],
  foundLinks: NavigationLink[],
): void {
  for (const element of elements) {
    const hasChildren = element.elements && element.elements.length > 0;
    const hasNavigationAction =
      element.action?.type === "NAVIGATION" && element.action.data.path;

    if (hasChildren) {
      findLeafNavigationLinks(element.elements, foundLinks);
    } else if (hasNavigationAction) {
      foundLinks.push({
        name: element.name,
        uri: element.action.data.path as string,
      });
    }
  }
}

/**
 * Extracts only leaf 'NAVIGATION' type items from the data object.
 * Parent navigation items with children are excluded.
 * @param dataObject - The input object, correctly typed as ExtractedData.
 * @returns An array of objects, each containing a name and a URI, representing leaf navigation links only.
 */
export function extractNavigationUris(
  dataObject: ExtractedData,
): NavigationLink[] {
  const navigationLinks: NavigationLink[] = [];

  if (Array.isArray(dataObject?.data)) {
    for (const item of dataObject.data) {
      const catalogue = item?.initialData?.catalogue;
      if (catalogue) {
        findLeafNavigationLinks(catalogue, navigationLinks);
      }
    }
  }

  return navigationLinks;
}
