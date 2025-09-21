import { CatalogueElement, NavigationLink, ExtractedData } from "../types";

function findParentNavigationLinks(
  elements: readonly CatalogueElement[],
  foundLinks: NavigationLink[],
): void {
  for (const element of elements) {
    const hasChildren = element.elements && element.elements.length > 0;
    const hasNavigationAction =
      element.action?.type === "NAVIGATION" && element.action.data.path;

    if (hasChildren && hasNavigationAction) {
      foundLinks.push({
        name: element.name,
        uri: element.action.data.path as string,
      });
      findParentNavigationLinks(element.elements, foundLinks);
    } else if (hasChildren) {
      findParentNavigationLinks(element.elements, foundLinks);
    }
  }
}

export function extractNavigationUris(
  dataObject: ExtractedData,
): NavigationLink[] {
  const navigationLinks: NavigationLink[] = [];

  if (Array.isArray(dataObject?.data)) {
    for (const item of dataObject.data) {
      const catalogue = item?.initialData?.catalogue;
      if (catalogue) {
        findParentNavigationLinks(catalogue, navigationLinks);
      }
    }
  }

  return navigationLinks;
}
